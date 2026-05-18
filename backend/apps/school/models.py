from django.db import models


class School(models.Model):
    name = models.CharField(max_length=200, verbose_name='שם בית הספר')
    address = models.CharField(max_length=300, blank=True, verbose_name='כתובת')
    days_per_week = models.PositiveSmallIntegerField(default=5, verbose_name='ימי לימוד בשבוע')
    periods_per_day = models.PositiveSmallIntegerField(default=10, verbose_name='שיעורים ביום')
    period_duration_minutes = models.PositiveSmallIntegerField(default=45, verbose_name='אורך שיעור (דקות)')
    first_period_start = models.TimeField(default='08:00', verbose_name='שעת התחלה')

    class Meta:
        verbose_name = 'בית ספר'
        verbose_name_plural = 'בתי ספר'

    def __str__(self):
        return self.name


class Grade(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='grades')
    name = models.CharField(max_length=10, verbose_name='שכבה')
    level = models.PositiveSmallIntegerField(verbose_name='מספר שכבה')
    order = models.PositiveSmallIntegerField(default=0, verbose_name='סדר')

    class Meta:
        verbose_name = 'שכבה'
        verbose_name_plural = 'שכבות'
        ordering = ['level']
        unique_together = ['school', 'level']

    def __str__(self):
        return self.name


class SchoolClass(models.Model):
    class ClassType(models.TextChoices):
        REGULAR = 'regular', 'רגילה'
        SPECIAL_ED = 'special_ed', 'חינוך מיוחד'
        LEADERSHIP = 'leadership', 'מנהיגות'
        MOFET_SCIENCE = 'mofet_science', 'מופ"ת מדעית'
        MOFET_LEADERSHIP = 'mofet_leadership', 'מופ"ת מנהיגות'
        RESERVE_SCIENCE = 'reserve_science', 'עתודה מדעית'
        OMETS = 'omets', 'אומ"ץ'
        MABAR = 'mabar', 'מב"ר'
        TALM = 'talm', 'תל"מ'
        ATGAR = 'atgar', 'אתגר'
        BIOTECH = 'biotech', 'ביוטכנולוגיה'
        OTHER = 'other', 'אחר'

    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name='classes')
    number = models.PositiveSmallIntegerField(verbose_name='מספר כיתה')
    class_type = models.CharField(
        max_length=20, choices=ClassType.choices, default=ClassType.REGULAR,
        verbose_name='סוג כיתה',
    )
    # Verbatim track label from the Excel (e.g., "מופת מדעית ", "אומ"ץ").
    # Useful for forensics — the canonical class_type uses our enum, but the
    # importer sometimes sees variants like extra whitespace or quoting.
    track_label_raw = models.CharField(max_length=80, blank=True, default='', verbose_name='תווית מסלול גולמית')
    student_count = models.PositiveSmallIntegerField(default=0, verbose_name='מספר תלמידים')
    homeroom_teacher = models.ForeignKey(
        'subjects.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='homeroom_classes',
        verbose_name='מחנכ/ת',
    )

    class Meta:
        verbose_name = 'כיתה'
        verbose_name_plural = 'כיתות'
        ordering = ['grade__level', 'number']
        unique_together = ['grade', 'number']

    def __str__(self):
        return f'{self.grade.name}{self.number}'

    @property
    def display_name(self):
        return f'{self.grade.name}{self.number}'


class TimeSlot(models.Model):
    class Day(models.IntegerChoices):
        SUNDAY = 1, 'ראשון'
        MONDAY = 2, 'שני'
        TUESDAY = 3, 'שלישי'
        WEDNESDAY = 4, 'רביעי'
        THURSDAY = 5, 'חמישי'

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='time_slots')
    day = models.IntegerField(choices=Day.choices, verbose_name='יום')
    period = models.PositiveSmallIntegerField(verbose_name='שיעור')
    start_time = models.TimeField(verbose_name='שעת התחלה')
    end_time = models.TimeField(verbose_name='שעת סיום')

    class Meta:
        verbose_name = 'משבצת זמן'
        verbose_name_plural = 'משבצות זמן'
        ordering = ['day', 'period']
        unique_together = ['school', 'day', 'period']

    def __str__(self):
        return f'{self.get_day_display()} - שיעור {self.period}'


class Room(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='rooms')
    name = models.CharField(max_length=50, verbose_name='שם חדר')
    capacity = models.PositiveSmallIntegerField(default=40, verbose_name='קיבולת')
    room_type = models.CharField(max_length=50, blank=True, verbose_name='סוג חדר')

    class Meta:
        verbose_name = 'חדר'
        verbose_name_plural = 'חדרים'

    def __str__(self):
        return self.name
