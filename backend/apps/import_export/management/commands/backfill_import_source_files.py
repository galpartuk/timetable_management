"""Pair orphaned .xlsx files in MEDIA_ROOT/imports/ with ImportLog rows that
have an empty ``source_file``. Best-effort match by filename + timestamp
proximity — won't touch anything ambiguous.

Older imports (before ImportLog.source_file was added) only stored the file
NAME, not the bytes. The Excel file may still be sitting in media/imports/
from a prior upload — if so, we can re-link it so the user can download the
original from the loaded-data panel.

Usage:
    python manage.py backfill_import_source_files
    python manage.py backfill_import_source_files --dry-run
"""
from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from apps.import_export.models import ImportLog

# How close a file's mtime must be to the log's uploaded_at to count as a
# confident match. Generous enough to survive timezone glitches; tight enough
# to avoid grabbing an unrelated import done minutes later.
MATCH_WINDOW = timedelta(minutes=10)


class Command(BaseCommand):
    help = 'Re-link orphaned media/imports/*.xlsx files to ImportLog rows missing source_file.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        imports_dir = Path(settings.MEDIA_ROOT) / 'imports'
        if not imports_dir.exists():
            self.stdout.write('no media/imports/ directory — nothing to backfill')
            return

        files = list(imports_dir.glob('*.xlsx')) + list(imports_dir.glob('*.xls'))
        if not files:
            self.stdout.write('no candidate files in media/imports/')
            return

        logs = list(
            ImportLog.objects
            .filter(source_file='', status=ImportLog.Status.COMPLETED, is_dry_run=False)
            .order_by('-uploaded_at')
        )
        if not logs:
            self.stdout.write('no ImportLog rows are missing source_file — nothing to do')
            return

        linked = ambiguous = skipped = 0
        for log in logs:
            # Same-name candidates only; if the original file name is gone the
            # match is too noisy to be safe.
            candidates = [f for f in files if f.name == log.file_name]
            if not candidates:
                skipped += 1
                continue
            # Prefer the closest mtime to the log's uploaded_at.
            from datetime import datetime, timezone
            best, best_delta = None, None
            for f in candidates:
                mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
                delta = abs(mtime - log.uploaded_at)
                if delta > MATCH_WINDOW:
                    continue
                if best_delta is None or delta < best_delta:
                    best, best_delta = f, delta
            if best is None:
                ambiguous += 1
                self.stdout.write(self.style.WARNING(
                    f'log #{log.id} ({log.file_name}): {len(candidates)} candidate(s) '
                    f'but none within ±{MATCH_WINDOW}'
                ))
                continue
            if opts['dry_run']:
                self.stdout.write(f'would link log #{log.id} → {best}')
                continue
            with best.open('rb') as fh:
                log.source_file.save(best.name, File(fh), save=True)
            linked += 1
            self.stdout.write(self.style.SUCCESS(f'linked log #{log.id} → {best.name}'))

        self.stdout.write(self.style.SUCCESS(
            f'done — linked={linked} ambiguous={ambiguous} no_candidate={skipped}'
        ))
