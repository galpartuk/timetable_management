"""
Timetable solver using Google OR-Tools CP-SAT.

Variables: each (assignment, lesson_index) gets an int var picking a TimeSlot.
Hard constraints: no class/teacher conflicts, plus everything in solver.constraints.
"""
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
    assignments = list(
        TeachingAssignment.objects.filter(subject__school=school)
        .select_related('subject', 'teacher', 'school_class')
    )
    constraints = list(
        Constraint.objects.filter(school=school, is_active=True)
    )
    teachers_by_id = {t.id: t for t in Teacher.objects.filter(school=school)}

    if not classes or not time_slots or not assignments:
        timetable.solver_log = 'חסרים נתונים: כיתות, משבצות זמן, או שיבוצי הוראה'
        return False

    num_slots = len(time_slots)
    model = cp_model.CpModel()

    lessons: list[Lesson] = []
    for assignment in assignments:
        hours = int(assignment.weekly_hours)
        for lesson_idx in range(hours):
            var = model.new_int_var(
                0, num_slots - 1, f'a{assignment.id}_l{lesson_idx}'
            )
            lessons.append(Lesson(idx=len(lessons), assignment=assignment, var=var))

    ctx = SolverContext(model, time_slots, lessons)

    # Built-in hard constraints
    for vars_list in ctx.lessons_by_class.values():
        model.add_all_different([L.var for L in vars_list])
    for vars_list in ctx.lessons_by_teacher.values():
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
        entries = [
            TimetableEntry(
                timetable=timetable,
                school_class=L.assignment.school_class,
                subject=L.assignment.subject,
                teacher=L.assignment.teacher,
                time_slot=time_slots[solver.value(L.var)],
            )
            for L in lessons
        ]
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
