from apps.users.models import AuditActivity, AuditLogin


def _client_ip(request):
    return (
        request.META.get('HTTP_X_REAL_IP')
        or request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
        or request.META.get('REMOTE_ADDR')
    )


def log_login(*, request, method: str, success: bool, user=None, user_label: str = ''):
    AuditLogin.objects.create(
        user=user,
        user_label=user_label or (getattr(user, 'email', '') if user else ''),
        method=method,
        ip_address=_client_ip(request) or None,
        user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:500],
        success=success,
    )


def log_activity(*, request, action: str, details: dict | None = None, user=None):
    AuditActivity.objects.create(
        user=user,
        user_label=getattr(user, 'email', '') if user else '',
        action=action,
        details=details or {},
        ip_address=_client_ip(request) or None,
    )
