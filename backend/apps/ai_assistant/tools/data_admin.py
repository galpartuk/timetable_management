"""AI tools for destructive data administration.

Lets the chatbot reset a school's data on request — e.g. "wipe everything so
I can re-import the Excel from scratch", or "clear the assignments". Every
operation is mutating, so each tool sets ``requires_confirmation=True``: the
FE shows a preview card with the exact counts and the user must approve before
the backend deletes anything.

Reuses the same delete logic as the ``bulk_delete`` admin endpoint
(apps.import_export.views) so the chatbot and the Danger Zone behave identically.
"""
from __future__ import annotations

from typing import Any, Dict

from django.db import transaction

from apps.scheduling.models import Constraint
from apps.school.models import School
from apps.scheduling.models import TimetableEntry, Timetable
from apps.subjects.models import (
    Subject, Teacher, TeacherRole, TeacherTag, TeachingAssignment,
)

from .base import Tool, ToolContext, register_tool


def _default_school_id(ctx: ToolContext) -> int | None:
    return ctx.view_state.get('school_id') or 1


# Scope → human description, shown in the preview and the result.
_SCOPES = {
    'timetables': 'כל מערכות השעות (והשיבוצים בהן)',
    'assignments': 'כל שיבוצי ההוראה',
    'everything': 'הכול: מערכות, שיבוצים, אילוצים, מורים, מקצועות, תגיות ותפקידים (כיתות ומשבצות זמן נשמרות)',
}


def _counts(school_id: int) -> Dict[str, int]:
    return {
        'timetables': Timetable.objects.filter(school_id=school_id).count(),
        'entries': TimetableEntry.objects.filter(timetable__school_id=school_id).count(),
        'assignments': TeachingAssignment.objects.filter(school_class__grade__school_id=school_id).count(),
        'constraints': Constraint.objects.filter(school_id=school_id).count(),
        'teachers': Teacher.objects.filter(school_id=school_id).count(),
        'subjects': Subject.objects.filter(school_id=school_id).count(),
        'roles': TeacherRole.objects.filter(school_id=school_id).count(),
        'tags': TeacherTag.objects.filter(school_id=school_id).count(),
    }


def _reset_data(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    school_id = input.get('school_id') or _default_school_id(ctx)
    scope = input.get('scope')
    if scope not in _SCOPES:
        return {'error': f'scope must be one of {list(_SCOPES)}'}
    if not School.objects.filter(id=school_id).exists():
        return {'error': f'school {school_id} not found'}

    before = _counts(school_id)
    deleted: Dict[str, int] = {}
    with transaction.atomic():
        if scope in ('timetables', 'everything'):
            deleted['entries'] = before['entries']
            deleted['timetables'] = before['timetables']
            Timetable.objects.filter(school_id=school_id).delete()  # cascades entries
        if scope in ('assignments', 'everything'):
            n, _ = TeachingAssignment.objects.filter(
                school_class__grade__school_id=school_id,
            ).delete()
            deleted['assignments'] = n
        if scope == 'everything':
            # Order matters: drop referencing rows before the rows they point at.
            c, _ = Constraint.objects.filter(school_id=school_id).delete()
            deleted['constraints'] = c
            r, _ = TeacherRole.objects.filter(school_id=school_id).delete()
            deleted['roles'] = r
            tg, _ = TeacherTag.objects.filter(school_id=school_id).delete()
            deleted['tags'] = tg
            t, _ = Teacher.objects.filter(school_id=school_id).delete()
            deleted['teachers'] = t
            s, _ = Subject.objects.filter(school_id=school_id).delete()
            deleted['subjects'] = s

    return {
        'reset': True,
        'scope': scope,
        'deleted': deleted,
        'next_step': (
            'Data cleared. Upload the Excel again from the Import tab to repopulate, '
            'then run the generator.'
            if scope == 'everything'
            else 'Done.'
        ),
    }


register_tool(Tool(
    name='reset_school_data',
    description=(
        'DESTRUCTIVE: delete a school\'s data so it can be re-imported or rebuilt. '
        'Use when the user asks to wipe/clear/reset data or start fresh before a '
        're-import. Pick the narrowest scope that fits the request: '
        '"timetables" (drop generated schedules only), "assignments" (drop teaching '
        'assignments), or "everything" (full reset of teachers, subjects, assignments, '
        'roles, tags, constraints and timetables — classes and time slots are kept). '
        'The user must confirm before anything is deleted.'
    ),
    input_schema={
        'type': 'object',
        'required': ['scope'],
        'properties': {
            'school_id': {'type': 'integer'},
            'scope': {
                'type': 'string',
                'enum': ['timetables', 'assignments', 'everything'],
                'description': 'How much to delete.',
            },
        },
    },
    handler=_reset_data,
    modules=['timetable', 'global'],
    requires_confirmation=True,
    preview_template='איפוס נתונים — מחיקה של: {input.scope}',
))
