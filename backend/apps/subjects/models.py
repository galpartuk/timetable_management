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
        # The same school shouldn't have two subjects with identical Hebrew names —
        # the importer de-dupes on (school, name_he), and the unique index also
        # protects against accidental duplicates from the admin UI.
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name_he'],
                name='subject_school_name_unique',
            ),
        ]

    def __str__(self):
        return self.name_he


class TeacherTag(models.Model):
    """A label that groups teachers, e.g. "6th-grade staff", "math department".
    Used by Constraint(GROUP_BLOCKED_SLOT) so an admin can say "everyone in the
    math department is in a meeting Tuesday at period 1" and the solver leaves
    those slots empty for all of them.

    `kind` distinguishes auto-generated tags from hand-made ones:
      • department  — one per subject; a teacher's auto tag is their primary
        (most-hours) subject. Re-import only fills it in when empty, so manual
        moves survive.
      • coordinator — derived from ריכוז/רכז rows in the roles sheet.
      • custom      — created by the user; never touched by the importer.
    Auto tags carry a `subject` FK so "all math teachers" is unambiguous; custom
    tags leave it null."""

    class Kind(models.TextChoices):
        DEPARTMENT = 'department', 'מחלקה'
        COORDINATOR = 'coordinator', 'ריכוז'
        CUSTOM = 'custom', 'מותאם אישית'

    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='teacher_tags')
    name = models.CharField(max_length=80, verbose_name='שם תגית')
    color = models.CharField(max_length=7, default='#6366F1', verbose_name='צבע')
    kind = models.CharField(
        max_length=20, choices=Kind.choices, default=Kind.CUSTOM, verbose_name='סוג תגית',
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='teacher_tags', verbose_name='מקצוע',
    )

    class Meta:
        verbose_name = 'תגית מורים'
        verbose_name_plural = 'תגיות מורים'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'],
                name='teacher_tag_school_name_unique',
            ),
        ]

    def __str__(self):
        return self.name


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
    tags = models.ManyToManyField(
        TeacherTag, blank=True, related_name='teachers', verbose_name='תגיות',
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
    """One delivery of `subject` to `school_class` by `teacher` for `weekly_hours` hours.

    For pooled multi-class lessons (e.g., high-school math "5 יח"ל" across
    several classes), the importer creates one TeachingAssignment per member
    class and ties them together with a shared `group_key` — the solver can
    then enforce that those lessons share time slots."""

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='assignments')
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments',
        verbose_name='מורה',
    )
    school_class = models.ForeignKey(
        'school.SchoolClass', on_delete=models.CASCADE, related_name='assignments',
    )
    # When the same lesson is delivered to several classes pooled together
    # (e.g., high-school math "5 יח"ל" across יא1,5,6,7,9), the importer
    # records the assignment once on the primary class and lists the rest
    # here. Treat `school_class` + `additional_classes` together as the
    # full audience. Empty for solo-class assignments.
    additional_classes = models.ManyToManyField(
        'school.SchoolClass', blank=True, related_name='pooled_assignments',
        verbose_name='כיתות נוספות בקבוצה',
    )
    weekly_hours = models.DecimalField(max_digits=4, decimal_places=1, verbose_name='שעות הוראה')
    bagrut_bonus_hours = models.DecimalField(
        max_digits=4, decimal_places=1, default=0, verbose_name='שעות גמול בגרות',
    )
    bagrut_exam_code = models.CharField(max_length=80, blank=True, verbose_name='סמל שאלון בגרות')
    # Ability/track label from the Excel for this slot — e.g., "5 יח"ל",
    # "4 יח"ל", "קבוצה 1", "מנהיגות". Distinct from SchoolClass.class_type
    # because a single class can host multiple ability tracks (so we can't
    # collapse this into the class itself).
    track_label = models.CharField(max_length=80, blank=True, default='', verbose_name='תווית מסלול')
    # Used to link assignments that are taught together (same period, same
    # teacher, multiple classes in a pool). Empty when the lesson is solo.
    group_key = models.CharField(max_length=80, blank=True, default='', db_index=True, verbose_name='מזהה קבוצה')
    student_count = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='מספר תלמידים בקבוצה')
    # Pedagogically active. We set this to False for rows marked "פתיחה מותנית"
    # (conditional opening) so the solver and reports can ignore them without
    # losing the data.
    is_active = models.BooleanField(default=True, verbose_name='פעיל')
    notes = models.TextField(blank=True, verbose_name='הערות')
    # Forensic provenance — which Excel sheet/row this row was imported from.
    # Useful when a user reports "this row looks wrong" — we can point them
    # back at the exact source cell.
    source_sheet = models.CharField(max_length=120, blank=True, default='', verbose_name='גיליון מקור')
    source_row = models.PositiveIntegerField(null=True, blank=True, verbose_name='שורת מקור')

    class Meta:
        verbose_name = 'שיבוץ הוראה'
        verbose_name_plural = 'שיבוצי הוראה'

    def __str__(self):
        return f'{self.teacher or "—"} - {self.subject} - {self.school_class}'


class TeacherRole(models.Model):
    """A non-teaching role a teacher holds (ניהול, ריכוז, ייעוץ, …).

    These come from the תפקידים sheet and carry: weekly hours allocated to
    the role, a stipend fraction (גמול תפקיד), and any "must teach" minimum
    that limits how much teaching time can be displaced by the role."""

    school = models.ForeignKey('school.School', on_delete=models.CASCADE, related_name='teacher_roles')
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='roles',
        verbose_name='מורה',
    )
    role_title = models.CharField(max_length=200, verbose_name='שם התפקיד')
    context = models.CharField(max_length=40, blank=True, default='', verbose_name='הקשר')
    description = models.CharField(max_length=300, blank=True, default='', verbose_name='תיאור')
    weekly_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name='שעות שבועיות')
    stipend_fraction = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name='גמול תפקיד')
    must_teach_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name='חובת הוראה')
    notes = models.CharField(max_length=300, blank=True, default='', verbose_name='הערות')

    class Meta:
        verbose_name = 'תפקיד מורה'
        verbose_name_plural = 'תפקידי מורים'
        ordering = ['role_title']

    def __str__(self):
        target = self.teacher or 'TBD'
        return f'{self.role_title} ({target})'
