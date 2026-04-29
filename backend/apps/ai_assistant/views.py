from __future__ import annotations

import json

from django.http import StreamingHttpResponse
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .service import chat_stream, execute_tool
from .tools.base import tools_for_module


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def chat_view(request):
    """Stream a chat turn. Body: {module, view_state, messages}."""
    body = request.data or {}
    module = body.get('module') or 'global'
    view_state = body.get('view_state') or {}
    messages = body.get('messages') or []

    if not isinstance(messages, list) or not messages:
        return Response({'error': 'messages must be a non-empty list'},
                        status=status.HTTP_400_BAD_REQUEST)

    response = StreamingHttpResponse(
        chat_stream(
            request=request,
            module=module,
            view_state=view_state,
            messages=messages,
        ),
        content_type='text/event-stream; charset=utf-8',
    )
    # Keep proxies (Caddy, nginx) from buffering — SSE needs to flush.
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def execute_tool_view(request):
    """Run a single (already-confirmed) mutating tool. Body:
    {module, view_state, tool_name, tool_input}."""
    body = request.data or {}
    name = body.get('tool_name')
    if not name:
        return Response({'error': 'tool_name is required'},
                        status=status.HTTP_400_BAD_REQUEST)
    result = execute_tool(
        request=request,
        module=body.get('module') or 'global',
        view_state=body.get('view_state') or {},
        tool_name=name,
        tool_input=body.get('tool_input') or {},
    )
    return Response(result)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def list_tools_view(request):
    """Return the tools available for a given module — handy for FE
    introspection / debugging."""
    module = request.query_params.get('module', 'global')
    tools = tools_for_module(module)
    return Response([
        {
            'name': t.name,
            'description': t.description,
            'requires_confirmation': t.requires_confirmation,
            'modules': t.modules,
            'input_schema': t.input_schema,
        }
        for t in tools
    ])
