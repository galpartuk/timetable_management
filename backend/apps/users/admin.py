from django.contrib import admin

from .models import AuditActivity, AuditLogin, OtpCode, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'full_name', 'role', 'phone']
    list_filter = ['role']
    search_fields = ['user__email', 'user__username', 'full_name', 'phone']


@admin.register(OtpCode)
class OtpCodeAdmin(admin.ModelAdmin):
    list_display = ['user', 'code', 'used', 'expires_at', 'created_at']
    list_filter = ['used']
    search_fields = ['user__email']


@admin.register(AuditLogin)
class AuditLoginAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'user', 'user_label', 'method', 'success', 'ip_address']
    list_filter = ['method', 'success']
    search_fields = ['user__email', 'user_label', 'ip_address']
    readonly_fields = [f.name for f in AuditLogin._meta.fields]


@admin.register(AuditActivity)
class AuditActivityAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'user', 'user_label', 'action', 'ip_address']
    list_filter = ['action']
    search_fields = ['user__email', 'user_label', 'action']
    readonly_fields = [f.name for f in AuditActivity._meta.fields]
