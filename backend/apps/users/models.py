from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'מנהל'
        EDITOR = 'editor', 'עורך'
        VIEWER = 'viewer', 'צופה'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.VIEWER)
    phone = models.CharField(max_length=20, blank=True)

    class Meta:
        verbose_name = 'פרופיל משתמש'
        verbose_name_plural = 'פרופילי משתמשים'

    def __str__(self):
        return f'{self.user.get_full_name()} ({self.get_role_display()})'
