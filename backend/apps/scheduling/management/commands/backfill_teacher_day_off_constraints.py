"""One-time backfill: surface every existing Teacher.day_off as a real
``teacher_availability`` Constraint row so it shows up in the Constraints UI.

Before this command, set_teacher_day_off (and admin edits) only updated the
Teacher.day_off column. The solver still enforced the day-off, but the user
could not see, edit, or remove it from the Constraints page.

Idempotent: each (teacher, day) pair gets at most one auto row, marked by
``parameters.auto_day_off=True``. Re-running the command updates the slot
list (so adding a TimeSlot to the school refreshes the block).

Usage:
    python manage.py backfill_teacher_day_off_constraints
    python manage.py backfill_teacher_day_off_constraints --school 1
    python manage.py backfill_teacher_day_off_constraints --dry-run
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.ai_assistant.tools.constraints import _sync_day_off_constraint
from apps.subjects.models import Teacher


class Command(BaseCommand):
    help = 'Mirror Teacher.day_off values to teacher_availability Constraint rows.'

    def add_arguments(self, parser):
        parser.add_argument('--school', type=int, default=None,
                            help='Restrict backfill to this school id.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would change; do not write.')

    def handle(self, *args, **opts):
        qs = Teacher.objects.filter(day_off__isnull=False)
        if opts['school']:
            qs = qs.filter(school_id=opts['school'])
        created = updated = skipped = 0
        for teacher in qs:
            if opts['dry_run']:
                self.stdout.write(
                    f'would sync teacher #{teacher.id} ({teacher}) day_off={teacher.day_off}'
                )
                skipped += 1
                continue
            before = teacher.constraints.filter(
                constraint_type='teacher_availability',
            ).count()
            _sync_day_off_constraint(teacher, teacher.day_off, teacher.school_id)
            after = teacher.constraints.filter(
                constraint_type='teacher_availability',
            ).count()
            if after > before:
                created += 1
            else:
                updated += 1
        self.stdout.write(self.style.SUCCESS(
            f'done — created={created} updated={updated} skipped={skipped}'
        ))
