"""Background task runner for long jobs that exceed reverse-proxy timeouts.

We use plain ``threading`` (no Celery dependency). The CP-SAT solver is a
native C++ extension that releases Python's GIL during ``Solve()``, so a
single background thread does not block other Django requests in a way
that matters for the school-manager workload (<10 concurrent users).

The thread is daemonised so a server restart cancels in-flight builds
rather than blocking shutdown. The Timetable row is the single source of
truth for status; clients poll ``GET /api/timetables/{id}/`` and watch
``status`` flip from ``generating`` to ``completed`` / ``failed``.

If the project later grows past a single worker process, swap this
implementation for Celery (or django-q). Keep the same on-row status
contract and the HTTP / mobile clients won't need to change.
"""
from __future__ import annotations

import logging
import threading
import time
import traceback
from typing import Set

from django.db import close_old_connections

from .models import Timetable

logger = logging.getLogger(__name__)

# Timetable IDs currently being generated. Guards against double-clicks
# launching two parallel builds on the same row.
_inflight: Set[int] = set()
_inflight_lock = threading.Lock()


def is_generating(timetable_id: int) -> bool:
    with _inflight_lock:
        return timetable_id in _inflight


def start_generation(timetable: Timetable, *, max_time_seconds: int = 300) -> bool:
    """Kick off a background build for ``timetable``. Returns True if a
    new thread was started, False if a build for this timetable was
    already in flight.
    """
    with _inflight_lock:
        if timetable.id in _inflight:
            return False
        _inflight.add(timetable.id)

    timetable.status = Timetable.Status.GENERATING
    timetable.solver_log = ''
    timetable.progress = {
        'phase': 'starting',
        'max_time_seconds': max_time_seconds,
        'started_at': time.time(),
    }
    timetable.save(update_fields=['status', 'solver_log', 'progress'])

    thread = threading.Thread(
        target=_run_builder,
        args=(timetable.id, max_time_seconds),
        name=f'tt-builder-{timetable.id}',
        daemon=True,
    )
    thread.start()
    return True


def _run_builder(timetable_id: int, max_time_seconds: int) -> None:
    """Thread entry point — must not raise. Translates every outcome
    (success, no-solution, code crash, OOM) into a persisted status."""
    try:
        # Local import: keep solver imports out of Django startup so
        # `manage.py` commands aren't slowed by OR-tools' load time.
        from solver.engine import solve_timetable

        tt = Timetable.objects.filter(id=timetable_id).first()
        if tt is None:
            logger.warning('builder: timetable %s vanished before run', timetable_id)
            return

        try:
            success = solve_timetable(tt, max_time_seconds=max_time_seconds)
        except BaseException as exc:  # noqa: BLE001 — catch MemoryError/SystemExit too
            logger.exception('builder crashed for timetable %s', timetable_id)
            tt.status = Timetable.Status.FAILED
            tt.solver_log = (
                f'{type(exc).__name__}: {exc}\n\n{traceback.format_exc()}'
            )
            tt.save(update_fields=['status', 'solver_log'])
            return

        # solve_timetable may have written to solver_log itself; refresh
        # so our status flip doesn't overwrite it.
        tt.refresh_from_db(fields=['solver_log'])
        tt.status = (
            Timetable.Status.COMPLETED if success else Timetable.Status.FAILED
        )
        tt.save(update_fields=['status'])
    finally:
        with _inflight_lock:
            _inflight.discard(timetable_id)
        # Each thread gets its own DB connection; close it so we don't
        # leak one per build.
        close_old_connections()
