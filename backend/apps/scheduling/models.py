from django.db import models


class Constraint(models.Model):
    class ConstraintType(models.TextChoices):
        TEACHER_AVAILABILITY = 'teacher_availability', 'זמינות מורה'
        MAX_DAILY_HOURS_CLASS = 'max_daily_hours_class', 'מקסימום שעות יומי לכיתה'
        MAX_DAILY_HOURS_TEACHER = 'max_daily_hours_teacher', 'מקסימום שעות יומי למורה'
        SUBJECT_SPREAD = 'subject_spread', 'פיזור מקצוע לאורך השבוע'
        CONSECUTIVE_HOURS = 'consecutive_hours', 'שיעורים צמודים'
        CONSECUTIVE_PAIR = 'consecutive_pair', 'זוג שיעורים רצופים'
        LUNCH_BREAK = 'lunch_break', 'הפסקת אוכל'
        PREFERRED_PERIODS = 'preferred_periods', 'שיעורים מועדפים'
        NO_LAST_PERIOD = 'no_last_period', 'לא בשיעור אחרון'
        # Block every teacher in `tag` at the (day, period) slots listed
        # in parameters['slots']. Use for staff/team meetings.
        GROUP_BLOCKED_SLOT = 'group_blocked_slot', 'חסימת קבוצת מורים בשיעור'
        CUSTOM = 'custom', 'מותאם אישית'

    class Priority(models.TextChoices):
        HARD = 'hard', 'חובה'
        SOFT = 'soft', 'העדפה'

    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='constraints')
    name = models.CharField(max_length=200, verbose_name='שם')
    description = models.TextField(blank=True, verbose_name='תיאור')
    constraint_type = models.CharField(
        max_length=30, choices=ConstraintType.choices, verbose_name='סוג אילוץ',
    )
    priority = models.CharField(
        max_length=4, choices=Priority.choices, default=Priority.HARD, verbose_name='עדיפות',
    )
    is_active = models.BooleanField(default=True, verbose_name='פעיל')
    parameters = models.JSONField(default=dict, verbose_name='פרמטרים')
    teacher = models.ForeignKey(
        'subjects.Teacher', on_delete=models.CASCADE, null=True, blank=True,
        related_name='constraints', verbose_name='מורה',
    )
    subject = models.ForeignKey(
        'subjects.Subject', on_delete=models.CASCADE, null=True, blank=True,
        related_name='constraints', verbose_name='מקצוע',
    )
    school_class = models.ForeignKey(
        'school.SchoolClass', on_delete=models.CASCADE, null=True, blank=True,
        related_name='constraints', verbose_name='כיתה',
    )
    # Used by GROUP_BLOCKED_SLOT — the constraint applies to every teacher
    # carrying this tag (e.g. "6th-grade staff" → weekly meeting).
    tag = models.ForeignKey(
        'subjects.TeacherTag', on_delete=models.CASCADE, null=True, blank=True,
        related_name='constraints', verbose_name='תגית מורים',
    )

    class Meta:
        verbose_name = 'אילוץ'
        verbose_name_plural = 'אילוצים'

    def __str__(self):
        return f'{self.name} ({self.get_priority_display()})'


class Timetable(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'טיוטה'
        GENERATING = 'generating', 'בתהליך יצירה'
        COMPLETED = 'completed', 'הושלם'
        FAILED = 'failed', 'נכשל'
        PUBLISHED = 'published', 'פורסם'

    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='timetables')
    name = models.CharField(max_length=200, verbose_name='שם')
    academic_year = models.CharField(max_length=9, verbose_name='שנת לימודים')
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.DRAFT, verbose_name='סטטוס',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='נוצר ב')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='עודכן ב')
    solver_log = models.TextField(blank=True, verbose_name='לוג פתרון')
    # Live build progress, polled by the client while status=generating.
    # Shape: {phase, max_time_seconds, started_at, solutions, objective, wall_time}.
    progress = models.JSONField(default=dict, blank=True, verbose_name='התקדמות')

    class Meta:
        verbose_name = 'מערכת שעות'
        verbose_name_plural = 'מערכות שעות'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} - {self.academic_year}'


class TimetableSnapshot(models.Model):
    """A point-in-time copy of a Timetable's entries.

    Created automatically before every mutating action (AI moves/swaps,
    manual drag-drop) so the user can roll back without rebuilding the
    whole timetable from scratch. Entries are serialized to JSON rather
    than cloned into a parallel table so the snapshot schema stays simple
    and survives minor model changes — restore = delete current entries +
    recreate from JSON in a transaction.

    Pruned per-timetable at write time (newest 50 kept); storage is a few
    KB per snapshot so the cap is generous.
    """
    class TriggeredBy(models.TextChoices):
        AI_MOVE = 'ai_move', 'הזזת שיעור על־ידי AI'
        AI_SWAP = 'ai_swap', 'החלפת שיעורים על־ידי AI'
        MANUAL_MOVE = 'manual_move', 'הזזה ידנית'
        MANUAL_SWAP = 'manual_swap', 'החלפה ידנית'
        MANUAL_SAVE = 'manual_save', 'שמירה ידנית'
        BEFORE_RESTORE = 'before_restore', 'לפני שחזור'
        BEFORE_BUILD = 'before_build', 'לפני בנייה אוטומטית'

    timetable = models.ForeignKey(
        'Timetable', on_delete=models.CASCADE, related_name='snapshots',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='נוצר ב')
    triggered_by = models.CharField(
        max_length=20, choices=TriggeredBy.choices, verbose_name='מקור',
    )
    description = models.CharField(max_length=300, blank=True, verbose_name='תיאור')
    # List of dicts: {school_class_id, subject_id, teacher_id, time_slot_id,
    # room_id, locked}. One dict per TimetableEntry at snapshot time.
    entries_data = models.JSONField(default=list, verbose_name='נתוני שיעורים')
    actor = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='ביצע/ה',
    )

    class Meta:
        verbose_name = 'גרסת מערכת'
        verbose_name_plural = 'גרסאות מערכת'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.timetable.name} @ {self.created_at:%Y-%m-%d %H:%M} ({self.get_triggered_by_display()})'


class TimetableEntry(models.Model):
    timetable = models.ForeignKey(Timetable, on_delete=models.CASCADE, related_name='entries')
    school_class = models.ForeignKey(
        'school.SchoolClass', on_delete=models.CASCADE, related_name='timetable_entries',
    )
    subject = models.ForeignKey(
        'subjects.Subject', on_delete=models.CASCADE, related_name='timetable_entries',
    )
    teacher = models.ForeignKey(
        'subjects.Teacher', on_delete=models.CASCADE, related_name='timetable_entries',
    )
    time_slot = models.ForeignKey(
        'school.TimeSlot', on_delete=models.CASCADE, related_name='timetable_entries',
    )
    room = models.ForeignKey(
        'school.Room', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='timetable_entries',
    )
    # When True, the next solver run pins this entry to its current
    # (school_class, time_slot, teacher) — useful for "I like this one,
    # re-solve everything else around it".
    locked = models.BooleanField(default=False, verbose_name='נעול')

    class Meta:
        verbose_name = 'שיעור במערכת'
        verbose_name_plural = 'שיעורים במערכת'
        # NOT unique on (timetable, class, slot) — a pooled high-school
        # lesson (e.g., math) puts several parallel teachers in the same
        # slot for the same class (each teaching a different ability
        # track). The minimal unique key is (timetable, class, slot,
        # teacher): the *same teacher* cannot appear twice in one slot,
        # but multiple teachers can.
        unique_together = ['timetable', 'school_class', 'time_slot', 'teacher']

    def __str__(self):
        return f'{self.school_class} - {self.subject} - {self.time_slot}'
