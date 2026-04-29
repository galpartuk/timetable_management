"""Tool registry — modular per-module tool definitions for the AI assistant.

A `Tool` wraps a callable that the model can invoke. Each tool declares:
- name + description (shown to the model)
- input_schema (JSON Schema; the model fills this in)
- modules: which UI modules see this tool (e.g. ['timetable', 'global'])
- requires_confirmation: True for mutating actions; the FE shows a preview
  card and the user must approve before the backend executes the handler.
- handler(input, context) -> dict serialisable result

Adding a new tool = write a function decorated with @register_tool. No other
plumbing required.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List


ToolHandler = Callable[[Dict[str, Any], 'ToolContext'], Any]


@dataclass
class ToolContext:
    """Everything a tool handler needs that isn't in its declared inputs."""
    request: Any                 # DRF request — has .user, .session
    module: str                  # which UI module called us
    view_state: Dict[str, Any]   # whatever the FE attached for context


@dataclass
class Tool:
    name: str
    description: str
    input_schema: Dict[str, Any]
    handler: ToolHandler
    modules: List[str] = field(default_factory=lambda: ['global'])
    requires_confirmation: bool = False
    # Human-readable preview template shown on the FE confirmation card.
    # Use {input.foo} placeholders. Falls back to a generic preview.
    preview_template: str = ''

    def to_anthropic(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'description': self.description,
            'input_schema': self.input_schema,
        }


# ── registry ──────────────────────────────────────────────────────────────
_REGISTRY: Dict[str, Tool] = {}


def register_tool(tool: Tool) -> Tool:
    if tool.name in _REGISTRY:
        raise ValueError(f'Tool {tool.name!r} already registered')
    _REGISTRY[tool.name] = tool
    return tool


def get_tool(name: str) -> Tool | None:
    return _REGISTRY.get(name)


def tools_for_module(module: str) -> List[Tool]:
    """All tools whose `modules` list contains `module` or 'global'."""
    return [
        t for t in _REGISTRY.values()
        if module in t.modules or 'global' in t.modules
    ]
