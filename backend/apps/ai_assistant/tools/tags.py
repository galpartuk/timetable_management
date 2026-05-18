"""AI tools for teacher tags + tag-scoped scheduling constraints.

Lets the chatbot interpret natural-language requests like:

  - "Tag Sara, David, and Miriam as 'math department'."
  - "Give the 6th-grade homeroom teachers a weekly meeting Tuesday at
     period 1 — they shouldn't be teaching then."

The model first lists/creates the tag, assigns teachers to it, then
creates a Constraint(constraint_type='group_blocked_slot') referencing
the tag. The next solver run will leave those slots empty for everyone
in the tag.
"""
from __future__ import annotations

from typing import Any, Dict, List

from django.db import transaction

from apps.scheduling.models import Constraint
from apps.school.models import School
from apps.subjects.models import Teacher, TeacherTag

from .base import Tool, ToolContext, register_tool


def _default_school_id(ctx: ToolContext) -> int | None:
    return ctx.view_state.get('school_id') or 1


# ── read ──────────────────────────────────────────────────────────────────

def _list_teacher_tags(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    qs = TeacherTag.objects.filter(school_id=school_id).prefetch_related('teachers')
    return {
        'tags': [
            {
                'id': t.id,
                'name': t.name,
                'color': t.color,
                'teacher_ids': list(t.teachers.values_list('id', flat=True)),
                'teacher_count': t.teachers.count(),
            }
            for t in qs
        ],
    }


register_tool(Tool(
    name='list_teacher_tags',
    description=(
        'List every teacher tag in the school and the teacher ids each '
        'one groups. Use this before creating a new tag (to avoid '
        'duplicates) and before referencing a tag by id.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'school_id': {'type': 'integer'},
        },
    },
    handler=_list_teacher_tags,
    modules=['timetable', 'constraints', 'data'],
))


# ── mutate: tag CRUD ──────────────────────────────────────────────────────

def _create_teacher_tag(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    name = (input.get('name') or '').strip()
    color = input.get('color') or '#6366F1'
    if not name:
        return {'error': 'name is required'}
    school = School.objects.filter(id=school_id).first()
    if not school:
        return {'error': f'school id={school_id} not found'}
    existing = TeacherTag.objects.filter(school=school, name=name).first()
    if existing:
        return {
            'created': False,
            'tag': {'id': existing.id, 'name': existing.name, 'color': existing.color},
            'note': 'A tag with this name already exists; reuse it.',
        }
    tag = TeacherTag.objects.create(school=school, name=name, color=color)
    return {
        'created': True,
        'tag': {'id': tag.id, 'name': tag.name, 'color': tag.color},
    }


register_tool(Tool(
    name='create_teacher_tag',
    description=(
        'Create a new teacher tag (label) the school can use to group '
        'teachers — e.g. "6th-grade staff", "math department". Idempotent: '
        'returns the existing tag if a tag with the same name exists.'
    ),
    input_schema={
        'type': 'object',
        'required': ['name'],
        'properties': {
            'school_id': {'type': 'integer'},
            'name': {'type': 'string', 'description': 'Display name of the tag.'},
            'color': {'type': 'string', 'description': 'Hex color like #6366F1; optional.'},
        },
    },
    handler=_create_teacher_tag,
    modules=['timetable', 'constraints', 'data'],
    requires_confirmation=True,
    preview_template='יצירת תגית מורים חדשה: {input.name}',
))


def _assign_teachers_to_tag(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    tag_id = input.get('tag_id')
    teacher_ids: List[int] = list(input.get('teacher_ids') or [])
    mode = (input.get('mode') or 'add').lower()  # 'add' | 'replace' | 'remove'
    if not tag_id:
        return {'error': 'tag_id is required'}
    if not teacher_ids:
        return {'error': 'teacher_ids must be a non-empty list'}
    try:
        tag = TeacherTag.objects.get(id=tag_id)
    except TeacherTag.DoesNotExist:
        return {'error': f'tag id={tag_id} not found'}
    teachers = list(Teacher.objects.filter(id__in=teacher_ids))
    missing = set(teacher_ids) - {t.id for t in teachers}
    if mode == 'replace':
        tag.teachers.set(teachers)
    elif mode == 'remove':
        tag.teachers.remove(*teachers)
    else:
        tag.teachers.add(*teachers)
    return {
        'tag_id': tag.id,
        'tag_name': tag.name,
        'applied_mode': mode,
        'teacher_ids_applied': [t.id for t in teachers],
        'teacher_ids_missing': list(missing),
        'total_teachers_after': tag.teachers.count(),
    }


register_tool(Tool(
    name='assign_teachers_to_tag',
    description=(
        'Add, replace, or remove teachers on a tag. mode="add" (default) '
        'attaches the listed teachers; mode="replace" sets the tag\'s '
        'membership exactly; mode="remove" detaches them.'
    ),
    input_schema={
        'type': 'object',
        'required': ['tag_id', 'teacher_ids'],
        'properties': {
            'tag_id': {'type': 'integer'},
            'teacher_ids': {
                'type': 'array',
                'items': {'type': 'integer'},
                'description': 'Teacher ids to apply to the tag.',
            },
            'mode': {
                'type': 'string',
                'enum': ['add', 'replace', 'remove'],
                'description': 'Default add.',
            },
        },
    },
    handler=_assign_teachers_to_tag,
    modules=['timetable', 'constraints', 'data'],
    requires_confirmation=True,
    preview_template='עדכון חברות בתגית #{input.tag_id} — {input.teacher_ids} ({input.mode})',
))


# ── mutate: group meeting constraint ───────────────────────────────────────

# School week is Sunday=1..Thursday=5 (per Teacher.Day enum).
_DAY_NAMES_HE = {
    'ראשון': 1, 'יום ראשון': 1,
    'שני': 2, 'יום שני': 2,
    'שלישי': 3, 'יום שלישי': 3,
    'רביעי': 4, 'יום רביעי': 4,
    'חמישי': 5, 'יום חמישי': 5,
}
_DAY_NAMES_EN = {
    'sunday': 1, 'sun': 1,
    'monday': 2, 'mon': 2,
    'tuesday': 3, 'tue': 3, 'tues': 3,
    'wednesday': 4, 'wed': 4,
    'thursday': 5, 'thu': 5, 'thur': 5, 'thurs': 5,
}


def _coerce_day(value: Any) -> int | None:
    """Accept an int 1..5, or a Hebrew/English weekday name."""
    if isinstance(value, int):
        return value if 1 <= value <= 5 else None
    if isinstance(value, str):
        s = value.strip().lower()
        if s in _DAY_NAMES_EN:
            return _DAY_NAMES_EN[s]
        # Hebrew names — don't lowercase RTL strings; match raw.
        raw = value.strip()
        if raw in _DAY_NAMES_HE:
            return _DAY_NAMES_HE[raw]
        try:
            n = int(s)
            return n if 1 <= n <= 5 else None
        except ValueError:
            return None
    return None


def _create_group_meeting_constraint(
    input: Dict[str, Any], ctx: ToolContext,
) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    tag_id = input.get('tag_id')
    raw_slots = input.get('slots') or []
    name = (input.get('name') or '').strip()
    description = input.get('description') or ''
    priority = (input.get('priority') or 'hard').lower()
    if priority not in {'hard', 'soft'}:
        priority = 'hard'

    if not tag_id:
        return {'error': 'tag_id is required'}
    school = School.objects.filter(id=school_id).first()
    if not school:
        return {'error': f'school id={school_id} not found'}
    try:
        tag = TeacherTag.objects.get(id=tag_id, school=school)
    except TeacherTag.DoesNotExist:
        return {'error': f'tag id={tag_id} not found in school {school_id}'}

    normalized_slots: list[dict] = []
    for s in raw_slots:
        day = _coerce_day(s.get('day'))
        period = s.get('period')
        if not isinstance(period, int):
            try:
                period = int(period)
            except (TypeError, ValueError):
                period = None
        if day is None or not period:
            continue
        normalized_slots.append({'day': day, 'period': period})

    if not normalized_slots:
        return {'error': 'slots must contain at least one {day, period} pair'}

    fallback_name = f'פגישת קבוצה: {tag.name}'
    constraint = Constraint.objects.create(
        school=school,
        name=name or fallback_name,
        description=description,
        constraint_type=Constraint.ConstraintType.GROUP_BLOCKED_SLOT,
        priority=Constraint.Priority(priority),
        tag=tag,
        parameters={'slots': normalized_slots},
    )
    return {
        'created': True,
        'constraint_id': constraint.id,
        'tag_id': tag.id,
        'tag_name': tag.name,
        'slots': normalized_slots,
        'priority': priority,
        'next_step': 'Re-run the solver via run_generator on the active timetable so the new constraint takes effect.',
    }


register_tool(Tool(
    name='create_group_meeting_constraint',
    description=(
        'Block every teacher in a tag from teaching during the given '
        '(day, period) slots — use for staff meetings, team coordination '
        'periods, etc. Day accepts integers 1..5 (Sun..Thu) or names in '
        'Hebrew ("שלישי") / English ("Tuesday"). After this is created, '
        'tell the user to re-run the generator so the timetable is rebuilt.'
    ),
    input_schema={
        'type': 'object',
        'required': ['tag_id', 'slots'],
        'properties': {
            'school_id': {'type': 'integer'},
            'tag_id': {'type': 'integer'},
            'name': {'type': 'string', 'description': 'Constraint label; auto-generated if omitted.'},
            'description': {'type': 'string'},
            'priority': {
                'type': 'string',
                'enum': ['hard', 'soft'],
                'description': 'hard = solver must respect; soft = solver minimizes violations. Default hard.',
            },
            'slots': {
                'type': 'array',
                'description': 'List of {day, period} pairs to block.',
                'items': {
                    'type': 'object',
                    'properties': {
                        'day': {'description': '1..5 or Sun..Thu / ראשון..חמישי'},
                        'period': {'type': 'integer', 'description': '1-based period within the day.'},
                    },
                },
            },
        },
    },
    handler=_create_group_meeting_constraint,
    modules=['timetable', 'constraints'],
    requires_confirmation=True,
    preview_template='יצירת אילוץ פגישה לתגית #{input.tag_id} ב-{input.slots}',
))
