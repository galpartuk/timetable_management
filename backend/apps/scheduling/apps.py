from django.apps import AppConfig
from django.db.backends.signals import connection_created

# Process-wide one-shot guard. A fresh process can't have a build in flight
# (builds are in-memory daemon threads that die with the process), so the
# first DB connection is a safe moment to clean up rows left 'generating' by
# a previous process.
_recovered = False


def _apply_sqlite_pragmas(sender, connection, **kwargs):
    """Switch SQLite to WAL on every connection so readers don't block on the
    solver's bulk_create write. Idempotent — PRAGMAs are cheap to repeat.
    No-op for non-SQLite backends so the same project can boot on Postgres."""
    if connection.vendor != 'sqlite':
        return
    with connection.cursor() as cursor:
        # WAL: readers and one writer can proceed concurrently. Persistent
        # across connections once set, but re-issuing is free.
        cursor.execute('PRAGMA journal_mode=WAL;')
        # NORMAL fsync (paired with WAL) trades a marginal durability window
        # for ~5× write throughput — fine for a single-school timetable app.
        cursor.execute('PRAGMA synchronous=NORMAL;')
        # Wait up to 5s for the write-lock instead of erroring immediately;
        # OPTIONS.timeout in settings is the outer ceiling.
        cursor.execute('PRAGMA busy_timeout=5000;')
        # Modest cache so heavy queries (quality, timetable detail) stay hot.
        cursor.execute('PRAGMA cache_size=-20000;')  # ~20MB


def _recover_orphaned_builds_once(sender, connection, **kwargs):
    global _recovered
    if _recovered:
        return
    _recovered = True  # set before querying so the query doesn't re-enter
    from .tasks import recover_orphaned_builds
    recover_orphaned_builds()


class SchedulingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.scheduling'
    label = 'scheduling'

    def ready(self):
        # Run SQLite WAL setup on every fresh connection — without it the
        # solver's bulk_create transaction blocks every concurrent reader and
        # the UI freezes on F5 mid-build (see settings.DATABASES comment).
        connection_created.connect(
            _apply_sqlite_pragmas,
            dispatch_uid='scheduling.sqlite_pragmas',
        )
        # Reset builds orphaned by a previous process restart so the UI never
        # polls a dead 'generating' row forever. Hooked to the first DB
        # connection rather than run inline here — querying during app
        # initialization triggers Django's "accessing the database during app
        # init" warning and can precede migrations.
        connection_created.connect(
            _recover_orphaned_builds_once,
            dispatch_uid='scheduling.recover_orphaned_builds',
        )
