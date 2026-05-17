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


def register(constraint_type: str):
    """Decorator that registers a handler for a Constraint.constraint_type value."""
    def decorator(fn):
        HANDLERS[constraint_type] = fn
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
