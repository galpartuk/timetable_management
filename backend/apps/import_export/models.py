from django.db import models


class ImportLog(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'ממתין'
        PROCESSING = 'processing', 'מעבד'
        PREVIEW = 'preview', 'תצוגה מקדימה'
        COMPLETED = 'completed', 'הושלם'
        FAILED = 'failed', 'נכשל'

    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='import_logs')
    file_name = models.CharField(max_length=255, verbose_name='שם קובץ')
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name='הועלה ב')
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, verbose_name='סטטוס',
    )
    # A dry-run produces preview_data and stops — the user must POST a
    # confirmation to actually commit.
    is_dry_run = models.BooleanField(default=False)
    subjects_imported = models.PositiveIntegerField(default=0, verbose_name='מקצועות שיובאו')
    teachers_imported = models.PositiveIntegerField(default=0, verbose_name='מורים שיובאו')
    assignments_imported = models.PositiveIntegerField(default=0, verbose_name='שיבוצים שיובאו')
    classes_imported = models.PositiveIntegerField(default=0, verbose_name='כיתות שיובאו')
    roles_imported = models.PositiveIntegerField(default=0, verbose_name='תפקידים שיובאו')
    errors = models.JSONField(default=list, verbose_name='שגיאות')
    warnings = models.JSONField(default=list, verbose_name='אזהרות')
    details = models.JSONField(default=dict, verbose_name='פירוט מלא')
    preview_data = models.JSONField(default=dict, verbose_name='תצוגה מקדימה')
    log = models.TextField(blank=True, verbose_name='לוג')

    class Meta:
        verbose_name = 'לוג ייבוא'
        verbose_name_plural = 'לוגי ייבוא'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.file_name} - {self.get_status_display()}'
