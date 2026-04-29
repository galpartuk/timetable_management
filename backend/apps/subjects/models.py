from django.db import models


class Subject(models.Model):
    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='subjects')
    name_he = models.CharField(max_length=100, verbose_name='שם המקצוע')
    name_en = models.CharField(max_length=100, blank=True, verbose_name='Subject name')
    color = models.CharField(max_length=7, default='#4A90D9', verbose_name='צבע')
    requires_consecutive = models.BooleanField(default=False, verbose_name='דורש שיעורים צמודים')

    class Meta:
        verbose_name = 'מקצוע'
        verbose_name_plural = 'מקצועות'
        ordering = ['name_he']

    def __str__(self):
        return self.name_he


class Teacher(models.Model):
    class Day(models.IntegerChoices):
        SUNDAY = 1, 'ראשון'
        MONDAY = 2, 'שני'
        TUESDAY = 3, 'שלישי'
        WEDNESDAY = 4, 'רביעי'
        THURSDAY = 5, 'חמישי'

    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='teachers')
    first_name = models.CharField(max_length=50, verbose_name='שם פרטי')
    last_name = models.CharField(max_length=50, blank=True, verbose_name='שם משפחה')
    email = models.EmailField(blank=True, verbose_name='אימייל')
    phone = models.CharField(max_length=20, blank=True, verbose_name='טלפון')
    max_weekly_hours = models.PositiveSmallIntegerField(default=40, verbose_name='שעות שבועיות מקסימום')
    day_off = models.IntegerField(
        choices=Day.choices, null=True, blank=True, verbose_name='יום חופש',
    )

    class Meta:
        verbose_name = 'מורה'
        verbose_name_plural = 'מורים'
        ordering = ['last_name', 'first_name']

    def __str__(self):
        if self.last_name:
            return f'{self.first_name} {self.last_name}'
        return self.first_name


class TeachingAssignment(models.Model):
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='assignments')
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name='assignments')
    school_class = models.ForeignKey(
        'school.SchoolClass', on_delete=models.CASCADE, related_name='assignments',
    )
    weekly_hours = models.DecimalField(max_digits=4, decimal_places=1, verbose_name='שעות הוראה')
    bagrut_bonus_hours = models.DecimalField(
        max_digits=4, decimal_places=1, default=0, verbose_name='שעות גמול בגרות',
    )
    bagrut_exam_code = models.CharField(max_length=20, blank=True, verbose_name='סמל שאלון בגרות')
    notes = models.TextField(blank=True, verbose_name='הערות')

    class Meta:
        verbose_name = 'שיבוץ הוראה'
        verbose_name_plural = 'שיבוצי הוראה'

    def __str__(self):
        return f'{self.teacher} - {self.subject} - {self.school_class}'
