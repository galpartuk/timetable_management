import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def empty_phone_to_null(apps, schema_editor):
    UserProfile = apps.get_model('users', 'UserProfile')
    UserProfile.objects.filter(phone='').update(phone=None)


def copy_user_names(apps, schema_editor):
    UserProfile = apps.get_model('users', 'UserProfile')
    for profile in UserProfile.objects.select_related('user').all():
        if not profile.full_name:
            user = profile.user
            full = (f'{user.first_name} {user.last_name}'.strip()
                    or user.get_username())
            profile.full_name = full
            profile.save(update_fields=['full_name'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Step 1: add full_name and convert phone to nullable (no unique yet)
        migrations.AddField(
            model_name='userprofile',
            name='full_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='phone',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        # Step 2: clean data BEFORE applying unique constraint
        migrations.RunPython(empty_phone_to_null, reverse_code=noop_reverse),
        migrations.RunPython(copy_user_names, reverse_code=noop_reverse),
        # Step 3: now safely apply unique + new role choices
        migrations.AlterField(
            model_name='userprofile',
            name='phone',
            field=models.CharField(blank=True, max_length=20, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('super_admin', 'מנהל ראשי'),
                    ('admin', 'מנהל'),
                    ('editor', 'עורך'),
                    ('viewer', 'צופה'),
                ],
                default='editor',
                max_length=12,
            ),
        ),
        migrations.CreateModel(
            name='OtpCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=6)),
                ('used', models.BooleanField(default=False)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='otp_codes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [models.Index(fields=['user', 'used', 'expires_at'], name='users_otpcod_user_id_idx')],
            },
        ),
        migrations.CreateModel(
            name='AuditLogin',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_label', models.CharField(blank=True, default='', max_length=255)),
                ('method', models.CharField(choices=[('google', 'Google'), ('phone', 'Phone OTP'), ('password', 'Password')], max_length=20)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, default='', max_length=500)),
                ('success', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logins', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'יומן התחברויות',
                'verbose_name_plural': 'יומני התחברויות',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AuditActivity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_label', models.CharField(blank=True, default='', max_length=255)),
                ('action', models.CharField(max_length=100)),
                ('details', models.JSONField(blank=True, default=dict)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_activities', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'יומן פעולות',
                'verbose_name_plural': 'יומני פעולות',
                'ordering': ['-created_at'],
            },
        ),
    ]
