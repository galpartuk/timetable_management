"""
Constraint handler registry for the timetable solver.

To add a new constraint type:
1. Add an enum value in apps.scheduling.models.Constraint.ConstraintType
2. Write a handler function here and decorate it with @register('your_type')
3. Add a form schema entry in the Constraints page on the frontend

Each handler receives a SolverContext and a Constraint record. The handler
adds CP-SAT constraints to ctx.model. Soft constraints are not yet supported;
all handlers add hard constraints via model.add().
"""
from dataclasses import dataclass, field
from typing import Callable

from ortools.sat.python import cp_model


HANDLERS: dict[str, Callable] = {}
# Soft handlers receive (ctx, constraint, soft_weight) and return a list
# of boolean indicators to be summed into the objective with `soft_weight`
# applied per indicator. The engine consults this map when a Constraint
# record has priority='soft'.
SOFT_HANDLERS: dict[str, Callable] = {}


def register(constraint_type: str):
    """Decorator that registers a handler for a Constraint.constraint_type value."""
    def decorator(fn):
        HANDLERS[constraint_type] = fn
        return fn
    return decorator


def register_soft(constraint_type: str):
    """Decorator for a soft-variant handler. Should return a list of
    bool vars representing constraint violations — each violated bool
    will be weighted into the objective."""
    def decorator(fn):
        SOFT_HANDLERS[constraint_type] = fn
        return fn
    return decorator


@dataclass
class Lesson:
    idx: int
    assignment: object
    var: object


class SolverContext:
    """Shared state for constraint handlers — owns the model, lessons, and lazy bool indicators."""

    def __init__(
        self,
        model: cp_model.CpModel,
        time_slots,
        lessons: list[Lesson],
        pool_classes: dict[int, list[int]] | None = None,
    ):
        self.model = model
        self.time_slots = time_slots
        self.num_slots = len(time_slots)
        self.lessons = lessons
        # Map: assignment_id → list of class_ids this lesson is delivered to.
        # For non-pooled assignments this is a singleton list. We use it to
        # ensure the no-class-conflict constraint covers every class in the
        # pool (not just the primary).
        self.pool_classes = pool_classes or {}

        self.ts_index = {ts.id: i for i, ts in enumerate(time_slots)}
        self.slots_by_day: dict[int, list[int]] = {}
        for i, ts in enumerate(time_slots):
            self.slots_by_day.setdefault(ts.day, []).append(i)

        self.lessons_by_class: dict[int, list[Lesson]] = {}
        self.lessons_by_teacher: dict[int, list[Lesson]] = {}
        self.lessons_by_class_subject: dict[tuple[int, int], list[Lesson]] = {}
        for L in lessons:
            a = L.assignment
            # A pooled lesson appears in every member-class's lesson list,
            # so the "no two lessons at the same slot for one class" constraint
            # blocks any class in the pool from a conflicting subject.
            class_ids = self.pool_classes.get(a.id) or [a.school_class_id]
            for cid in class_ids:
                self.lessons_by_class.setdefault(cid, []).append(L)
                self.lessons_by_class_subject.setdefault(
                    (cid, a.subject_id), []
                ).append(L)
            self.lessons_by_teacher.setdefault(a.teacher_id, []).append(L)

        self._at_slot: dict[tuple[int, int], object] = {}

    def at_slot(self, lesson_idx: int, slot_idx: int):
        """Lazy bool var: true iff the given lesson is assigned to the given slot."""
        key = (lesson_idx, slot_idx)
        cached = self._at_slot.get(key)
        if cached is not None:
            return cached
        var = self.lessons[lesson_idx].var
        b = self.model.new_bool_var(f'at_l{lesson_idx}_s{slot_idx}')
        self.model.add(var == slot_idx).only_enforce_if(b)
        self.model.add(var != slot_idx).only_enforce_if(b.negated())
        self._at_slot[key] = b
        return b

    def day_count(self, lessons: list[Lesson], day: int):
        """Sum-expression: how many of the given lessons fall on the given day."""
        day_slots = self.slots_by_day.get(day, [])
        return sum(self.at_slot(L.idx, s) for L in lessons for s in day_slots)


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

@register('group_blocked_slot')
def group_blocked_slot(ctx: SolverContext, c):
    """Block every teacher in the constraint's tag at the listed slots.

    parameters: {"slots": [{"day": 3, "period": 1}, ...]}

    Used for staff meetings, team coordination periods, etc. — instead
    of writing one teacher_availability constraint per person, tag the
    group once and reference the tag here.
    """
    if not c.tag_id:
        return
    # Local import — avoid circular when scheduling imports the solver.
    from apps.subjects.models import TeacherTag
    try:
        tag = TeacherTag.objects.prefetch_related('teachers').get(id=c.tag_id)
    except TeacherTag.DoesNotExist:
        return
    slots = c.parameters.get('slots')
    if not slots:
        # Frontend uses a flatter shape: {day: 3, periods: [1, 2]}.
        # Expand to the canonical {slots: [{day, period}]} list.
        day_val = c.parameters.get('day')
        periods = c.parameters.get('periods') or []
        if day_val is not None and periods:
            slots = [{'day': day_val, 'period': p} for p in periods]
    blocked = set()
    for slot_info in (slots or []):
        d = slot_info.get('day')
        p = slot_info.get('period')
        for ts in ctx.time_slots:
            if ts.day == d and ts.period == p:
                blocked.add(ctx.ts_index[ts.id])
    if not blocked:
        return
    for teacher in tag.teachers.all():
        for L in ctx.lessons_by_teacher.get(teacher.id, []):
            for s in blocked:
                ctx.model.add(L.var != s)


@register('teacher_availability')
def teacher_availability(ctx: SolverContext, c):
    """Block specific (day, period) slots for a teacher.

    parameters: {"unavailable": [{"day": 1, "period": 2}, ...]}
    """
    teacher_id = c.teacher_id
    if not teacher_id:
        return
    bad_slots = set()
    for slot_info in c.parameters.get('unavailable', []):
        day = slot_info.get('day')
        period = slot_info.get('period')
        for ts in ctx.time_slots:
            if ts.day == day and ts.period == period:
                bad_slots.add(ctx.ts_index[ts.id])
    for L in ctx.lessons_by_teacher.get(teacher_id, []):
        for s in bad_slots:
            ctx.model.add(L.var != s)


@register('max_daily_hours_class')
def max_daily_hours_class(ctx: SolverContext, c):
    """Limit lessons per day for a class (or all classes if school_class is null).

    parameters: {"max_hours": int}
    """
    max_hours = int(c.parameters.get('max_hours', 8))
    target = c.school_class_id
    class_ids = [target] if target else list(ctx.lessons_by_class.keys())
    for class_id in class_ids:
        lessons = ctx.lessons_by_class.get(class_id, [])
        if not lessons:
            continue
        for day in ctx.slots_by_day:
            ctx.model.add(ctx.day_count(lessons, day) <= max_hours)


@register('max_daily_hours_teacher')
def max_daily_hours_teacher(ctx: SolverContext, c):
    """Limit lessons per day for a teacher (or all teachers if teacher is null).

    parameters: {"max_hours": int}
    """
    max_hours = int(c.parameters.get('max_hours', 8))
    target = c.teacher_id
    teacher_ids = [target] if target else list(ctx.lessons_by_teacher.keys())
    for teacher_id in teacher_ids:
        lessons = ctx.lessons_by_teacher.get(teacher_id, [])
        if not lessons:
            continue
        for day in ctx.slots_by_day:
            ctx.model.add(ctx.day_count(lessons, day) <= max_hours)


@register('consecutive_hours')
def max_per_day_subject(ctx: SolverContext, c):
    """Limit how many lessons of a subject can land on the same day for a class.
    Despite the legacy enum name, "in a row" here means "in the same day total"
    (e.g., max 2 math periods per day for class 5א).

    parameters: {"max_per_day": int}
    School class and subject filters from the Constraint FKs (null = all).
    """
    max_per_day = int(c.parameters.get('max_per_day', 2))
    target_class = c.school_class_id
    target_subject = c.subject_id
    keys = list(ctx.lessons_by_class_subject.keys())
    if target_class:
        keys = [k for k in keys if k[0] == target_class]
    if target_subject:
        keys = [k for k in keys if k[1] == target_subject]
    for key in keys:
        lessons = ctx.lessons_by_class_subject[key]
        if len(lessons) <= max_per_day:
            continue
        for day in ctx.slots_by_day:
            ctx.model.add(ctx.day_count(lessons, day) <= max_per_day)


@register('lunch_break')
def lunch_break(ctx: SolverContext, c):
    """Reserve a particular period as no-class for selected classes.

    parameters: {"periods": [5, 6], "days": [1, 2, 3, 4, 5] (optional)}
    School class filter from the Constraint FK (null = all classes).

    Effect: for each (class, day, period) combination matching the rule,
    no lesson can be scheduled there. We add `lesson_var != slot_index`
    for every lesson on every class that the rule applies to.
    """
    periods = c.parameters.get('periods', [5])
    if not isinstance(periods, list):
        periods = [periods]
    days = c.parameters.get('days') or list(ctx.slots_by_day.keys())

    bad_slot_indices = set()
    for ts in ctx.time_slots:
        if ts.day in days and ts.period in periods:
            bad_slot_indices.add(ctx.ts_index[ts.id])

    target_class = c.school_class_id
    class_ids = [target_class] if target_class else list(ctx.lessons_by_class.keys())
    for class_id in class_ids:
        for L in ctx.lessons_by_class.get(class_id, []):
            for s in bad_slot_indices:
                ctx.model.add(L.var != s)


@register('consecutive_pair')
def consecutive_pair(ctx: SolverContext, c):
    """Force selected lessons of a (class, subject) into consecutive
    period pairs on the same day.

    parameters: {"min_pairs": 1}
    School class + subject filters from the Constraint FKs (both required).

    Effect: for each (class, subject) bucket, we add at-least-min_pairs
    pairs where two lessons share a day and their periods differ by
    exactly 1. Useful for subjects that need a double-period block.

    Note: this is a relatively expensive constraint (introduces N×N
    bool variables per bucket) — apply it selectively to the subjects
    that actually need pairing.
    """
    if not c.school_class_id or not c.subject_id:
        return
    min_pairs = int(c.parameters.get('min_pairs', 1))
    key = (c.school_class_id, c.subject_id)
    lessons = ctx.lessons_by_class_subject.get(key, [])
    if len(lessons) < 2:
        return

    # For each pair of lessons (i, j), is_pair[i,j] = 1 iff they're on
    # the same day and consecutive periods.
    period_for_slot = {
        ctx.ts_index[ts.id]: (ts.day, ts.period) for ts in ctx.time_slots
    }
    pair_bools = []
    for i, L1 in enumerate(lessons):
        for L2 in lessons[i + 1:]:
            for s1, (d1, p1) in period_for_slot.items():
                for s2, (d2, p2) in period_for_slot.items():
                    if d1 != d2 or abs(p1 - p2) != 1:
                        continue
                    b = ctx.model.new_bool_var('')
                    # b = 1 iff L1==s1 and L2==s2
                    ctx.model.add(L1.var == s1).only_enforce_if(b)
                    ctx.model.add(L2.var == s2).only_enforce_if(b)
                    pair_bools.append(b)
    if pair_bools:
        ctx.model.add(sum(pair_bools) >= min_pairs)


@register_soft('teacher_availability')
def teacher_availability_soft(ctx: SolverContext, c, soft_weight: int) -> list:
    """Soft variant: each violation (teacher teaches at a flagged slot)
    contributes one penalty bool to the objective.

    parameters: {"unavailable": [{"day": 1, "period": 2}, ...]}
    """
    teacher_id = c.teacher_id
    if not teacher_id:
        return []
    bad_slots = set()
    for slot_info in c.parameters.get('unavailable', []):
        day = slot_info.get('day')
        period = slot_info.get('period')
        for ts in ctx.time_slots:
            if ts.day == day and ts.period == period:
                bad_slots.add(ctx.ts_index[ts.id])
    penalties = []
    for L in ctx.lessons_by_teacher.get(teacher_id, []):
        for s in bad_slots:
            penalties.append(ctx.at_slot(L.idx, s))
    return penalties


@register('subject_day_blackout')
def subject_day_blackout(ctx: SolverContext, c):
    """Forbid a subject from being scheduled on specific days for a class.

    parameters: {"days": [1, 3]}  (Sun=1..Thu=5)
    School class filter from the Constraint FK (null = all classes).
    Subject FK is required — without it the constraint is a no-op.

    Use case: "no English on Tuesdays for grade 7" — fan out one constraint
    per class in the grade (caller's job). consecutive_hours can't model
    this because it applies the cap to every day uniformly.
    """
    if not c.subject_id:
        return
    raw_days = c.parameters.get('days', []) or []
    target_days = [d for d in raw_days if isinstance(d, int) and 1 <= d <= 7]
    if not target_days:
        return

    # Slot indices that fall on a forbidden day.
    bad_slots = set()
    for ts in ctx.time_slots:
        if ts.day in target_days:
            bad_slots.add(ctx.ts_index[ts.id])

    target_class = c.school_class_id
    keys = list(ctx.lessons_by_class_subject.keys())
    if target_class:
        keys = [k for k in keys if k[0] == target_class and k[1] == c.subject_id]
    else:
        keys = [k for k in keys if k[1] == c.subject_id]

    for key in keys:
        for lesson in ctx.lessons_by_class_subject[key]:
            for s in bad_slots:
                ctx.model.add(lesson.var != s)


@register('no_last_period')
def no_last_period(ctx: SolverContext, c):
    """Forbid lessons in the school's last period(s).

    parameters: {"periods": [9, 10]}  // periods considered "last"
    """
    last_periods = set(c.parameters.get('periods', [10]))
    bad_slots = set()
    for ts in ctx.time_slots:
        if ts.period in last_periods:
            bad_slots.add(ctx.ts_index[ts.id])
    targets: list[Lesson] = []
    if c.teacher_id:
        targets = ctx.lessons_by_teacher.get(c.teacher_id, [])
    elif c.school_class_id:
        targets = ctx.lessons_by_class.get(c.school_class_id, [])
    elif c.subject_id:
        targets = [
            L for (cid, sid), lessons in ctx.lessons_by_class_subject.items()
            for L in lessons if sid == c.subject_id
        ]
    else:
        targets = ctx.lessons
    for L in targets:
        for s in bad_slots:
            ctx.model.add(L.var != s)


@register_soft('no_last_period')
def no_last_period_soft(ctx: SolverContext, c, soft_weight: int) -> list:
    """Soft variant — each lesson placed in a "last" period contributes
    a penalty bool to the objective."""
    last_periods = set(c.parameters.get('periods', [10]))
    bad_slots = set()
    for ts in ctx.time_slots:
        if ts.period in last_periods:
            bad_slots.add(ctx.ts_index[ts.id])
    if c.teacher_id:
        targets = ctx.lessons_by_teacher.get(c.teacher_id, [])
    elif c.school_class_id:
        targets = ctx.lessons_by_class.get(c.school_class_id, [])
    elif c.subject_id:
        targets = [
            L for (cid, sid), lessons in ctx.lessons_by_class_subject.items()
            for L in lessons if sid == c.subject_id
        ]
    else:
        targets = ctx.lessons
    return [ctx.at_slot(L.idx, s) for L in targets for s in bad_slots]


def apply_teacher_day_off(ctx: SolverContext, teachers_by_id: dict):
    """Apply the per-teacher day_off field directly. Not a Constraint record —
    this is a built-in attribute on Teacher, so the engine wires it in separately.
    """
    for teacher_id, lessons in ctx.lessons_by_teacher.items():
        teacher = teachers_by_id.get(teacher_id)
        if not teacher or teacher.day_off is None:
            continue
        bad_slots = ctx.slots_by_day.get(teacher.day_off, [])
        for L in lessons:
            for s in bad_slots:
                ctx.model.add(L.var != s)
