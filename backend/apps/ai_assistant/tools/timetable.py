"""Timetable-module tools: read-only diagnostics + a mutating example.

Mutating tools set `requires_confirmation=True` so the FE shows a preview
card and the user has to approve before the handler runs.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict

from apps.school.models import SchoolClass, TimeSlot
from apps.scheduling.models import Timetable, TimetableEntry
from apps.subjects.models import Subject, Teacher, TeachingAssignment

from .base import Tool, ToolContext, register_tool


# Default school for tools that operate against a single school. Pulled from
# view_state when the FE provided it; otherwise the first school in the DB
# (matches the rest of the app's "default school = id 1" convention).
def _default_school_id(ctx: ToolContext) -> int | None:
    return ctx.view_state.get('school_id') or 1


# ── read-only ─────────────────────────────────────────────────────────────

def _find_conflicts(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Detect double-bookings: same teacher in two places, same class in two
    places, same room in two places — within a single time_slot."""
    timetable_id = input.get('timetable_id') or ctx.view_state.get('timetable_id')
    if not timetable_id:
        return {'error': 'timetable_id is required (or set in view_state)'}

    entries = list(
        TimetableEntry.objects
        .filter(timetable_id=timetable_id)
        .select_related('teacher', 'school_class', 'room', 'subject', 'time_slot')
    )

    by_slot_teacher: Dict[tuple, list] = defaultdict(list)
    by_slot_class: Dict[tuple, list] = defaultdict(list)
    by_slot_room: Dict[tuple, list] = defaultdict(list)
    for e in entries:
        by_slot_teacher[(e.time_slot_id, e.teacher_id)].append(e)
        by_slot_class[(e.time_slot_id, e.school_class_id)].append(e)
        if e.room_id:
            by_slot_room[(e.time_slot_id, e.room_id)].append(e)

    conflicts = []
    pooled_groups = 0

    # Pooling caveat: the data model intentionally allows several entries to
    # share one (slot, teacher) or one (slot, class) — that's an ability-group
    # lesson (הקבצה). A teacher teaches one cross-class group → the solver
    # materializes one row per contributing class; a class splits into parallel
    # tracks → one row per track/teacher. In every such case the rows share the
    # *same subject*. So multiple entries in a slot are a real double-booking
    # ONLY when they span more than one subject; same-subject groupings are
    # intentional pools and must not be reported as conflicts.
    for (_slot, _teacher), es in by_slot_teacher.items():
        if len(es) <= 1:
            continue
        if len({e.subject_id for e in es}) == 1:
            pooled_groups += 1
            continue
        conflicts.append({
            'kind': 'teacher_double_booked',
            'teacher': es[0].teacher.full_name if hasattr(es[0].teacher, 'full_name') else str(es[0].teacher),
            'time_slot': str(es[0].time_slot),
            'entries': [{'id': e.id, 'class': str(e.school_class), 'subject': str(e.subject)} for e in es],
        })
    for (_slot, _cls), es in by_slot_class.items():
        if len(es) <= 1:
            continue
        if len({e.subject_id for e in es}) == 1:
            pooled_groups += 1
            continue
        conflicts.append({
            'kind': 'class_double_booked',
            'class': str(es[0].school_class),
            'time_slot': str(es[0].time_slot),
            'entries': [{'id': e.id, 'subject': str(e.subject), 'teacher': str(e.teacher)} for e in es],
        })
    for (_slot, _room), es in by_slot_room.items():
        if len(es) <= 1:
            continue
        if len({e.subject_id for e in es}) == 1:
            continue  # same pooled lesson sharing its room — not a clash
        conflicts.append({
            'kind': 'room_double_booked',
            'room': str(es[0].room),
            'time_slot': str(es[0].time_slot),
            'entries': [{'id': e.id, 'class': str(e.school_class), 'teacher': str(e.teacher)} for e in es],
        })

    return {
        'count': len(conflicts),
        'conflicts': conflicts[:50],
        # Same-subject co-scheduled groups that were recognised as intentional
        # ability-group pools (הקבצה) and deliberately NOT counted as conflicts.
        'pooled_groups_ignored': pooled_groups,
    }


register_tool(Tool(
    name='find_conflicts',
    description=(
        'Find scheduling conflicts in a timetable: a teacher in two places '
        'at once, a class in two places at once, or a room double-booked. '
        'Ability-group (הקבצה) lessons, where one subject is co-scheduled '
        'across several classes or split across parallel teachers in the same '
        'slot, are intentional and are NOT conflicts; they are reported '
        'separately as "pooled_groups_ignored". Only cross-subject overlaps '
        'count as real conflicts.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'timetable_id': {
                'type': 'integer',
                'description': 'Timetable to inspect. Defaults to the one open in the UI.',
            },
        },
    },
    handler=_find_conflicts,
    modules=['timetable'],
))


def _summarize_timetable(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    timetable_id = input.get('timetable_id') or ctx.view_state.get('timetable_id')
    if not timetable_id:
        return {'error': 'timetable_id is required'}
    tt = Timetable.objects.filter(id=timetable_id).first()
    if not tt:
        return {'error': f'timetable {timetable_id} not found'}

    entries = TimetableEntry.objects.filter(timetable_id=timetable_id)
    return {
        'timetable_id': tt.id,
        'name': tt.name,
        'academic_year': tt.academic_year,
        'status': tt.status,
        'total_entries': entries.count(),
        'distinct_classes': entries.values('school_class_id').distinct().count(),
        'distinct_teachers': entries.values('teacher_id').distinct().count(),
        'distinct_subjects': entries.values('subject_id').distinct().count(),
    }


register_tool(Tool(
    name='summarize_timetable',
    description='High-level stats for a timetable: entry count, class/teacher/subject coverage, status.',
    input_schema={
        'type': 'object',
        'properties': {
            'timetable_id': {'type': 'integer'},
        },
    },
    handler=_summarize_timetable,
    modules=['timetable'],
))


# ── mutating ──────────────────────────────────────────────────────────────

def _move_entry(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Move a TimetableEntry to a different TimeSlot."""
    entry_id = input.get('entry_id')
    target_time_slot_id = input.get('target_time_slot_id')
    if not entry_id or not target_time_slot_id:
        return {'error': 'entry_id and target_time_slot_id are required'}

    entry = TimetableEntry.objects.filter(id=entry_id).first()
    if not entry:
        return {'error': f'entry {entry_id} not found'}

    # Refuse if target slot already has the same class scheduled
    # (the unique_together constraint would also catch this, but a friendlier
    # message is better than a 500).
    clash = TimetableEntry.objects.filter(
        timetable_id=entry.timetable_id,
        school_class_id=entry.school_class_id,
        time_slot_id=target_time_slot_id,
    ).exclude(id=entry.id).first()
    if clash:
        return {
            'error': 'target slot already has a lesson for this class',
            'clash_entry_id': clash.id,
        }

    # Refuse if the teacher is already booked at the target slot. The DB
    # unique key is (timetable, class, slot, teacher) — it includes class,
    # so it would happily let the same teacher land in two classes at once.
    # Guard here so a move never silently creates a teacher double-booking.
    teacher_clash = TimetableEntry.objects.filter(
        timetable_id=entry.timetable_id,
        teacher_id=entry.teacher_id,
        time_slot_id=target_time_slot_id,
    ).exclude(id=entry.id).first()
    if teacher_clash:
        return {
            'error': 'the teacher is already teaching at the target slot',
            'clash_entry_id': teacher_clash.id,
        }

    old_slot = str(entry.time_slot)
    entry.time_slot_id = target_time_slot_id
    entry.save(update_fields=['time_slot'])
    entry.refresh_from_db()
    return {
        'ok': True,
        'entry_id': entry.id,
        'from': old_slot,
        'to': str(entry.time_slot),
    }


register_tool(Tool(
    name='move_entry',
    description=(
        'Move a single timetable entry (lesson) to a different time slot. '
        'This is a mutating action — the user must confirm before it runs.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'entry_id': {'type': 'integer', 'description': 'TimetableEntry.id to move'},
            'target_time_slot_id': {'type': 'integer', 'description': 'TimeSlot.id to move to'},
        },
        'required': ['entry_id', 'target_time_slot_id'],
    },
    handler=_move_entry,
    modules=['timetable'],
    requires_confirmation=True,
    preview_template='להעביר שיעור #{input.entry_id} למשבצת #{input.target_time_slot_id}',
))


# ── discovery (read-only) ─────────────────────────────────────────────────
# These let the model translate "the 8th grade class" into an integer ID
# without forcing the user to dig it out themselves.

def _list_classes(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    qs = SchoolClass.objects.filter(grade__school_id=school_id).select_related('grade')
    return {
        'count': qs.count(),
        'classes': [{
            'id': c.id,
            'display_name': c.display_name,
            'grade': c.grade.name,
            'grade_level': c.grade.level,
            'number': c.number,
            'class_type': c.class_type,
            'student_count': c.student_count,
        } for c in qs],
    }


register_tool(Tool(
    name='list_classes',
    description='List every school class with id, name (e.g. "ז1"), grade level, and student count.',
    input_schema={
        'type': 'object',
        'properties': {'school_id': {'type': 'integer'}},
    },
    handler=_list_classes,
    modules=['timetable', 'data'],
))


def _list_teachers(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    qs = Teacher.objects.filter(school_id=school_id)
    return {
        'count': qs.count(),
        'teachers': [{
            'id': t.id,
            'full_name': str(t),
            'first_name': t.first_name,
            'last_name': t.last_name,
            'max_weekly_hours': t.max_weekly_hours,
            'day_off': t.day_off,
            'day_off_name': t.get_day_off_display() if t.day_off else None,
        } for t in qs],
    }


register_tool(Tool(
    name='list_teachers',
    description='List every teacher with id, full name, max weekly hours, and day off (if any).',
    input_schema={
        'type': 'object',
        'properties': {'school_id': {'type': 'integer'}},
    },
    handler=_list_teachers,
    modules=['timetable', 'data'],
))


def _list_subjects(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    qs = Subject.objects.filter(school_id=school_id)
    return {
        'count': qs.count(),
        'subjects': [{
            'id': s.id,
            'name_he': s.name_he,
            'name_en': s.name_en,
            'requires_consecutive': s.requires_consecutive,
        } for s in qs],
    }


register_tool(Tool(
    name='list_subjects',
    description='List every subject (course) with id, Hebrew name, English name.',
    input_schema={
        'type': 'object',
        'properties': {'school_id': {'type': 'integer'}},
    },
    handler=_list_subjects,
    modules=['timetable', 'data'],
))


def _list_time_slots(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    qs = TimeSlot.objects.filter(school_id=school_id)
    return {
        'count': qs.count(),
        'time_slots': [{
            'id': ts.id,
            'day': ts.day,
            'day_name': ts.get_day_display(),
            'period': ts.period,
            'start_time': ts.start_time.strftime('%H:%M'),
            'end_time': ts.end_time.strftime('%H:%M'),
        } for ts in qs],
    }


register_tool(Tool(
    name='list_time_slots',
    description=(
        'List every time slot with id, day (1=Sun..5=Thu), period number, and times. '
        'Use this to find the TimeSlot.id when the user refers to "Monday period 3".'
    ),
    input_schema={
        'type': 'object',
        'properties': {'school_id': {'type': 'integer'}},
    },
    handler=_list_time_slots,
    modules=['timetable'],
))


def _list_assignments(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Teaching assignments that the solver consumes. Without these, the
    generator has nothing to schedule."""
    school_id = input.get('school_id') or _default_school_id(ctx)
    class_id = input.get('class_id')
    qs = (
        TeachingAssignment.objects
        .filter(school_class__grade__school_id=school_id)
        .select_related('teacher', 'subject', 'school_class', 'school_class__grade')
    )
    if class_id:
        qs = qs.filter(school_class_id=class_id)
    return {
        'count': qs.count(),
        'assignments': [{
            'id': a.id,
            'teacher': str(a.teacher),
            'teacher_id': a.teacher_id,
            'subject': a.subject.name_he,
            'subject_id': a.subject_id,
            'class': a.school_class.display_name,
            'class_id': a.school_class_id,
            'weekly_hours': float(a.weekly_hours),
        } for a in qs[:300]],
    }


register_tool(Tool(
    name='list_assignments',
    description=(
        'List teaching assignments (which teacher teaches which subject to which class, '
        'and for how many weekly hours). The timetable generator uses these as its input. '
        'If the count is 0, the generator has nothing to do — the user needs to import '
        'an Excel file or add assignments manually first.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'school_id': {'type': 'integer'},
            'class_id': {'type': 'integer', 'description': 'Filter to one class only.'},
        },
    },
    handler=_list_assignments,
    modules=['timetable', 'data'],
))


# ── creation + generation (mutating, require confirmation) ────────────────

def _create_timetable(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    name = (input.get('name') or '').strip()
    academic_year = (input.get('academic_year') or '').strip()
    school_id = input.get('school_id') or _default_school_id(ctx)
    if not name:
        return {'error': 'name is required'}
    if not academic_year:
        return {'error': 'academic_year is required (e.g. "2026-2027")'}
    tt = Timetable.objects.create(
        school_id=school_id,
        name=name,
        academic_year=academic_year,
        status=Timetable.Status.DRAFT,
    )
    return {
        'ok': True,
        'timetable_id': tt.id,
        'name': tt.name,
        'academic_year': tt.academic_year,
        'status': tt.status,
    }


register_tool(Tool(
    name='create_timetable',
    description=(
        'Create a new (empty) timetable record. After creation it has status="draft" '
        'with no entries. Run the generator afterwards to fill it in, or add entries manually.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'name': {'type': 'string', 'description': 'Human-readable name, e.g. "מערכת תשפ״ז"'},
            'academic_year': {'type': 'string', 'description': 'e.g. "2026-2027"'},
            'school_id': {'type': 'integer'},
        },
        'required': ['name', 'academic_year'],
    },
    handler=_create_timetable,
    modules=['timetable', 'global'],
    requires_confirmation=True,
    preview_template='ליצור מערכת חדשה: "{input.name}" לשנת {input.academic_year}',
))


def _run_generator(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Kick off a timetable build in the background and return immediately.

    Mirrors POST /api/timetables/{id}/generate/. The build runs in a
    daemon thread (see apps.scheduling.tasks); the Timetable row's
    ``status`` is the source of truth and flips from ``generating``
    to ``completed`` / ``failed`` when the solver returns.
    """
    timetable_id = input.get('timetable_id') or ctx.view_state.get('timetable_id')
    if not timetable_id:
        return {'error': 'timetable_id is required'}

    tt = Timetable.objects.filter(id=timetable_id).first()
    if not tt:
        return {'error': f'timetable {timetable_id} not found'}

    # Refuse if there are no assignments to schedule — saves the user a
    # 30-second wait that would only end in failure.
    has_assignments = TeachingAssignment.objects.filter(
        school_class__grade__school_id=tt.school_id,
    ).exists()
    if not has_assignments:
        return {
            'error': (
                'No teaching assignments exist for this school. The builder has '
                'nothing to schedule. Import an Excel file or add assignments first.'
            ),
        }

    from apps.scheduling.tasks import is_generating, start_generation
    if is_generating(tt.id):
        return {
            'status': 'already_running',
            'timetable_id': tt.id,
            'detail': 'A build is already running for this timetable; wait for it to finish.',
        }
    start_generation(tt)
    return {
        'status': 'started',
        'timetable_id': tt.id,
        'detail': (
            'Background build started. Call summarize_timetable or read the '
            'timetable again in 30-60s to see completion.'
        ),
    }


register_tool(Tool(
    name='run_generator',
    description=(
        'Start a background build of the timetable (OR-Tools constraint solver) '
        'based on the school\'s teaching assignments and constraints. Returns '
        "immediately with status='started'; the build's outcome lands on the "
        'Timetable.status field a few seconds to minutes later. Mutating: '
        'replaces any existing entries on this timetable when it completes.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'timetable_id': {
                'type': 'integer',
                'description': 'Timetable to (re)build. Defaults to the one open in the UI.',
            },
        },
    },
    handler=_run_generator,
    modules=['timetable'],
    requires_confirmation=True,
    preview_template='להתחיל בנייה אוטומטית של מערכת #{input.timetable_id} (תחליף שיעורים קיימים)',
))


def _explain_lesson(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Return the context behind a specific lesson — why is it scheduled at
    this slot? Surfaces the teacher's other lessons that day, the class's
    constraints, and any rules the solver took into account."""
    entry_id = input.get('entry_id')
    if not entry_id:
        return {'error': 'pass entry_id'}
    entry = (
        TimetableEntry.objects
        .filter(id=entry_id)
        .select_related('teacher', 'school_class__grade', 'subject', 'time_slot', 'timetable')
        .first()
    )
    if not entry:
        return {'error': f'entry {entry_id} not found'}

    day = entry.time_slot.day
    period = entry.time_slot.period

    # Teacher's day at a glance
    teacher_day = list(
        TimetableEntry.objects
        .filter(timetable=entry.timetable, teacher=entry.teacher, time_slot__day=day)
        .select_related('school_class__grade', 'subject', 'time_slot')
        .order_by('time_slot__period')
    )
    # Class's day at a glance
    class_day = list(
        TimetableEntry.objects
        .filter(timetable=entry.timetable, school_class=entry.school_class, time_slot__day=day)
        .select_related('teacher', 'subject', 'time_slot')
        .order_by('time_slot__period')
    )

    return {
        'entry_id': entry.id,
        'subject': entry.subject.name_he,
        'teacher': str(entry.teacher),
        'class': entry.school_class.display_name,
        'day': day,
        'period': period,
        'is_locked': entry.locked,
        'teacher_day': [
            {'period': e.time_slot.period, 'class': e.school_class.display_name,
             'subject': e.subject.name_he}
            for e in teacher_day
        ],
        'class_day': [
            {'period': e.time_slot.period, 'subject': e.subject.name_he,
             'teacher': str(e.teacher) if e.teacher else '—'}
            for e in class_day
        ],
        'teacher_day_off': entry.teacher.day_off,
        'context_summary': (
            f'מורה {entry.teacher} מלמד {entry.subject.name_he} לכיתה '
            f'{entry.school_class.display_name} בשעה {period} ביום {day}. '
            f'באותו היום למורה {len(teacher_day)} שיעורים סך הכל. '
            f'באותו יום לכיתה {len(class_day)} שיעורים סך הכל.'
        ),
    }


register_tool(Tool(
    name='explain_lesson',
    description=(
        'Explain why a specific lesson sits where it does in the timetable: '
        'shows the teacher\'s whole day, the class\'s whole day, the '
        'teacher\'s day-off (if any), and a one-line summary. Use this when '
        'the user clicks "why is X here?" on a cell.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'entry_id': {
                'type': 'integer',
                'description': 'TimetableEntry id from the URL or grid.',
            },
        },
        'required': ['entry_id'],
    },
    handler=_explain_lesson,
    modules=['timetable'],
))


def _suggest_improvements(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Identify the top-3 highest-impact swaps that would reduce teacher
    windows. Heuristic: find teachers with windows, look for moves that
    fill the gap or move a window-creating lesson to a better slot."""
    timetable_id = input.get('timetable_id') or ctx.view_state.get('timetable_id')
    if not timetable_id:
        return {'error': 'timetable_id required'}
    entries = list(
        TimetableEntry.objects.filter(timetable_id=timetable_id)
        .select_related('teacher', 'school_class__grade', 'subject', 'time_slot')
    )
    if not entries:
        return {'error': 'no entries'}

    # Per-teacher per-day periods.
    by_t_d = defaultdict(lambda: defaultdict(set))
    for e in entries:
        if e.teacher_id:
            by_t_d[e.teacher_id][e.time_slot.day].add(e.time_slot.period)

    suggestions = []
    for tid, days in by_t_d.items():
        for day, periods in days.items():
            if len(periods) < 2:
                continue
            sorted_p = sorted(periods)
            for prev, cur in zip(sorted_p, sorted_p[1:]):
                if cur - prev > 1:
                    gap_size = cur - prev - 1
                    # Find an entry of this teacher at `prev` and an entry
                    # somewhere later in the week that could swap in.
                    if gap_size >= 1:
                        suggestions.append({
                            'teacher_id': tid,
                            'day': day,
                            'gap_periods': list(range(prev + 1, cur)),
                            'gap_size': gap_size,
                            'description': (
                                f'מורה #{tid} ביום {day} מלמד בשעה {prev} ואז בשעה {cur} — '
                                f'יש פער של {gap_size} שעות שניתן לסגור על ידי הזזת '
                                f'שיעור משעה אחרת.'
                            ),
                        })

    suggestions.sort(key=lambda s: -s['gap_size'])
    return {
        'suggestions': suggestions[:3],
        'note': (
            'אלו הצעות אוטומטיות מבוססות-היוריסטיקה. למימוש בפועל הריצו את '
            'בנייה אוטומטית מחדש אחרי הוספת אילוצים מתאימים.'
        ),
    }


register_tool(Tool(
    name='suggest_improvements',
    description=(
        'Suggest the top-3 changes that would most reduce teacher windows '
        'in the current timetable. Returns a list of (teacher, day, gap) '
        'tuples ranked by gap size.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'timetable_id': {
                'type': 'integer',
                'description': 'Defaults to the timetable open in the UI.',
            },
        },
    },
    handler=_suggest_improvements,
    modules=['timetable'],
))


# ── editing an existing timetable (read targets, then mutate) ──────────────
# These are the heart of "ask the AI to change the schedule": the model reads
# the grid for a class or teacher (entry ids + which slots are free), then
# calls move_entry / swap_entries to actually rearrange the existing lessons.

def _get_schedule(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Return the existing lessons for one class or one teacher in a
    timetable — including each lesson's entry_id and time_slot_id, plus the
    slots that entity has free. This is what lets the model pick *what* to
    move and *where* it may legally land."""
    timetable_id = input.get('timetable_id') or ctx.view_state.get('timetable_id')
    if not timetable_id:
        return {'error': 'timetable_id is required (or open a timetable in the UI)'}
    tt = Timetable.objects.filter(id=timetable_id).first()
    if not tt:
        return {'error': f'timetable {timetable_id} not found'}

    class_id = input.get('class_id')
    teacher_id = input.get('teacher_id')
    if not class_id and not teacher_id:
        return {'error': 'provide class_id or teacher_id'}
    day = input.get('day')

    qs = (
        TimetableEntry.objects
        .filter(timetable_id=timetable_id)
        .select_related('subject', 'teacher', 'school_class__grade', 'time_slot')
    )
    if class_id:
        qs = qs.filter(school_class_id=class_id)
    if teacher_id:
        qs = qs.filter(teacher_id=teacher_id)
    if day:
        qs = qs.filter(time_slot__day=day)
    qs = qs.order_by('time_slot__day', 'time_slot__period')

    entries = [{
        'entry_id': e.id,
        'time_slot_id': e.time_slot_id,
        'day': e.time_slot.day,
        'period': e.time_slot.period,
        'subject': e.subject.name_he,
        'teacher': str(e.teacher),
        'teacher_id': e.teacher_id,
        'class': e.school_class.display_name,
        'class_id': e.school_class_id,
        'locked': e.locked,
    } for e in qs]

    # Free slots for this entity = the school's slots it isn't already in.
    # These are the only valid move_entry targets that won't collide.
    occ_qs = TimetableEntry.objects.filter(timetable_id=timetable_id)
    occ_qs = occ_qs.filter(school_class_id=class_id) if class_id else occ_qs.filter(teacher_id=teacher_id)
    occupied = set(occ_qs.values_list('time_slot_id', flat=True))
    free_slots = [{
        'time_slot_id': ts.id, 'day': ts.day, 'period': ts.period,
    } for ts in TimeSlot.objects.filter(school_id=tt.school_id).order_by('day', 'period')
        if ts.id not in occupied and (not day or ts.day == day)]

    return {
        'timetable_id': timetable_id,
        'filter': {'class_id': class_id, 'teacher_id': teacher_id, 'day': day},
        'entry_count': len(entries),
        'entries': entries,
        'free_slots': free_slots,
    }


register_tool(Tool(
    name='get_schedule',
    description=(
        'Read the existing lessons for ONE class or ONE teacher in a '
        'timetable. Returns each lesson with its entry_id and time_slot_id '
        '(so you can move or swap it) plus the slots that class/teacher has '
        'free (valid move targets). Call this FIRST whenever the user asks '
        'to move, swap, or rearrange lessons in an existing timetable — it '
        'is how you discover the entry_id and target_time_slot_id that '
        'move_entry and swap_entries need. Filter by day (1=Sun..5=Thu) to '
        'narrow it down.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'timetable_id': {'type': 'integer', 'description': 'Defaults to the timetable open in the UI.'},
            'class_id': {'type': 'integer', 'description': 'Show this class\'s schedule.'},
            'teacher_id': {'type': 'integer', 'description': 'Show this teacher\'s schedule.'},
            'day': {'type': 'integer', 'description': 'Optional: only this day, 1=Sun..5=Thu.'},
        },
    },
    handler=_get_schedule,
    modules=['timetable'],
))


# A swap is its own inverse, so if the model re-issues the same swap (it
# sometimes "double-checks" by reading the grid and swapping again) an even
# number of calls would silently revert the user's change. Treat an identical
# swap repeated within this window as a no-op so the first one always sticks.
_recent_swaps: Dict[Any, float] = {}
_SWAP_DEDUP_TTL_SECONDS = 30.0


def _swap_entries(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Swap the time slots of two existing lessons. Use when the target slot
    is already occupied (the common case in a dense timetable) and a plain
    move_entry would be refused."""
    import time
    from django.db import IntegrityError, transaction

    a_id = input.get('entry_id_a')
    b_id = input.get('entry_id_b')
    if not a_id or not b_id:
        return {'error': 'entry_id_a and entry_id_b are required'}
    if a_id == b_id:
        return {'error': 'the two entries must be different'}

    a = TimetableEntry.objects.filter(id=a_id).select_related('time_slot').first()
    b = TimetableEntry.objects.filter(id=b_id).select_related('time_slot').first()
    if not a or not b:
        return {'error': 'one or both entries not found'}
    if a.timetable_id != b.timetable_id:
        return {'error': 'the two entries belong to different timetables'}
    # Same class AND teacher would trip the unique key mid-swap, and the
    # request is ambiguous anyway — ask for two move_entry calls instead.
    if a.school_class_id == b.school_class_id and a.teacher_id == b.teacher_id:
        return {'error': 'these two lessons share the same class and teacher; move them one at a time with move_entry'}

    # Idempotency guard against the model re-issuing the same swap.
    now = time.time()
    key = (a.timetable_id, frozenset((a.id, b.id)))
    for k, ts in list(_recent_swaps.items()):       # prune stale entries
        if now - ts > _SWAP_DEDUP_TTL_SECONDS:
            _recent_swaps.pop(k, None)
    if key in _recent_swaps:
        return {
            'ok': True,
            'already_applied': True,
            'note': ('This exact swap was just applied moments ago — skipping to '
                     'avoid reverting it. The schedule already reflects the change.'),
            'entries': [a.id, b.id],
        }

    a_slot_str, b_slot_str = str(a.time_slot), str(b.time_slot)
    try:
        with transaction.atomic():
            a.time_slot_id, b.time_slot_id = b.time_slot_id, a.time_slot_id
            a.save(update_fields=['time_slot'])
            b.save(update_fields=['time_slot'])
    except IntegrityError as exc:
        return {'error': f'swap would create a scheduling conflict ({exc})'}

    _recent_swaps[key] = now
    return {
        'ok': True,
        'swapped': [
            {'entry_id': a.id, 'from': a_slot_str, 'to': b_slot_str},
            {'entry_id': b.id, 'from': b_slot_str, 'to': a_slot_str},
        ],
    }


register_tool(Tool(
    name='swap_entries',
    description=(
        'Swap the time slots of two existing lessons in a timetable. Use '
        'this (instead of move_entry) when you want lesson A to take lesson '
        "B's slot and vice-versa — e.g. the user wants two lessons to trade "
        'places, or the target slot is occupied. Mutating — the user must '
        'confirm. Find the two entry ids with get_schedule first.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'entry_id_a': {'type': 'integer', 'description': 'First lesson (TimetableEntry.id).'},
            'entry_id_b': {'type': 'integer', 'description': 'Second lesson (TimetableEntry.id).'},
        },
        'required': ['entry_id_a', 'entry_id_b'],
    },
    handler=_swap_entries,
    modules=['timetable'],
    requires_confirmation=True,
    preview_template='להחליף בין שיעור #{input.entry_id_a} לשיעור #{input.entry_id_b}',
))
