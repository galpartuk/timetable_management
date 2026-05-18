from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'מנהל ראשי'
        ADMIN = 'admin', 'מנהל'
        EDITOR = 'editor', 'עורך'
        VIEWER = 'viewer', 'צופה'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.EDITOR)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    full_name = models.CharField(max_length=255, blank=True, default='')
    # Mobile app needs to know which Teacher / SchoolClass the logged-in
    # user represents. The web app uses role-based permissions only, so
    # these fields stay null for admins who aren't teaching. The importer
    # auto-links by email match (see migration data step).
    teacher = models.ForeignKey(
        'subjects.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='user_profile',
        verbose_name='מורה משויך',
    )
    school_class = models.ForeignKey(
        'school.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='user_profiles',
        verbose_name='כיתה משויכת',
    )

    class Meta:
        verbose_name = 'פרופיל משתמש'
        verbose_name_plural = 'פרופילי משתמשים'

    def __str__(self):
        return f'{self.full_name or self.user.get_full_name() or self.user.username} ({self.get_role_display()})'

    @property
    def is_super_admin(self) -> bool:
        return self.role == self.Role.SUPER_ADMIN

    @property
    def is_admin(self) -> bool:
        return self.role in (self.Role.ADMIN, self.Role.SUPER_ADMIN)


class OtpCode(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='otp_codes',
    )
    code = models.CharField(max_length=6)
    used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'used', 'expires_at'])]


class AuditLogin(models.Model):
    METHOD_CHOICES = [
        ('google', 'Google'),
        ('phone', 'Phone OTP'),
        ('password', 'Password'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logins',
    )
    user_label = models.CharField(max_length=255, blank=True, default='')
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True, default='')
    success = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'יומן התחברויות'
        verbose_name_plural = 'יומני התחברויות'


class AuditActivity(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_activities',
    )
    user_label = models.CharField(max_length=255, blank=True, default='')
    action = models.CharField(max_length=100)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'יומן פעולות'
        verbose_name_plural = 'יומני פעולות'
