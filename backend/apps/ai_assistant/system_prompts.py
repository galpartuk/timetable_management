"""Per-module system prompts for the AI assistant.

The base prompt sets the tone (Hebrew, confirm before mutating, helpful) and
each module appends domain-specific guidance. The view_state JSON the FE
attaches gets injected verbatim so the model "sees" what the user is looking
at right now.
"""
from __future__ import annotations

import json
from typing import Any, Dict

MODULE_DISPLAY_NAMES = {
    'global': 'מערכת ניהול בית ספר',
    'timetable': 'מערכת השעות',
    'data': 'ניהול הנתונים',
    'constraints': 'אילוצים',
    'import': 'ייבוא נתונים',
    'admin_users': 'ניהול משתמשים',
    'admin_audit': 'יומני ביקורת',
    'dashboard': 'לוח הבקרה',
}


def _base_prompt(module_label: str) -> str:
    return (
        f'אתה עוזר חכם לעורך {module_label} במערכת ניהול בית ספר ישראלי. '
        'יש לך גישה למצב הנוכחי של התצוגה הספציפית הזו. '
        'מטרתך לסייע למשתמש לנהל את לוח הזמנים: להציע אופטימיזציות, לזהות '
        'התנגשויות, ולבצע פעולות כמותיות. ענה תמיד בעברית, בקצרה ולעניין. '
        'אם המשתמש מבקש לבצע שינוי שמשפיע על הנתונים, וודא את הפרטים '
        'לפני הביצוע באמצעות כלי המאפשר תצוגה מקדימה.'
        '\n\n'
        'כללי עבודה:\n'
        '1. השתמש בכלים שלך לקריאת מצב המערכת לפני שתענה על שאלה.\n'
        '2. כשאתה מבצע פעולה משנת-נתונים, הסבר בקצרה את ההשפעה הצפויה.\n'
        '3. אם המשתמש שאל בעברית – ענה בעברית. אם באנגלית – ענה באנגלית.\n'
        '4. אם חסר מידע (למשל מזהה של ישות), שאל את המשתמש בקצרה.\n'
        '5. אל תמציא מזהים. אם אינך יודע ID – השתמש בכלי שמחזיר רשימה.\n'
    )


# Module-specific guidance. Keep these tight — long prompts are expensive
# and dilute focus.
_MODULE_EXTRA = {
    'timetable': (
        'אתה עוזר ספציפית למערכת השעות. הכלים שלך מאפשרים לבדוק '
        'התנגשויות, לסכם את המערכת, ולהזיז שיעורים בודדים. '
        'הזזת שיעור היא פעולה משנת-נתונים – וודא לפני שתבצע.'
    ),
    'admin_users': (
        'אתה עוזר ספציפית לניהול משתמשי המערכת. עזור למצוא משתמשים '
        'לפי תפקיד או סטטוס, ולתאר פעולות ניהוליות. אל תבצע פעולות '
        'הרסניות (השבתה/מחיקה) ללא אישור מפורש.'
    ),
}


def build_system_prompt(module: str, view_state: Dict[str, Any]) -> str:
    label = MODULE_DISPLAY_NAMES.get(module, module)
    parts = [_base_prompt(label)]
    if module in _MODULE_EXTRA:
        parts.append(_MODULE_EXTRA[module])
    if view_state:
        parts.append(
            'מצב התצוגה הנוכחי (JSON):\n'
            f'```json\n{json.dumps(view_state, ensure_ascii=False, indent=2)}\n```'
        )
    return '\n\n'.join(parts)
