from django.contrib.auth.models import User
from rest_framework import serializers

from .models import AuditActivity, AuditLogin, UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['role', 'phone', 'full_name']


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    last_login = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'is_active', 'last_login',
            'full_name', 'phone', 'role',
            'profile',
        ]
        read_only_fields = ['id', 'last_login']

    def get_full_name(self, obj):
        profile = getattr(obj, 'profile', None)
        return (profile.full_name if profile and profile.full_name else obj.get_full_name())

    def get_phone(self, obj):
        profile = getattr(obj, 'profile', None)
        return profile.phone if profile else None

    def get_role(self, obj):
        profile = getattr(obj, 'profile', None)
        return profile.role if profile else None


class AdminUserWriteSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    role = serializers.ChoiceField(choices=UserProfile.Role.choices, default=UserProfile.Role.EDITOR)
    password = serializers.CharField(max_length=128, required=False, allow_blank=True, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)


class AuditLoginSerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()

    class Meta:
        model = AuditLogin
        fields = [
            'id', 'user', 'user_email', 'user_label', 'method',
            'ip_address', 'user_agent', 'success', 'created_at',
        ]

    def get_user_email(self, obj):
        return obj.user.email if obj.user else ''


class AuditActivitySerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()

    class Meta:
        model = AuditActivity
        fields = [
            'id', 'user', 'user_email', 'user_label', 'action',
            'details', 'ip_address', 'created_at',
        ]

    def get_user_email(self, obj):
        return obj.user.email if obj.user else ''
