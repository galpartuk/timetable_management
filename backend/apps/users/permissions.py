from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    message = 'נדרשת הרשאת מנהל ראשי'

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        profile = getattr(user, 'profile', None)
        return profile is not None and profile.is_super_admin


class IsAdmin(BasePermission):
    message = 'נדרשת הרשאת מנהל'

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        profile = getattr(user, 'profile', None)
        return profile is not None and profile.is_admin
