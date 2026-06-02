"""Pre-flight feasibility analysis — predict whether ``solve_timetable``
will return INFEASIBLE without actually running the solver.

The solver itself takes a few seconds to return "infeasible" and then
emits a generic diagnostic that often says "no clear cause". This module
fills that gap by computing, per teacher and per class:

  available_slots = num_slots − slots_blocked_by(constraints, day_off, locks)

and comparing it to that owner's lesson count. Any owner whose load
exceeds their available slots is a guaranteed infeasibility — the
constraint and the data don't fit no matter what the solver does.

It cannot catch every infeasibility (real constraint propagation can
produce contradictions that no slot-budget arithmetic surfaces — e.g.
two teachers in the same pool with disjoint availability for different
slots), but it catches the common 90%: overloaded classes, overloaded
teachers, and constraint-stacking that quietly steals too many slots.

Shared between (a) the AI ``check_feasibility`` tool that runs BEFORE a
build, and (b) the post-fail diagnostics in :mod:`solver.engine` so the
user sees the same actionable list either way.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.db.models import Sum

from apps.scheduling.models import Constraint, TimetableEntry


# Severity classes — UI can color these (red / amber / blue).
SEVERITY_BLOCKER = 'blocker'   # solver WILL return infeasible
SEVERITY_WARNING = 'warning'   # tight budget; may or may not solve
SEVERITY_INFO = 'info'         # informational


@dataclass
class Issue:
    severity: str
    code: str       # short stable id, e.g. 'class_overload'
    message: str    # Hebrew, user-facing
    target: str = ''   # human-readable owner (teacher/class name)

    def as_dict(self) -> dict[str, Any]:
        return {
            'severity': self.severity,
            'code': self.code,
            'message': self.message,
            'target': self.target,
        }


@dataclass
class FeasibilityReport:
    blockers: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    info: list[Issue] = field(default_factory=list)

    @property
    def feasible_likely(self) -> bool:
        return not self.blockers

    def add(self, issue: Issue) -> None:
        bucket = {
            SEVERITY_BLOCKER: self.blockers,
            SEVERITY_WARNING: self.warnings,
            SEVERITY_INFO: self.info,
        }[issue.severity]
        bucket.append(issue)

    def as_dict(self) -> dict[str, Any]:
        return {
            'feasible_likely': self.feasible_likely,
            'blockers': [i.as_dict() for i in self.blockers],
            'warnings': [i.as_dict() for i in self.warnings],
            'info': [i.as_dict() for i in self.info],
        }


def analyze(school, *, timetable=None) -> FeasibilityReport:
    """Run the full pre-flight analysis for ``school``.

    Optional ``timetable`` only affects the "locked entries" accounting —
    locks pin specific slots and reduce the effective budget for that
    class/teacher. Without a timetable, locks are ignored.
    """
    from apps.school.models import SchoolClass, TimeSlot
    from apps.subjects.models import Teacher, TeachingAssignment

    report = FeasibilityReport()

    classes = list(SchoolClass.objects.filter(grade__school=school).select_related('grade'))
    teachers = {t.id: t for t in Teacher.objects.filter(school=school)}
    time_slots = list(TimeSlot.objects.filter(school=school))
    num_slots = len(time_slots)
    if num_slots == 0:
        report.add(Issue(SEVERITY_BLOCKER, 'no_time_slots',
                         'אין משבצות זמן מוגדרות לבית הספר. הוסיפו ימים ושעות לפני הבנייה.'))
        return report

    # Build a (day, period) → slot count map for quick "how many slots on
    # day X" lookups, and a per-day-period grid.
    slots_by_day: dict[int, set[int]] = defaultdict(set)
    for ts in time_slots:
        slots_by_day[ts.day].add(ts.period)
    days_in_week = len(slots_by_day) or 5

    # ── load per class and per teacher (from active assignments) ───────────
    # Pool members share the same hour budget — we count each (subject,
    # group_key) once per class in the pool, then sum per class. For
    # teachers we sum their per-assignment hours regardless of pool.
    assignments = list(
        TeachingAssignment.objects
        .filter(subject__school=school, is_active=True, teacher__isnull=False)
        .select_related('subject', 'teacher', 'school_class')
        .prefetch_related('additional_classes')
    )
    if not assignments:
        report.add(Issue(SEVERITY_BLOCKER, 'no_assignments',
                         'אין שיבוצי הוראה פעילים — אין מה לתזמן.'))
        return report

    class_hours: dict[int, float] = defaultdict(float)
    teacher_hours: dict[int, float] = defaultdict(float)

    # Group assignments by (subject_id, group_key) to model the pool's hour
    # cost correctly: the pool occupies max(track.weekly_hours) slots per
    # class in the pool, not the sum.
    pool_buckets: dict[tuple[int, str], list[TeachingAssignment]] = defaultdict(list)
    for a in assignments:
        key = (a.subject_id, a.group_key) if a.group_key else (a.subject_id, f'solo#{a.id}')
        pool_buckets[key].append(a)
    for (_subj, _gk), members in pool_buckets.items():
        # Hours per teacher in this pool (the same teacher in two rows of
        # one pool teaches both serially).
        per_teacher: dict[int, float] = defaultdict(float)
        member_classes: set[int] = set()
        for m in members:
            per_teacher[m.teacher_id] += float(m.weekly_hours or 0)
            member_classes.add(m.school_class_id)
            for cid in m.additional_classes.values_list('id', flat=True):
                member_classes.add(cid)
        pool_hours = max(per_teacher.values(), default=0)
        for cid in member_classes:
            class_hours[cid] += pool_hours
        for tid, h in per_teacher.items():
            teacher_hours[tid] += h

    # ── locked entries reduce the effective budget for class & teacher ────
    locked_per_class: dict[int, int] = defaultdict(int)
    locked_per_teacher: dict[int, int] = defaultdict(int)
    if timetable is not None:
        for e in TimetableEntry.objects.filter(timetable=timetable, locked=True).values(
            'school_class_id', 'teacher_id',
        ):
            locked_per_class[e['school_class_id']] += 1
            if e['teacher_id']:
                locked_per_teacher[e['teacher_id']] += 1

    # ── constraint impact: how many slots each owner LOSES ────────────────
    constraints = list(
        Constraint.objects.filter(school=school, is_active=True)
        .select_related('teacher', 'school_class', 'subject', 'tag')
        .prefetch_related('tag__teachers')
    )

    # Per-class slot subtraction from lunch_break + no_last_period (per-class)
    blocked_class_slots: dict[int, set[tuple[int, int]]] = defaultdict(set)
    blocked_class_all_slots: set[tuple[int, int]] = set()  # constraints with no class FK
    # Per-teacher slot subtraction from teacher_availability + no_last_period
    # (teacher-scoped) + group_blocked_slot
    blocked_teacher_slots: dict[int, set[tuple[int, int]]] = defaultdict(set)
    # Per (class, subject) — subject_day_blackout impact
    blocked_class_subject_days: dict[tuple[int, int], set[int]] = defaultdict(set)
    blocked_subject_days: dict[int, set[int]] = defaultdict(set)  # no class FK

    for c in constraints:
        params = c.parameters if isinstance(c.parameters, dict) else {}
        if c.constraint_type == 'teacher_availability':
            if not c.teacher_id:
                continue
            for s in params.get('unavailable', []) or []:
                d, p = s.get('day'), s.get('period')
                if d and p:
                    blocked_teacher_slots[c.teacher_id].add((d, p))
        elif c.constraint_type == 'lunch_break':
            periods = params.get('periods') or []
            days = params.get('days') or list(slots_by_day.keys())
            pairs = {(d, p) for d in days for p in periods if d in slots_by_day}
            if c.school_class_id:
                blocked_class_slots[c.school_class_id] |= pairs
            else:
                blocked_class_all_slots |= pairs
        elif c.constraint_type == 'no_last_period':
            periods = params.get('periods') or [max(p for ps in slots_by_day.values() for p in ps)]
            pairs = {(d, p) for d in slots_by_day for p in periods if p in slots_by_day[d]}
            if c.teacher_id:
                blocked_teacher_slots[c.teacher_id] |= pairs
            elif c.school_class_id:
                blocked_class_slots[c.school_class_id] |= pairs
            else:
                blocked_class_all_slots |= pairs
        elif c.constraint_type == 'group_blocked_slot':
            if not c.tag_id:
                continue
            raw_slots = params.get('slots') or []
            if not raw_slots and params.get('day') is not None and params.get('periods'):
                raw_slots = [{'day': params['day'], 'period': p} for p in params['periods']]
            pairs = {(s.get('day'), s.get('period')) for s in raw_slots
                     if s.get('day') and s.get('period')}
            for teacher in c.tag.teachers.all():
                blocked_teacher_slots[teacher.id] |= pairs
        elif c.constraint_type == 'subject_day_blackout':
            if not c.subject_id:
                continue
            days = {d for d in (params.get('days') or []) if isinstance(d, int)}
            if not days:
                continue
            if c.school_class_id:
                blocked_class_subject_days[(c.school_class_id, c.subject_id)] |= days
            else:
                blocked_subject_days[c.subject_id] |= days

    # ── teacher day-off ───────────────────────────────────────────────────
    for tid, teacher in teachers.items():
        if teacher.day_off is None:
            continue
        for p in slots_by_day.get(teacher.day_off, ()):
            blocked_teacher_slots[tid].add((teacher.day_off, p))

    # ── per-class lessons-per-subject for blackout overload checks ────────
    class_subject_hours: dict[tuple[int, int], float] = defaultdict(float)
    for (subj, _gk), members in pool_buckets.items():
        pool_hours = max((float(m.weekly_hours or 0) for m in members), default=0)
        member_classes = set()
        for m in members:
            member_classes.add(m.school_class_id)
            for cid in m.additional_classes.values_list('id', flat=True):
                member_classes.add(cid)
        for cid in member_classes:
            class_subject_hours[(cid, subj)] += pool_hours

    # ── check each class ───────────────────────────────────────────────────
    for cls in classes:
        load = round(class_hours.get(cls.id, 0))
        if load == 0:
            continue
        blocked = (blocked_class_all_slots | blocked_class_slots.get(cls.id, set()))
        available = num_slots - len(blocked) - locked_per_class.get(cls.id, 0)
        if load > available:
            report.add(Issue(
                SEVERITY_BLOCKER, 'class_overload',
                f'כיתה {cls.display_name}: {load} שיעורים נדרשים '
                f'אך רק {available} משבצות פנויות '
                f'({num_slots} סך הכל '
                f'− {len(blocked)} שחסומות בהפסקה/אילוצים'
                f'{" − " + str(locked_per_class[cls.id]) + " נעולות" if locked_per_class.get(cls.id) else ""}).',
                target=cls.display_name,
            ))
        elif load > available * 0.95:
            report.add(Issue(
                SEVERITY_WARNING, 'class_tight',
                f'כיתה {cls.display_name}: {load} שיעורים על {available} משבצות זמינות — צפוף מאוד.',
                target=cls.display_name,
            ))

    # ── check each teacher ────────────────────────────────────────────────
    for tid, hours in teacher_hours.items():
        teacher = teachers.get(tid)
        if not teacher or hours == 0:
            continue
        load = round(hours)
        blocked = blocked_teacher_slots.get(tid, set())
        available = num_slots - len(blocked) - locked_per_teacher.get(tid, 0)
        if load > available:
            blockers = []
            if teacher.day_off:
                blockers.append(f'יום חופש ({teacher.get_day_off_display()})')
            ta_count = sum(1 for c in constraints
                           if c.constraint_type == 'teacher_availability' and c.teacher_id == tid)
            if ta_count:
                blockers.append(f'{ta_count} אילוצי זמינות')
            extra = f' (חסימות: {", ".join(blockers)})' if blockers else ''
            report.add(Issue(
                SEVERITY_BLOCKER, 'teacher_overload',
                f'מורה {teacher}: {load} שיעורים נדרשים '
                f'אך רק {available} משבצות פנויות{extra}.',
                target=str(teacher),
            ))
        elif load > available * 0.95:
            report.add(Issue(
                SEVERITY_WARNING, 'teacher_tight',
                f'מורה {teacher}: {load} שיעורים על {available} משבצות זמינות — צפוף מאוד.',
                target=str(teacher),
            ))

    # ── subject_day_blackout overload per (class, subject) ────────────────
    for (cid, sid), forbidden_days in blocked_class_subject_days.items():
        cls = next((c for c in classes if c.id == cid), None)
        if not cls:
            continue
        subj_hours = round(class_subject_hours.get((cid, sid), 0))
        if subj_hours == 0:
            continue
        # Subject lessons must fit on days NOT forbidden.
        allowed_days = [d for d in slots_by_day if d not in forbidden_days]
        max_per_day = 4  # default cap, same as the solver
        capacity = len(allowed_days) * max_per_day
        if subj_hours > capacity:
            from apps.subjects.models import Subject
            subj = Subject.objects.filter(id=sid).first()
            sname = subj.name_he if subj else f'#{sid}'
            report.add(Issue(
                SEVERITY_BLOCKER, 'blackout_overload',
                f'כיתה {cls.display_name}, מקצוע {sname}: {subj_hours} שיעורים אך '
                f'רק {capacity} משבצות אפשריות אחרי חסימת ימים '
                f'({len(forbidden_days)} ימים חסומים).',
                target=f'{cls.display_name} / {sname}',
            ))

    # Global blackouts (no class FK) — applied to every class taking the subject
    for sid, forbidden_days in blocked_subject_days.items():
        for (cid, s), subj_hours_dec in class_subject_hours.items():
            if s != sid:
                continue
            cls = next((c for c in classes if c.id == cid), None)
            if not cls:
                continue
            subj_hours = round(subj_hours_dec)
            if subj_hours == 0:
                continue
            allowed_days = [d for d in slots_by_day if d not in forbidden_days]
            capacity = len(allowed_days) * 4
            if subj_hours > capacity:
                from apps.subjects.models import Subject
                subj = Subject.objects.filter(id=sid).first()
                sname = subj.name_he if subj else f'#{sid}'
                report.add(Issue(
                    SEVERITY_BLOCKER, 'blackout_overload',
                    f'כיתה {cls.display_name}, מקצוע {sname}: {subj_hours} שיעורים אך '
                    f'רק {capacity} משבצות אפשריות אחרי חסימת ימים גלובלית.',
                    target=f'{cls.display_name} / {sname}',
                ))

    # ── informational counts ──────────────────────────────────────────────
    report.add(Issue(
        SEVERITY_INFO, 'summary',
        f'נבדקו {len(classes)} כיתות, {len(teachers)} מורים, '
        f'{len(constraints)} אילוצים פעילים, {num_slots} משבצות זמן.',
    ))

    return report
