"""Tools available everywhere, regardless of the active module."""
from __future__ import annotations

from typing import Any, Dict

from apps.school.models import School
from apps.subjects.models import Subject, Teacher

from .base import Tool, ToolContext, register_tool


def _system_overview(input: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    return {
        'schools': School.objects.count(),
        'teachers': Teacher.objects.count(),
        'subjects': Subject.objects.count(),
        'current_user': {
            'id': ctx.request.user.id,
            'email': ctx.request.user.email,
            'role': getattr(getattr(ctx.request.user, 'profile', None), 'role', 'unknown'),
        },
    }


register_tool(Tool(
    name='system_overview',
    description='High-level counts: how many schools/teachers/subjects exist, plus the current user.',
    input_schema={'type': 'object', 'properties': {}},
    handler=_system_overview,
    modules=['global'],
))
