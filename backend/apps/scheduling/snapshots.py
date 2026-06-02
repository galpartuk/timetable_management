"""Helpers around TimetableSnapshot.

Snapshots make the AI-driven edit flow safe: before every mutating action
(move / swap / restore / generate) we save the current entries; if the user
regrets the change they restore in one click. Pairing this with auto-approve
mode in the AI panel removes the chain of confirmation dialogs without losing
the safety net.
"""
from __future__ import annotations

from typing import Iterable

from django.db import transaction

from .models import Timetable, TimetableEntry, TimetableSnapshot

# Cap snapshots per timetable so a busy chat session doesn't grow unbounded.
# A snapshot is a few KB; 50 covers a long working day's worth of edits and
# still keeps the table small. Pruned LRU on every snapshot write.
MAX_SNAPSHOTS_PER_TIMETABLE = 50

# Fields we serialize per TimetableEntry. Keep in sync with the model: any new
# scheduling-relevant column needs to land here so restore is lossless.
ENTRY_FIELDS = (
    'school_class_id', 'subject_id', 'teacher_id',
    'time_slot_id', 'room_id', 'locked',
)


def snapshot_timetable(
    timetable: Timetable,
    triggered_by: str,
    *,
    description: str = '',
    actor=None,
) -> TimetableSnapshot:
    """Capture the current entries of ``timetable`` into a new snapshot row.

    Best-effort: never raises (callers are usually inside mutating paths
    where we'd rather lose a snapshot than fail the user's action). Prunes
    older snapshots so the table stays bounded.
    """
    try:
        entries = list(timetable.entries.values(*ENTRY_FIELDS))
        snap = TimetableSnapshot.objects.create(
            timetable=timetable,
            triggered_by=triggered_by,
            description=(description or '')[:300],
            entries_data=entries,
            actor=actor if (actor and getattr(actor, 'is_authenticated', False)) else None,
        )
        _prune(timetable)
        return snap
    except Exception:  # pragma: no cover — safety: never let snapshotting break a user action
        return None  # type: ignore[return-value]


def _prune(timetable: Timetable) -> None:
    """Keep at most MAX_SNAPSHOTS_PER_TIMETABLE snapshots per timetable.
    Newest are kept; oldest are deleted in one bulk DELETE."""
    excess_ids: Iterable[int] = (
        TimetableSnapshot.objects
        .filter(timetable=timetable)
        .order_by('-created_at')
        .values_list('id', flat=True)[MAX_SNAPSHOTS_PER_TIMETABLE:]
    )
    excess_ids = list(excess_ids)
    if excess_ids:
        TimetableSnapshot.objects.filter(id__in=excess_ids).delete()


def restore_snapshot(snapshot: TimetableSnapshot, *, actor=None) -> int:
    """Replace the timetable's current entries with the snapshot's contents.

    Snapshots the CURRENT state first (triggered_by=before_restore) so the
    user can undo the restore itself. Returns the number of entries written.
    """
    tt = snapshot.timetable
    snapshot_timetable(
        tt, TimetableSnapshot.TriggeredBy.BEFORE_RESTORE,
        description=f'לפני שחזור לגרסה מ-{snapshot.created_at:%Y-%m-%d %H:%M}',
        actor=actor,
    )
    with transaction.atomic():
        TimetableEntry.objects.filter(timetable=tt).delete()
        TimetableEntry.objects.bulk_create(
            [TimetableEntry(timetable=tt, **row) for row in snapshot.entries_data],
            batch_size=1000,
            ignore_conflicts=True,
        )
    return len(snapshot.entries_data)
