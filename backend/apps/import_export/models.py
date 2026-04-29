from django.db import models


class ImportLog(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'ממתין'
        PROCESSING = 'processing', 'מעבד'
        COMPLETED = 'completed', 'הושלם'
        FAILED = 'failed', 'נכשל'

    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='import_logs')
    file_name = models.CharField(max_length=255, verbose_name='שם קובץ')
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name='הועלה ב')
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, verbose_name='סטטוס',
    )
    subjects_imported = models.PositiveIntegerField(default=0, verbose_name='מקצועות שיובאו')
    teachers_imported = models.PositiveIntegerField(default=0, verbose_name='מורים שיובאו')
    assignments_imported = models.PositiveIntegerField(default=0, verbose_name='שיבוצים שיובאו')
    errors = models.JSONField(default=list, verbose_name='שגיאות')
    log = models.TextField(blank=True, verbose_name='לוג')

    class Meta:
        verbose_name = 'לוג ייבוא'
        verbose_name_plural = 'לוגי ייבוא'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.file_name} - {self.get_status_display()}'
