from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from django.utils import timezone

from .models import AuditActivity, AuditLogin, OtpCode, UserProfile


def _login_response(user):
    """Issue (or fetch) the mobile-app token and attach it to the user
    payload. Web clients ignore the field; mobile stores it and sends
    `Authorization: Token <key>` on subsequent requests."""
    token, _ = Token.objects.get_or_create(user=user)
    data = UserSerializer(user).data
    data['token'] = token.key
    return Response(data)
from .permissions import IsSuperAdmin
from .serializers import (
    AdminUserWriteSerializer,
    AuditActivitySerializer,
    AuditLoginSerializer,
    UserSerializer,
)
from .services import audit
from .services.google import GoogleVerifyError, verify_google_credential
from .services.otp import generate_otp, make_otp_call, normalize_phone, verify_otp


# ─────────────────────────────────────────────────────────────────────────
# Public auth
# ─────────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(request, username=username, password=password)
    if user is None:
        audit.log_login(request=request, method='password', success=False,
                        user_label=username or '')
        return Response({'error': 'שם משתמש או סיסמה שגויים'},
                        status=status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        audit.log_login(request=request, method='password', success=False,
                        user=user, user_label=user.email)
        return Response({'error': 'החשבון מושבת'}, status=status.HTTP_403_FORBIDDEN)
    login(request, user)
    audit.log_login(request=request, method='password', success=True, user=user)
    return _login_response(user)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def google_login_view(request):
    credential = request.data.get('credential')
    if not credential:
        return Response({'error': 'נדרש credential'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        info = verify_google_credential(credential)
    except GoogleVerifyError as exc:
        audit.log_login(request=request, method='google', success=False, user_label='')
        return Response({'error': f'אימות Google נכשל: {exc}'},
                        status=status.HTTP_401_UNAUTHORIZED)

    email = info['email']
    name = info['name']

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        if email not in settings.GOOGLE_SUPER_ADMIN_EMAILS:
            audit.log_login(request=request, method='google', success=False,
                            user_label=email)
            return Response({'error': 'לא נמצא חשבון לאימייל זה. יש לפנות למנהל המערכת.'},
                            status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            user = User.objects.create_user(
                username=email, email=email,
                first_name=(name.split(' ', 1)[0] if name else '')[:30],
                last_name=(name.split(' ', 1)[1] if name and ' ' in name else '')[:30],
            )
            user.set_unusable_password()
            user.save()
            UserProfile.objects.update_or_create(
                user=user,
                defaults={'role': UserProfile.Role.SUPER_ADMIN, 'full_name': name},
            )
        audit.log_activity(request=request, action='auto_create_super_admin',
                           details={'email': email, 'via': 'google'}, user=user)

    if not user.is_active:
        audit.log_login(request=request, method='google', success=False,
                        user=user, user_label=email)
        return Response({'error': 'החשבון מושבת'}, status=status.HTTP_403_FORBIDDEN)

    login(request, user)
    audit.log_login(request=request, method='google', success=True, user=user)
    return _login_response(user)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def request_otp_view(request):
    raw_phone = request.data.get('phone', '')
    phone = normalize_phone(raw_phone)
    profile = UserProfile.objects.select_related('user').filter(phone=phone).first()
    if profile is None or not profile.user.is_active:
        audit.log_login(request=request, method='phone', success=False,
                        user_label=phone)
        return Response({'error': 'מספר טלפון אינו רשום במערכת'},
                        status=status.HTTP_404_NOT_FOUND)

    otp = generate_otp(profile.user)
    name = profile.full_name or profile.user.get_full_name() or 'משתמש'
    call = make_otp_call(profile.phone, name, otp.code, dtmf_token=otp.dtmf_token)
    return Response({
        'success': bool(call.get('success')),
        'user_id': profile.user_id,
        'otp_id': otp.id,
        'message': 'שיחה יזומה' if call.get('success') else 'השיחה נכשלה',
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def otp_dtmf_callback_view(request, token: str):
    """Public callback fired by Asterisk when the user presses 1 on the
    OTP call. Marks the matching OTP as `dtmf_verified=True`. The
    frontend, polling otp-status, picks up the flip and completes the
    login on its next tick."""
    otp = (
        OtpCode.objects
        .filter(
            dtmf_token=token,
            used=False,
            expires_at__gt=timezone.now(),
        )
        .order_by('-created_at')
        .first()
    )
    if otp is None:
        return Response({'error': 'invalid or expired token'},
                        status=status.HTTP_404_NOT_FOUND)
    otp.dtmf_verified = True
    otp.save(update_fields=['dtmf_verified'])
    return Response({'success': True})


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def otp_status_view(request):
    """Polled by the frontend after request-otp. Returns status:
      - 'pending'  — call placed, user hasn't pressed 1 yet
      - 'verified' — user pressed 1; response also includes the user
        payload + token, the session is established, login is done.
      - 'expired'  — past expiry
      - 'used'     — already consumed (treat as expired client-side)
    """
    user_id = request.data.get('user_id')
    otp_id = request.data.get('otp_id')
    if not user_id or not otp_id:
        return Response({'error': 'user_id and otp_id required'},
                        status=status.HTTP_400_BAD_REQUEST)
    otp = OtpCode.objects.filter(id=otp_id, user_id=user_id).first()
    if otp is None:
        return Response({'status': 'not_found'},
                        status=status.HTTP_404_NOT_FOUND)
    if otp.expires_at <= timezone.now():
        return Response({'status': 'expired'})
    if otp.used:
        return Response({'status': 'used'})
    if not otp.dtmf_verified:
        return Response({'status': 'pending'})

    # Verified — complete the login.
    user = User.objects.filter(id=otp.user_id).first()
    if user is None or not user.is_active:
        return Response({'status': 'expired'})
    otp.used = True
    otp.save(update_fields=['used'])
    login(request, user)
    audit.log_login(request=request, method='phone', success=True, user=user)
    token, _ = Token.objects.get_or_create(user=user)
    data = UserSerializer(user).data
    data['token'] = token.key
    data['status'] = 'verified'
    return Response(data)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def verify_otp_view(request):
    user_id = request.data.get('user_id')
    code = (request.data.get('code') or '').strip()
    user = User.objects.filter(id=user_id).first()
    if user is None:
        return Response({'error': 'משתמש לא נמצא'}, status=status.HTTP_404_NOT_FOUND)
    if not verify_otp(user, code):
        audit.log_login(request=request, method='phone', success=False,
                        user=user, user_label=user.email)
        return Response({'error': 'קוד שגוי או שפג תוקפו'},
                        status=status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        audit.log_login(request=request, method='phone', success=False,
                        user=user, user_label=user.email)
        return Response({'error': 'החשבון מושבת'}, status=status.HTTP_403_FORBIDDEN)
    login(request, user)
    audit.log_login(request=request, method='phone', success=True, user=user)
    return _login_response(user)


@api_view(['POST'])
def logout_view(request):
    # Revoke the mobile token first so a stolen device can't keep using it
    # after the user logs out. The web session is destroyed by `logout()`.
    if request.user.is_authenticated:
        Token.objects.filter(user=request.user).delete()
    logout(request)
    return Response({'message': 'התנתקת בהצלחה'})


@api_view(['GET'])
def me_view(request):
    return Response(UserSerializer(request.user).data)


# ─────────────────────────────────────────────────────────────────────────
# Super-admin: user management + audit
# ─────────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsSuperAdmin])
def admin_users_view(request):
    if request.method == 'GET':
        users = User.objects.all().select_related('profile').order_by('-id')
        return Response(UserSerializer(users, many=True).data)

    serializer = AdminUserWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    email = data['email'].lower()
    phone = normalize_phone(data.get('phone') or '') or None

    if User.objects.filter(email__iexact=email).exists():
        return Response({'error': 'אימייל כבר קיים במערכת'}, status=status.HTTP_409_CONFLICT)
    if phone and UserProfile.objects.filter(phone=phone).exists():
        return Response({'error': 'מספר הטלפון כבר רשום למשתמש אחר'},
                        status=status.HTTP_409_CONFLICT)

    try:
        with transaction.atomic():
            full_name = data['full_name'].strip()
            user = User.objects.create_user(
                username=email, email=email,
                first_name=(full_name.split(' ', 1)[0] if full_name else '')[:30],
                last_name=(full_name.split(' ', 1)[1] if ' ' in full_name else '')[:30],
                is_active=data.get('is_active', True),
            )
            password = data.get('password')
            if password:
                user.set_password(password)
            else:
                user.set_unusable_password()
            user.save()
            UserProfile.objects.update_or_create(
                user=user,
                defaults={
                    'role': data.get('role', UserProfile.Role.EDITOR),
                    'phone': phone,
                    'full_name': full_name,
                },
            )
    except IntegrityError as exc:
        return Response({'error': f'יצירת המשתמש נכשלה: {exc}'},
                        status=status.HTTP_400_BAD_REQUEST)

    audit.log_activity(
        request=request, action='create_user', user=request.user,
        details={'created_user_id': user.id, 'email': email, 'role': data.get('role')},
    )
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsSuperAdmin])
def admin_user_detail_view(request, user_id: int):
    user = get_object_or_404(User.objects.select_related('profile'), id=user_id)

    if request.method == 'GET':
        return Response(UserSerializer(user).data)

    if request.method == 'DELETE':
        if user == request.user:
            return Response({'error': 'לא ניתן להשבית את עצמך'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.is_active = False
        user.save(update_fields=['is_active'])
        audit.log_activity(
            request=request, action='deactivate_user', user=request.user,
            details={'target_user_id': user.id, 'email': user.email},
        )
        return Response({'status': 'deactivated'})

    # PUT
    serializer = AdminUserWriteSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    profile, _ = UserProfile.objects.get_or_create(user=user)

    if 'email' in data:
        new_email = data['email'].lower()
        if User.objects.filter(email__iexact=new_email).exclude(id=user.id).exists():
            return Response({'error': 'אימייל כבר קיים'}, status=status.HTTP_409_CONFLICT)
        user.email = new_email
        user.username = new_email
    if 'phone' in data:
        new_phone = normalize_phone(data.get('phone') or '') or None
        if new_phone and UserProfile.objects.filter(phone=new_phone).exclude(user=user).exists():
            return Response({'error': 'מספר הטלפון כבר רשום למשתמש אחר'},
                            status=status.HTTP_409_CONFLICT)
        profile.phone = new_phone
    if 'full_name' in data:
        full_name = (data['full_name'] or '').strip()
        profile.full_name = full_name
        if full_name:
            user.first_name = (full_name.split(' ', 1)[0])[:30]
            user.last_name = (full_name.split(' ', 1)[1] if ' ' in full_name else '')[:30]
    if 'role' in data:
        profile.role = data['role']
    if data.get('password'):
        user.set_password(data['password'])
    if 'is_active' in data:
        user.is_active = bool(data['is_active'])

    user.save()
    profile.save()
    audit.log_activity(
        request=request, action='update_user', user=request.user,
        details={'target_user_id': user.id, 'fields': list(data.keys())},
    )
    return Response(UserSerializer(user).data)


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def admin_audit_logins_view(request):
    qs = AuditLogin.objects.all().select_related('user')
    method = request.query_params.get('method')
    success = request.query_params.get('success')
    user_id = request.query_params.get('user_id')
    if method:
        qs = qs.filter(method=method)
    if success in ('true', 'false'):
        qs = qs.filter(success=(success == 'true'))
    if user_id:
        qs = qs.filter(user_id=user_id)
    qs = qs[:500]
    return Response(AuditLoginSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def admin_audit_activities_view(request):
    qs = AuditActivity.objects.all().select_related('user')[:500]
    return Response(AuditActivitySerializer(qs, many=True).data)
