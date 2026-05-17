"""
Timetable solver using Google OR-Tools CP-SAT.

Variables: each (assignment, lesson_index) gets an int var picking a TimeSlot.
Hard constraints: no class/teacher conflicts, plus everything in solver.constraints.

Pooled assignments (`TeachingAssignment.additional_classes`) are treated as
one lesson delivered to many classes — each class in the pool gets the
lesson at the same time, and the solver enforces the no-class-conflict
constraint across the full pool.
"""
from decimal import Decimal

from ortools.sat.python import cp_model

from apps.school.models import SchoolClass, TimeSlot
from apps.subjects.models import Teacher, TeachingAssignment
from apps.scheduling.models import Constraint, TimetableEntry

from solver.constraints import (
    HANDLERS, Lesson, SolverContext, apply_teacher_day_off,
)


def solve_timetable(timetable):
    """Generate a timetable using constraint programming."""
    school = timetable.school

    classes = list(SchoolClass.objects.filter(grade__school=school))
    time_slots = list(TimeSlot.objects.filter(school=school))
    # Skip inactive assignments ("פתיחה מותנית" / TBD) and those without a
    # teacher — they can't be scheduled until a teacher is assigned.
    assignments = list(
        TeachingAssignment.objects.filter(
            subject__school=school, is_active=True, teacher__isnull=False,
        )
        .select_related('subject', 'teacher', 'school_class')
        .prefetch_related('additional_classes')
    )
    constraints = list(
        Constraint.objects.filter(school=school, is_active=True)
    )
    teachers_by_id = {t.id: t for t in Teacher.objects.filter(school=school)}

    if not classes or not time_slots or not assignments:
        timetable.solver_log = 'חסרים נתונים: כיתות, משבצות זמן, או שיבוצי הוראה פעילים'
        return False

    num_slots = len(time_slots)
    model = cp_model.CpModel()

    # Build the Lesson list. The number of lessons per assignment is the
    # integer part of `weekly_hours` (rounded down — fractional hours are
    # not currently scheduled directly).
    lessons: list[Lesson] = []
    pool_classes: dict[int, list[int]] = {}  # assignment_id → all class IDs covered
    for assignment in assignments:
        hours = int(assignment.weekly_hours)
        if hours <= 0:
            continue
        # All classes the lesson serves — the primary plus any pool members.
        cls_ids = [assignment.school_class_id]
        cls_ids.extend(c.id for c in assignment.additional_classes.all())
        pool_classes[assignment.id] = cls_ids
        for lesson_idx in range(hours):
            var = model.new_int_var(
                0, num_slots - 1, f'a{assignment.id}_l{lesson_idx}'
            )
            lessons.append(Lesson(idx=len(lessons), assignment=assignment, var=var))

    ctx = SolverContext(model, time_slots, lessons, pool_classes=pool_classes)

    # Built-in hard constraints.
    # Teacher conflict: a teacher can be in at most one slot at any time.
    for vars_list in ctx.lessons_by_teacher.values():
        model.add_all_different([L.var for L in vars_list])

    # Class conflict: a class can have at most one lesson per slot.
    # KNOWN LIMITATION: pooled ability-track lessons (high-school math 3/4/5
    # יח"ל) all attach to every member class as separate assignments. This
    # over-constrains the schedule because a single math hour for a class
    # is really 1 of N parallel tracks, not N separate hours. To run the
    # solver against pooled subjects, mark the parallel tracks inactive in
    # the admin, or follow the "tracks scheduled in parallel" plan in the
    # repo notes — the simple all_different here doesn't model that yet.
    for vars_list in ctx.lessons_by_class.values():
        model.add_all_different([L.var for L in vars_list])

    # Teacher day-off (built-in, from Teacher.day_off field)
    apply_teacher_day_off(ctx, teachers_by_id)

    # User-defined Constraint records — dispatch through the registry
    unhandled = []
    for c in constraints:
        handler = HANDLERS.get(c.constraint_type)
        if handler is None:
            unhandled.append(c.constraint_type)
            continue
        handler(ctx, c)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60
    solver.parameters.num_workers = 4

    status = solver.solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        TimetableEntry.objects.filter(timetable=timetable).delete()
        # For pooled assignments, materialize one TimetableEntry per member
        # class so existing exports / views still work as-is.
        entries = []
        for L in lessons:
            a = L.assignment
            slot = time_slots[solver.value(L.var)]
            for cls_id in pool_classes[a.id]:
                entries.append(TimetableEntry(
                    timetable=timetable,
                    school_class_id=cls_id,
                    subject=a.subject,
                    teacher=a.teacher,
                    time_slot=slot,
                ))
        TimetableEntry.objects.bulk_create(entries)

        log = (
            f'פתרון נמצא! סטטוס: {"אופטימלי" if status == cp_model.OPTIMAL else "ישים"}\n'
            f'שיעורים: {len(entries)}\n'
            f'זמן: {solver.wall_time:.1f} שניות'
        )
        if unhandled:
            log += f'\nאילוצים לא נתמכים: {", ".join(set(unhandled))}'
        timetable.solver_log = log
        return True

    status_names = {
        cp_model.INFEASIBLE: 'לא ניתן לפתור - יש סתירה באילוצים',
        cp_model.MODEL_INVALID: 'מודל לא תקין',
        cp_model.UNKNOWN: 'לא נמצא פתרון בזמן המוקצב',
    }
    timetable.solver_log = status_names.get(status, f'סטטוס לא ידוע: {status}')
    return False
