"""
Pool-aware timetable solver using Google OR-Tools CP-SAT.

# Model

The school's curriculum is encoded as `TeachingAssignment` rows. Some rows
are "solo" (one teacher delivers a subject to one class) and others are
"pooled" — multiple `TeachingAssignment`s share a `group_key` and form
one ability-track group:

  * The same group of students-from-several-classes meets at the same
    time slots for the subject;
  * Within those slots, students split into ability tracks (5/4/3 יח"ל),
    each taught by a different teacher in parallel.

We build one **ScheduleBlock** per (subject, group_key). The block reserves
``max(track.weekly_hours)`` distinct time slots in the schedule of every
class in the pool. Each track aliases the leading prefix of the block's
slot list, so a 3-יח"ל track with 4 hours alongside a 5-יח"ל track with
8 hours teaches only during the first 4 slots — the same physical slots
both tracks share.

# Solver variables

  * For each block ``B`` of ``h`` hours: ``h`` `IntVar`s in ``[0, num_slots)``,
    all_different (block doesn't double-book itself).
  * Each track in ``B`` re-uses the leading ``track.weekly_hours`` of those
    vars — no copy, no additional constraints needed.

# Constraints

Hard, built-in:

  * No class conflict: for each class, the union of slot-vars across
    every block it belongs to is all_different.
  * No teacher conflict: for each teacher, the union of slot-vars across
    every track they own is all_different.
  * Teacher day-off (Teacher.day_off field, if set): disallow slots
    on that day for the teacher's tracks.
  * Sensible defaults (if no Constraint records override them):
      - max 2 lessons of the same subject per class per day
      - max 8 lessons per class per day
    These are intended to make the resulting timetable feel realistic;
    they can be turned off by adding explicit Constraint records.

Hard, user-defined: anything in ``apps.scheduling.models.Constraint``
that has a registered handler in :mod:`solver.constraints`.

# Output

For each block-slot, we emit one ``TimetableEntry`` per
``(class_in_pool, track_active_at_that_slot)``. So an 8-hour math block
across 6 classes with 3/4/5-יח"ל tracks creates:

  * Slots 0..3:  6 classes × 3 tracks = 18 entries each (× 4 slots = 72)
  * Slots 4..5:  6 classes × 2 tracks = 12 entries each (× 2 = 24)
  * Slots 6..7:  6 classes × 1 track  = 6 entries each (× 2 = 12)

…which lets the export sheets show each teacher's individual timetable
correctly.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from ortools.sat.python import cp_model

from apps.school.models import SchoolClass, TimeSlot
from apps.subjects.models import Teacher, TeachingAssignment
from apps.scheduling.models import Constraint, TimetableEntry

from solver.constraints import (
    HANDLERS, Lesson, SolverContext, apply_teacher_day_off,
)


# ─────────────────────────────────────────────────────────────────────────────
# Dataclasses
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Track:
    """One teacher's piece of a ScheduleBlock — `weekly_hours` slots
    (the leading prefix of the block's slot list)."""

    assignment: TeachingAssignment
    teacher_id: int
    weekly_hours: int
    slot_vars: list = field(default_factory=list)  # aliases into block.slot_vars


@dataclass
class ScheduleBlock:
    """One scheduling unit. Solo lessons are blocks of a single track."""

    subject_id: int
    group_key: str
    class_ids: list[int]   # all classes the block serves (primary + extras)
    tracks: list[Track] = field(default_factory=list)
    hours: int = 0
    slot_vars: list = field(default_factory=list)  # the block's "timeline"


# ─────────────────────────────────────────────────────────────────────────────
# Grouping assignments into blocks
# ─────────────────────────────────────────────────────────────────────────────

def _build_blocks(assignments: list[TeachingAssignment]) -> list[ScheduleBlock]:
    """Group assignments into ScheduleBlocks.

    Pool members share a non-empty ``group_key``. Solo lessons fall into
    their own synthetic singleton bucket so they pass through the same
    code path.

    When a single teacher appears in multiple rows of the same pool
    (e.g., teaches two parallel sub-groups), we MERGE them into one
    track with summed hours — the Excel represents this as two rows
    but the teacher is one person who teaches both sub-groups
    consecutively (not in parallel).
    """

    buckets: dict[tuple[int, str], list[TeachingAssignment]] = defaultdict(list)
    for a in assignments:
        key = (a.subject_id, a.group_key) if a.group_key else (a.subject_id, f'solo#{a.id}')
        buckets[key].append(a)

    blocks: list[ScheduleBlock] = []
    for (subject_id, group_key), members in buckets.items():
        class_ids: set[int] = set()
        for m in members:
            class_ids.add(m.school_class_id)
            class_ids.update(m.additional_classes.values_list('id', flat=True))

        # Sum hours per teacher across the bucket (a teacher in two rows
        # of one pool teaches both serially). Skip rows without hours.
        hours_by_teacher: dict[int, int] = defaultdict(int)
        first_assignment_for_teacher: dict[int, TeachingAssignment] = {}
        for m in members:
            h = int(m.weekly_hours or 0)
            if h <= 0:
                continue
            hours_by_teacher[m.teacher_id] += h
            first_assignment_for_teacher.setdefault(m.teacher_id, m)

        tracks: list[Track] = [
            Track(
                assignment=first_assignment_for_teacher[tid],
                teacher_id=tid,
                weekly_hours=h,
            )
            for tid, h in hours_by_teacher.items()
        ]
        if not tracks:
            continue
        block_hours = max(t.weekly_hours for t in tracks)
        blocks.append(ScheduleBlock(
            subject_id=subject_id,
            group_key='' if group_key.startswith('solo#') else group_key,
            class_ids=sorted(class_ids),
            tracks=tracks,
            hours=block_hours,
        ))
    return blocks


# ─────────────────────────────────────────────────────────────────────────────
# Default constraint application
# ─────────────────────────────────────────────────────────────────────────────

def _apply_default_constraints(
    model: cp_model.CpModel,
    blocks: list[ScheduleBlock],
    time_slots: list,
    slots_by_day: dict[int, list[int]],
    user_constraints: list[Constraint],
):
    """Apply lightweight defaults so the output looks like a real timetable.

    Skipped if the user has set their own Constraint record for the same
    intent (we look for ``max_daily_hours_class`` or ``consecutive_hours``
    records as overrides).

    The encoding uses a per-slot ``slot → day`` lookup table built once
    and applied as ``element`` constraints — far cheaper than ``N × M``
    bool variables per (class, day).
    """
    have_max_per_day_class = any(
        c.constraint_type == 'max_daily_hours_class' for c in user_constraints
    )
    have_subject_spread = any(
        c.constraint_type == 'consecutive_hours' for c in user_constraints
    )
    if have_max_per_day_class and have_subject_spread:
        return

    # Pre-compute the day index for each slot — used as the lookup table
    # for the `element` constraint that maps a slot-var → day-var.
    days = sorted(slots_by_day.keys())
    day_index = {d: i for i, d in enumerate(days)}
    slot_to_day = [day_index[ts.day] for ts in time_slots]

    # For each slot-var, build a day-var via add_element.
    # Reuse vars across iterations — one day-var per slot-var.
    day_var_for: dict[int, Any] = {}  # id(slot_var) → day_var

    def get_day_var(slot_var):
        key = id(slot_var)
        cached = day_var_for.get(key)
        if cached is not None:
            return cached
        dv = model.new_int_var(0, len(days) - 1, '')
        model.add_element(slot_var, slot_to_day, dv)
        day_var_for[key] = dv
        return dv

    # Bucket vars per class and per (class, subject).
    by_class: dict[int, list] = defaultdict(list)
    by_class_subject: dict[tuple[int, int], list] = defaultdict(list)
    for b in blocks:
        for var in b.slot_vars:
            for cid in b.class_ids:
                by_class[cid].append(var)
                by_class_subject[(cid, b.subject_id)].append(var)

    if not have_max_per_day_class:
        # Cap lessons per day per class at 10 (the school's 10-period day).
        for cid, vars_list in by_class.items():
            day_vars = [get_day_var(v) for v in vars_list]
            for d_idx in range(len(days)):
                # Indicator bools: day_vars[i] == d_idx
                indicators = []
                for dv in day_vars:
                    b = model.new_bool_var('')
                    model.add(dv == d_idx).only_enforce_if(b)
                    model.add(dv != d_idx).only_enforce_if(b.negated())
                    indicators.append(b)
                if indicators:
                    model.add(sum(indicators) <= 10)

    if not have_subject_spread:
        # Default: max 4 lessons of a single subject per class per day.
        # Tighter is desirable but interacts poorly with pool blocks
        # where multiple PE/art "subject duplicates" plus teacher day-offs
        # over-constrain the model. Set a tighter Constraint(consecutive_hours)
        # record per (subject, class) when needed.
        for (cid, sid), vars_list in by_class_subject.items():
            if len(vars_list) <= 4:
                continue
            day_vars = [get_day_var(v) for v in vars_list]
            for d_idx in range(len(days)):
                indicators = []
                for dv in day_vars:
                    b = model.new_bool_var('')
                    model.add(dv == d_idx).only_enforce_if(b)
                    model.add(dv != d_idx).only_enforce_if(b.negated())
                    indicators.append(b)
                if indicators:
                    model.add(sum(indicators) <= 4)


# ─────────────────────────────────────────────────────────────────────────────
# Solver entry point
# ─────────────────────────────────────────────────────────────────────────────

def solve_timetable(timetable, *, max_time_seconds: int = 300):
    """Generate ``timetable`` using CP-SAT.

    Returns True on success (TimetableEntries written + solver_log set).
    On failure, sets a descriptive solver_log and returns False without
    touching existing entries (so the caller can retry safely).
    """
    school = timetable.school

    classes = list(SchoolClass.objects.filter(grade__school=school))
    time_slots = list(TimeSlot.objects.filter(school=school).order_by('day', 'period'))
    assignments = list(
        TeachingAssignment.objects
        .filter(subject__school=school, is_active=True, teacher__isnull=False)
        .select_related('subject', 'teacher', 'school_class')
        .prefetch_related('additional_classes')
    )
    user_constraints = list(
        Constraint.objects.filter(school=school, is_active=True)
    )
    teachers_by_id = {t.id: t for t in Teacher.objects.filter(school=school)}

    if not classes or not time_slots:
        timetable.solver_log = 'חסרים נתונים: כיתות או משבצות זמן'
        return False
    if not assignments:
        timetable.solver_log = 'אין שיבוצי הוראה פעילים עם מורה מוקצה'
        return False

    blocks = _build_blocks(assignments)
    if not blocks:
        timetable.solver_log = 'אין בלוקים לתזמון (כל השיבוצים ללא שעות)'
        return False

    num_slots = len(time_slots)
    model = cp_model.CpModel()

    # Step 1: create block-level slot vars; alias the leading prefix into tracks.
    for b in blocks:
        b.slot_vars = [
            model.new_int_var(0, num_slots - 1, f'block_{b.subject_id}_{b.group_key or "solo"}_{i}')
            for i in range(b.hours)
        ]
        # The block's own slots are distinct (so an 8h math block uses 8
        # different time slots, not all 8 piled into one period).
        if b.hours > 1:
            model.add_all_different(b.slot_vars)
        # Aliasing — no new variables for tracks.
        for t in b.tracks:
            t.slot_vars = b.slot_vars[: t.weekly_hours]

    # Step 2: per-class all_different.
    vars_by_class: dict[int, list] = defaultdict(list)
    for b in blocks:
        for cid in b.class_ids:
            vars_by_class[cid].extend(b.slot_vars)
    for cid, vars_list in vars_by_class.items():
        if len(vars_list) > 1:
            model.add_all_different(vars_list)

    # Step 3: per-teacher all_different (across all of their tracks).
    vars_by_teacher: dict[int, list] = defaultdict(list)
    for b in blocks:
        for t in b.tracks:
            vars_by_teacher[t.teacher_id].extend(t.slot_vars)
    for tid, vars_list in vars_by_teacher.items():
        if len(vars_list) > 1:
            model.add_all_different(vars_list)

    # Step 4: teacher day-off — disallow slots on the day.
    slots_by_day: dict[int, list[int]] = defaultdict(list)
    for i, ts in enumerate(time_slots):
        slots_by_day[ts.day].append(i)
    for tid, vars_list in vars_by_teacher.items():
        teacher = teachers_by_id.get(tid)
        if not teacher or teacher.day_off is None:
            continue
        bad_slots = set(slots_by_day.get(teacher.day_off, []))
        for v in vars_list:
            for s in bad_slots:
                model.add(v != s)

    # Step 5: user-defined Constraint records. We re-use the existing
    # registry by building a virtual Lesson list (one per (track, hour)).
    lessons: list[Lesson] = []
    pool_classes: dict[int, list[int]] = {}
    for b in blocks:
        for t in b.tracks:
            pool_classes[t.assignment.id] = list(b.class_ids)
            for var in t.slot_vars:
                lessons.append(Lesson(
                    idx=len(lessons),
                    assignment=t.assignment,
                    var=var,
                ))
    ctx = SolverContext(model, time_slots, lessons, pool_classes=pool_classes)
    unhandled: list[str] = []
    for c in user_constraints:
        handler = HANDLERS.get(c.constraint_type)
        if handler is None:
            unhandled.append(c.constraint_type)
            continue
        handler(ctx, c)

    # Step 6: sane defaults (max-per-day for class and per-subject spread)
    # unless user constraints already cover them.
    _apply_default_constraints(model, blocks, time_slots, slots_by_day, user_constraints)

    # ── Solve ────────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.num_search_workers = 8
    solver.parameters.linearization_level = 2

    # Steer the search: pin the most-constrained blocks first.
    biggest_blocks = sorted(blocks, key=lambda b: -(b.hours * len(b.class_ids)))
    decision_vars = [v for b in biggest_blocks for v in b.slot_vars]
    if decision_vars:
        model.add_decision_strategy(
            decision_vars, cp_model.CHOOSE_FIRST, cp_model.SELECT_MIN_VALUE,
        )

    status = solver.solve(model)
    status_label = {
        cp_model.OPTIMAL: 'אופטימלי',
        cp_model.FEASIBLE: 'ישים',
        cp_model.INFEASIBLE: 'לא ישים',
        cp_model.MODEL_INVALID: 'מודל לא תקין',
        cp_model.UNKNOWN: 'חרג מהזמן',
    }.get(status, f'status={status}')

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        timetable.solver_log = (
            f'הפתרון נכשל: {status_label}\n'
            f'בלוקים: {len(blocks)}, משבצות זמן: {num_slots}, '
            f'מורים: {len(vars_by_teacher)}, כיתות: {len(vars_by_class)}\n'
            f'זמן: {solver.wall_time:.1f} שניות'
        )
        return False

    # ── Materialize TimetableEntry rows ──────────────────────────────────
    TimetableEntry.objects.filter(timetable=timetable).delete()
    entries = []
    for b in blocks:
        for hour_idx, var in enumerate(b.slot_vars):
            slot = time_slots[solver.value(var)]
            # Which tracks are active at this hour? Tracks whose
            # weekly_hours > hour_idx.
            active_tracks = [t for t in b.tracks if t.weekly_hours > hour_idx]
            for t in active_tracks:
                for cid in b.class_ids:
                    entries.append(TimetableEntry(
                        timetable=timetable,
                        school_class_id=cid,
                        subject_id=b.subject_id,
                        teacher_id=t.teacher_id,
                        time_slot=slot,
                    ))
    TimetableEntry.objects.bulk_create(entries, batch_size=1000, ignore_conflicts=True)

    timetable.solver_log = (
        f'פתרון נמצא! ({status_label})\n'
        f'בלוקים: {len(blocks)}, מסילות: {sum(len(b.tracks) for b in blocks)}\n'
        f'שורות מערכת: {len(entries)}\n'
        f'מורים: {len(vars_by_teacher)}, כיתות: {len(vars_by_class)}, '
        f'משבצות זמן: {num_slots}\n'
        f'זמן פתרון: {solver.wall_time:.1f} שניות'
        + (f'\nאילוצים לא נתמכים: {", ".join(set(unhandled))}' if unhandled else '')
    )
    return True
