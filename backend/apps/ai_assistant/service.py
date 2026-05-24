"""Anthropic client + streaming chat loop.

Streaming protocol (SSE) emitted by `chat_stream`:

  event: text         data: {"delta": "..."}
  event: tool_running data: {"name": "...", "input": {...}}
  event: tool_result  data: {"name": "...", "result": {...}}
  event: tool_proposal data: {"id": "...", "name": "...", "input": {...},
                              "preview": "...", "assistant_content": [...]}
  event: error        data: {"message": "..."}
  event: done         data: {"reason": "complete"|"awaiting_confirmation"}

The frontend renders `text` deltas live, surfaces `tool_running`/`tool_result`
as inline status pills, and on `tool_proposal` shows a confirmation card. On
`done.reason == "awaiting_confirmation"` the FE pauses until the user clicks
Confirm/Cancel.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Iterator, List

from django.conf import settings

from .system_prompts import build_system_prompt
from .tools.base import ToolContext, get_tool, tools_for_module

logger = logging.getLogger(__name__)

# Cap how many read-only tool rounds we'll auto-loop before bailing out.
# Prevents pathological prompts from spinning forever.
MAX_AUTO_TOOL_ROUNDS = 5


def _sse(event: str, payload: Dict[str, Any]) -> str:
    return f'event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n'


def _client():
    """Lazy-import so the rest of Django can boot without the package
    installed (e.g. during initial migrate)."""
    from anthropic import Anthropic
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError('ANTHROPIC_API_KEY is not configured')
    return Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _content_blocks_to_dict(blocks) -> List[Dict[str, Any]]:
    """Anthropic SDK returns typed content blocks; we need plain dicts to
    hand back to the frontend (so it can include them in the next request)."""
    out = []
    for b in blocks:
        if b.type == 'text':
            out.append({'type': 'text', 'text': b.text})
        elif b.type == 'tool_use':
            out.append({'type': 'tool_use', 'id': b.id, 'name': b.name, 'input': b.input})
    return out


def _render_preview(template: str, input: Dict[str, Any]) -> str:
    """Tiny {input.foo} interpolator. Falls back to a generic preview if the
    tool didn't define a template."""
    if not template:
        return ''
    out = template
    for k, v in (input or {}).items():
        out = out.replace('{input.' + k + '}', str(v))
    # Drop any placeholders the model left unfilled (optional inputs it
    # omitted) so we never leak a raw "{input.mode}" into the user's
    # confirmation card. Then tidy the whitespace/empty parens left behind.
    out = re.sub(r'\{input\.[^}]*\}', '', out)
    out = re.sub(r'\(\s*\)', '', out)         # empty "()" from a dropped arg
    out = re.sub(r'\s{2,}', ' ', out).strip()
    return out


def chat_stream(
    *,
    request,
    module: str,
    view_state: Dict[str, Any],
    messages: List[Dict[str, Any]],
) -> Iterator[str]:
    """Drive a chat turn end-to-end. Yields SSE-formatted strings."""
    try:
        client = _client()
    except Exception as exc:  # pragma: no cover — config error
        yield _sse('error', {'message': str(exc)})
        yield _sse('done', {'reason': 'error'})
        return

    system_prompt = build_system_prompt(module, view_state)
    available_tools = tools_for_module(module)
    tool_specs = [t.to_anthropic() for t in available_tools]
    ctx = ToolContext(request=request, module=module, view_state=view_state)
    # Local mutable copy — we may append assistant + tool_result messages
    # as we loop through read-only tool rounds.
    convo = list(messages)

    for _round in range(MAX_AUTO_TOOL_ROUNDS):
        try:
            with client.messages.stream(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=4096,
                system=system_prompt,
                tools=tool_specs or None,
                messages=convo,
            ) as stream:
                for event in stream:
                    if event.type == 'content_block_delta' and getattr(event.delta, 'type', '') == 'text_delta':
                        yield _sse('text', {'delta': event.delta.text})
                final = stream.get_final_message()
        except Exception as exc:
            logger.exception('Anthropic stream failed')
            yield _sse('error', {'message': str(exc)})
            yield _sse('done', {'reason': 'error'})
            return

        if final.stop_reason != 'tool_use':
            # Plain text response — we're done.
            yield _sse('done', {'reason': 'complete'})
            return

        assistant_content = _content_blocks_to_dict(final.content)
        # Append assistant turn so the next round (or the FE, on confirmation)
        # has the full history.
        convo.append({'role': 'assistant', 'content': assistant_content})

        tool_uses = [b for b in final.content if b.type == 'tool_use']
        # Bucket: needs_confirmation goes to the FE; the rest we run inline.
        proposals = []
        tool_results: List[Dict[str, Any]] = []
        for tu in tool_uses:
            tool = get_tool(tu.name)
            if tool is None:
                tool_results.append({
                    'type': 'tool_result',
                    'tool_use_id': tu.id,
                    'is_error': True,
                    'content': json.dumps({'error': f'unknown tool {tu.name!r}'}),
                })
                continue
            if tool.requires_confirmation:
                proposals.append({
                    'id': tu.id,
                    'name': tu.name,
                    'input': tu.input,
                    'preview': _render_preview(tool.preview_template, tu.input),
                })
            else:
                yield _sse('tool_running', {'name': tu.name, 'input': tu.input})
                try:
                    result = tool.handler(tu.input, ctx)
                except Exception as exc:
                    logger.exception('Tool %s failed', tu.name)
                    result = {'error': str(exc)}
                yield _sse('tool_result', {'name': tu.name, 'result': result})
                tool_results.append({
                    'type': 'tool_result',
                    'tool_use_id': tu.id,
                    'content': json.dumps(result, ensure_ascii=False, default=str),
                })

        if proposals:
            # Hand control back to the FE. It will show preview cards, get
            # the user's decision, then re-call /chat/ with the assistant
            # content + tool_result messages already appended.
            yield _sse('tool_proposal', {
                'proposals': proposals,
                'assistant_content': assistant_content,
            })
            yield _sse('done', {'reason': 'awaiting_confirmation'})
            return

        # All read-only tools handled inline; feed results back and let the
        # model continue.
        convo.append({'role': 'user', 'content': tool_results})

    # Hit MAX_AUTO_TOOL_ROUNDS — bail with a friendly message rather than
    # looping forever.
    yield _sse('error', {
        'message': 'הגענו למספר המקסימלי של סיבובי כלים. נסה לפרק את הבקשה לחלקים קטנים יותר.',
    })
    yield _sse('done', {'reason': 'error'})


def execute_tool(*, request, module: str, view_state: Dict[str, Any],
                 tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
    """Run a single tool. Used by the /execute_tool/ endpoint after the user
    confirms a mutating proposal."""
    tool = get_tool(tool_name)
    if tool is None:
        return {'error': f'unknown tool {tool_name!r}'}
    ctx = ToolContext(request=request, module=module, view_state=view_state)
    try:
        return tool.handler(tool_input, ctx)
    except Exception as exc:
        logger.exception('Tool %s failed (post-confirmation)', tool_name)
        return {'error': str(exc)}
