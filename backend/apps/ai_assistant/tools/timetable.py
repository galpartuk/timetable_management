"""Timetable-module tools: read-only diagnostics + a mutating example.

Mutating tools set `requires_confirmation=True` so the FE shows a preview
card and the user has to approve before the handler runs.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict

from apps.scheduling.models import Timetable, TimetableEntry

from .base import Tool, ToolContext, register_tool


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
    for (_slot, _teacher), es in by_slot_teacher.items():
        if len(es) > 1:
            conflicts.append({
                'kind': 'teacher_double_booked',
                'teacher': es[0].teacher.full_name if hasattr(es[0].teacher, 'full_name') else str(es[0].teacher),
                'time_slot': str(es[0].time_slot),
                'entries': [{'id': e.id, 'class': str(e.school_class), 'subject': str(e.subject)} for e in es],
            })
    for (_slot, _cls), es in by_slot_class.items():
        if len(es) > 1:
            conflicts.append({
                'kind': 'class_double_booked',
                'class': str(es[0].school_class),
                'time_slot': str(es[0].time_slot),
                'entries': [{'id': e.id, 'subject': str(e.subject), 'teacher': str(e.teacher)} for e in es],
            })
    for (_slot, _room), es in by_slot_room.items():
        if len(es) > 1:
            conflicts.append({
                'kind': 'room_double_booked',
                'room': str(es[0].room),
                'time_slot': str(es[0].time_slot),
                'entries': [{'id': e.id, 'class': str(e.school_class), 'teacher': str(e.teacher)} for e in es],
            })

    return {'count': len(conflicts), 'conflicts': conflicts[:50]}


register_tool(Tool(
    name='find_conflicts',
    description=(
        'Find scheduling conflicts in a timetable: a teacher in two places '
        'at once, a class in two places at once, or a room double-booked.'
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
