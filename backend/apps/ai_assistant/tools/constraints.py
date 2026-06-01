"""AI tools for general scheduling constraints — the heart of the
"talk to the assistant to adjust the timetable" workflow.

The user describes an adjustment in natural language; the model picks the
matching constraint_type and calls create_constraint. The next run_generator
rebuilds the timetable honoring it. Only the constraint types the solver
actually enforces are exposed here (see solver/constraints.py):

  teacher_availability      block specific (day, period) slots for a teacher
  max_daily_hours_class     cap lessons/day for a class (or all classes)
  max_daily_hours_teacher   cap lessons/day for a teacher (or all teachers)
  consecutive_hours         cap lessons/day of a subject for a class
  lunch_break               reserve period(s) as no-class for a class (or all)
  consecutive_pair          force a (class, subject) into double-period blocks
  no_last_period            forbid the last period(s) for a teacher/class/subject

Plus set_teacher_day_off, which writes Teacher.day_off (a whole free weekday).
"""
from __future__ import annotations

from typing import Any, Dict

from apps.scheduling.models import Constraint
from apps.school.models import School, SchoolClass, TimeSlot
from apps.subjects.models import Subject, Teacher

from .base import Tool, ToolContext, register_tool
from .tags import _coerce_day


# Marker stored on auto-managed teacher_availability constraints created by
# set_teacher_day_off. Lets us find + replace + delete them idempotently and
# lets the Constraints UI render them as "auto-generated".
AUTO_DAY_OFF_MARKER = 'auto_day_off'


def _default_school_id(ctx: ToolContext) -> int | None:
    return ctx.view_state.get('school_id') or 1


# Constraint types the solver enforces, with the param/FK each needs. Keeping
# this here keeps the tool honest — we never offer a type the solver ignores.
_SUPPORTED = {
    'teacher_availability', 'max_daily_hours_class', 'max_daily_hours_teacher',
    'consecutive_hours', 'lunch_break', 'consecutive_pair', 'no_last_period',
}

_TYPE_LABEL_HE = {
    'teacher_availability': 'זמינות מורה',
    'max_daily_hours_class': 'מקסימום שעות יומי לכיתה',
    'max_daily_hours_teacher': 'מקסימום שעות יומי למורה',
    'consecutive_hours': 'מקסימום שיעורי מקצוע ביום',
    'lunch_break': 'הפסקת אוכל',
    'consecutive_pair': 'שיעורים כפולים רצופים',
    'no_last_period': 'לא בשיעור אחרון',
}


# ── read ────────────────────────────────────────────────────────────────────

def _list_constraints(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    qs = (
        Constraint.objects
        .filter(school_id=school_id)
        .select_related('teacher', 'school_class', 'subject', 'tag')
        .order_by('-is_active', 'constraint_type')
    )
    out = []
    for c in qs:
        params = c.parameters if isinstance(c.parameters, dict) else {}
        out.append({
            'id': c.id,
            'type': c.constraint_type,
            'type_he': _TYPE_LABEL_HE.get(c.constraint_type, c.get_constraint_type_display()),
            'name': c.name,
            'priority': c.priority,
            'is_active': c.is_active,
            'teacher': str(c.teacher) if c.teacher_id else None,
            'class': str(c.school_class) if c.school_class_id else None,
            'subject': str(c.subject) if c.subject_id else None,
            'tag': c.tag.name if c.tag_id else None,
            'parameters': c.parameters,
            'auto_day_off': bool(params.get(AUTO_DAY_OFF_MARKER)),
        })
    return {'count': len(out), 'constraints': out}


register_tool(Tool(
    name='list_constraints',
    description=(
        'List the scheduling constraints (adjustments) already defined for the '
        'school, with their type, target, priority, parameters, and whether '
        'they are active. Use this before creating a new one to avoid '
        'duplicates, or to report/remove an existing rule.'
    ),
    input_schema={
        'type': 'object',
        'properties': {'school_id': {'type': 'integer'}},
    },
    handler=_list_constraints,
    modules=['timetable', 'constraints', 'global'],
))


# ── create ──────────────────────────────────────────────────────────────────

def _resolve(model, obj_id, school_id, *, by_grade=False):
    if not obj_id:
        return None, None
    qs = model.objects.filter(id=obj_id)
    qs = qs.filter(grade__school_id=school_id) if by_grade else qs.filter(school_id=school_id)
    obj = qs.first()
    if obj is None:
        return None, f'{model.__name__} id={obj_id} not found in school {school_id}'
    return obj, None


def _norm_slots(raw) -> list[dict]:
    out = []
    for s in raw or []:
        day = _coerce_day(s.get('day'))
        period = s.get('period')
        if not isinstance(period, int):
            try:
                period = int(period)
            except (TypeError, ValueError):
                period = None
        if day is not None and period:
            out.append({'day': day, 'period': period})
    return out


def _int_list(raw) -> list[int]:
    out = []
    for v in raw or []:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return out


def _create_constraint(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    ctype = (input.get('constraint_type') or '').strip()
    if ctype not in _SUPPORTED:
        return {'error': f'unsupported constraint_type {ctype!r}. Supported: {sorted(_SUPPORTED)}'}

    school = School.objects.filter(id=school_id).first()
    if not school:
        return {'error': f'school id={school_id} not found'}

    priority = (input.get('priority') or 'hard').lower()
    if priority not in {'hard', 'soft'}:
        priority = 'hard'

    teacher, err = _resolve(Teacher, input.get('teacher_id'), school_id)
    if err:
        return {'error': err}
    school_class, err = _resolve(SchoolClass, input.get('class_id'), school_id, by_grade=True)
    if err:
        return {'error': err}
    subject, err = _resolve(Subject, input.get('subject_id'), school_id)
    if err:
        return {'error': err}

    params: Dict[str, Any] = {}
    # Per-type validation + parameter assembly.
    if ctype == 'teacher_availability':
        if not teacher:
            return {'error': 'teacher_id is required for teacher_availability'}
        slots = _norm_slots(input.get('slots'))
        if not slots:
            return {'error': 'slots (list of {day, period}) is required and must be non-empty'}
        params['unavailable'] = slots
    elif ctype in ('max_daily_hours_class', 'max_daily_hours_teacher'):
        mh = input.get('max_hours')
        try:
            mh = int(mh)
        except (TypeError, ValueError):
            return {'error': 'max_hours (positive integer) is required'}
        if mh < 1:
            return {'error': 'max_hours must be >= 1'}
        params['max_hours'] = mh
    elif ctype == 'consecutive_hours':
        mpd = input.get('max_per_day')
        try:
            mpd = int(mpd)
        except (TypeError, ValueError):
            return {'error': 'max_per_day (positive integer) is required'}
        if mpd < 1:
            return {'error': 'max_per_day must be >= 1'}
        params['max_per_day'] = mpd
    elif ctype == 'lunch_break':
        periods = _int_list(input.get('periods'))
        if not periods:
            return {'error': 'periods (list of period numbers) is required'}
        params['periods'] = periods
        days = [d for d in (_coerce_day(x) for x in (input.get('days') or [])) if d]
        if days:
            params['days'] = days
    elif ctype == 'consecutive_pair':
        if not school_class or not subject:
            return {'error': 'class_id and subject_id are both required for consecutive_pair'}
        params['min_pairs'] = max(1, int(input.get('min_pairs') or 1))
    elif ctype == 'no_last_period':
        periods = _int_list(input.get('periods'))
        if periods:
            params['periods'] = periods

    name = (input.get('name') or '').strip() or _TYPE_LABEL_HE.get(ctype, ctype)
    constraint = Constraint.objects.create(
        school=school,
        name=name,
        description=input.get('description') or '',
        constraint_type=ctype,
        priority=Constraint.Priority(priority),
        teacher=teacher,
        school_class=school_class,
        subject=subject,
        parameters=params,
    )
    return {
        'created': True,
        'constraint_id': constraint.id,
        'type': ctype,
        'priority': priority,
        'target': {
            'teacher': str(teacher) if teacher else None,
            'class': str(school_class) if school_class else None,
            'subject': str(subject) if subject else None,
        },
        'parameters': params,
        'next_step': 'Re-run the solver via run_generator on the active timetable so the new adjustment takes effect.',
    }


register_tool(Tool(
    name='create_constraint',
    description=(
        'Create a scheduling constraint (an adjustment the user described in '
        'words) that the solver will honor on the next build. Pick constraint_type:\n'
        '- teacher_availability: a teacher is unavailable at specific slots — '
        'needs teacher_id + slots [{day, period}]. (For a whole free weekday use '
        'set_teacher_day_off instead.)\n'
        '- max_daily_hours_class: cap lessons/day for a class (class_id) or all '
        'classes (omit class_id) — needs max_hours.\n'
        '- max_daily_hours_teacher: cap lessons/day for a teacher (teacher_id) or '
        'all teachers — needs max_hours.\n'
        '- consecutive_hours: cap how many lessons of a subject land on one day '
        'for a class — class_id and/or subject_id, needs max_per_day.\n'
        '- lunch_break: reserve period(s) as no-class for a class (class_id) or '
        'all — needs periods [int]; optional days.\n'
        '- consecutive_pair: force a subject into double-period blocks — needs '
        'class_id + subject_id; optional min_pairs.\n'
        '- no_last_period: forbid the last period(s) — optional teacher_id/'
        'class_id/subject_id (omit all = everyone) and optional periods.\n'
        'priority hard = must respect, soft = minimize violations (default hard). '
        'Resolve names to IDs with list_teachers/list_classes/list_subjects first. '
        'After creating, tell the user to re-run the generator.'
    ),
    input_schema={
        'type': 'object',
        'required': ['constraint_type'],
        'properties': {
            'school_id': {'type': 'integer'},
            'constraint_type': {
                'type': 'string',
                'enum': sorted(_SUPPORTED),
            },
            'teacher_id': {'type': 'integer'},
            'class_id': {'type': 'integer'},
            'subject_id': {'type': 'integer'},
            'priority': {'type': 'string', 'enum': ['hard', 'soft']},
            'name': {'type': 'string'},
            'description': {'type': 'string'},
            'slots': {
                'type': 'array',
                'description': 'For teacher_availability: unavailable {day, period} pairs.',
                'items': {
                    'type': 'object',
                    'properties': {
                        'day': {'description': '1..5 or Sun..Thu / ראשון..חמישי'},
                        'period': {'type': 'integer'},
                    },
                },
            },
            'periods': {
                'type': 'array',
                'items': {'type': 'integer'},
                'description': 'For lunch_break (period[s] to reserve) or no_last_period.',
            },
            'days': {
                'type': 'array',
                'description': 'For lunch_break: which days (default all). 1..5 or names.',
            },
            'max_hours': {'type': 'integer', 'description': 'For max_daily_hours_*.'},
            'max_per_day': {'type': 'integer', 'description': 'For consecutive_hours.'},
            'min_pairs': {'type': 'integer', 'description': 'For consecutive_pair (default 1).'},
        },
    },
    handler=_create_constraint,
    modules=['timetable', 'constraints', 'global'],
    requires_confirmation=True,
    preview_template='יצירת אילוץ "{input.constraint_type}" (עדיפות {input.priority})',
))


# ── delete ──────────────────────────────────────────────────────────────────

def _delete_constraint(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    cid = input.get('constraint_id')
    if not cid:
        return {'error': 'constraint_id is required'}
    c = Constraint.objects.filter(id=cid, school_id=school_id).first()
    if not c:
        return {'error': f'constraint id={cid} not found in school {school_id}'}
    label = c.name
    c.delete()
    return {
        'deleted': True,
        'constraint_id': cid,
        'name': label,
        'next_step': 'Re-run the solver via run_generator so the removal takes effect.',
    }


register_tool(Tool(
    name='delete_constraint',
    description=(
        'Remove a scheduling constraint by id (use when the user wants to drop '
        'a previously-set adjustment). Find the id with list_constraints first. '
        'After deleting, tell the user to re-run the generator.'
    ),
    input_schema={
        'type': 'object',
        'required': ['constraint_id'],
        'properties': {
            'school_id': {'type': 'integer'},
            'constraint_id': {'type': 'integer'},
        },
    },
    handler=_delete_constraint,
    modules=['timetable', 'constraints', 'global'],
    requires_confirmation=True,
    preview_template='מחיקת אילוץ #{input.constraint_id}',
))


# ── teacher day off ───────────────────────────────────────────────────────────

def _set_teacher_day_off(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    teacher, err = _resolve(Teacher, input.get('teacher_id'), school_id)
    if err:
        return {'error': err}
    if not teacher:
        return {'error': 'teacher_id is required'}

    raw_day = input.get('day')
    # Allow clearing the day off with null / 0 / "none".
    if raw_day in (None, 0, '0') or (isinstance(raw_day, str) and raw_day.strip().lower() in {'none', 'clear', 'אין'}):
        day = None
    else:
        day = _coerce_day(raw_day)
        if day is None:
            return {'error': 'day must be 1..5, a weekday name, or null to clear'}

    teacher.day_off = day
    teacher.save(update_fields=['day_off'])

    # Also mirror to a real Constraint row so the day-off shows up in the
    # Constraints UI (it's the user-visible source of truth — Teacher.day_off
    # is the legacy storage the solver still honours). Marked with
    # AUTO_DAY_OFF_MARKER so the backfill command, list-style filters, and a
    # future "clear day off" call can find it idempotently.
    constraint_id = _sync_day_off_constraint(teacher, day, school_id)

    return {
        'updated': True,
        'teacher_id': teacher.id,
        'teacher': str(teacher),
        'day_off': day,
        'constraint_id': constraint_id,
        'next_step': 'Re-run the solver via run_generator so the day off is applied.',
    }


def _sync_day_off_constraint(teacher: Teacher, day: int | None, school_id: int) -> int | None:
    """Keep the auto teacher_availability constraint in sync with
    Teacher.day_off. Returns the constraint id (or None if cleared).

    Filter in Python rather than via JSONField __contains so the code works
    on any DB backend regardless of JSON1 availability — a teacher only has
    a handful of teacher_availability constraints, so the cost is trivial."""
    candidates = list(
        Constraint.objects.filter(
            school_id=school_id,
            teacher=teacher,
            constraint_type='teacher_availability',
        )
    )
    auto = [c for c in candidates if isinstance(c.parameters, dict)
            and c.parameters.get(AUTO_DAY_OFF_MARKER)]
    existing = auto[0] if auto else None
    # If multiple auto rows exist (shouldn't happen, but be defensive on
    # backfill races), drop the extras.
    for stale in auto[1:]:
        stale.delete()
    if day is None:
        if existing:
            existing.delete()
        return None

    # Build the full list of slots for the chosen day from the school's
    # TimeSlot rows — every period that day is blocked.
    periods = list(
        TimeSlot.objects
        .filter(school_id=school_id, day=day)
        .order_by('period')
        .values_list('period', flat=True)
    )
    # Fall back to a reasonable default if the school has no TimeSlot rows
    # yet — the solver will skip slots that don't exist anyway.
    if not periods:
        periods = list(range(1, 11))
    slots = [{'day': day, 'period': p} for p in periods]
    name = f'יום חופש: {teacher} ({_day_name_he(day)})'
    params = {AUTO_DAY_OFF_MARKER: True, 'unavailable': slots}

    if existing:
        existing.name = name
        existing.parameters = params
        existing.is_active = True
        existing.priority = Constraint.Priority.HARD
        existing.save(update_fields=['name', 'parameters', 'is_active', 'priority'])
        return existing.id
    created = Constraint.objects.create(
        school_id=school_id,
        name=name,
        description='נוצר אוטומטית על-ידי set_teacher_day_off',
        constraint_type='teacher_availability',
        priority=Constraint.Priority.HARD,
        teacher=teacher,
        parameters=params,
    )
    return created.id


_DAY_NAMES_HE = {1: 'ראשון', 2: 'שני', 3: 'שלישי', 4: 'רביעי', 5: 'חמישי'}


def _day_name_he(d: int | None) -> str:
    return _DAY_NAMES_HE.get(d or 0, str(d))


register_tool(Tool(
    name='set_teacher_day_off',
    description=(
        "Give a teacher a whole free weekday (or clear it). Writes the teacher's "
        'day_off so the solver schedules nothing for them that day. day accepts '
        '1..5 / Sun..Thu / ראשון..חמישי, or null to clear. For only specific '
        'hours (not a whole day) use create_constraint with teacher_availability. '
        'After this, tell the user to re-run the generator.'
    ),
    input_schema={
        'type': 'object',
        'required': ['teacher_id'],
        'properties': {
            'school_id': {'type': 'integer'},
            'teacher_id': {'type': 'integer'},
            'day': {'description': '1..5 / Sun..Thu / ראשון..חמישי, or null to clear.'},
        },
    },
    handler=_set_teacher_day_off,
    modules=['timetable', 'constraints', 'global'],
    requires_confirmation=True,
    preview_template='קביעת יום חופש למורה #{input.teacher_id}: יום {input.day}',
))
