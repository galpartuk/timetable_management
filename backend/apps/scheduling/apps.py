from django.apps import AppConfig
from django.db.backends.signals import connection_created

# Process-wide one-shot guard. A fresh process can't have a build in flight
# (builds are in-memory daemon threads that die with the process), so the
# first DB connection is a safe moment to clean up rows left 'generating' by
# a previous process.
_recovered = False


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
        # Reset builds orphaned by a previous process restart so the UI never
        # polls a dead 'generating' row forever. Hooked to the first DB
        # connection rather than run inline here — querying during app
        # initialization triggers Django's "accessing the database during app
        # init" warning and can precede migrations.
        connection_created.connect(
            _recover_orphaned_builds_once,
            dispatch_uid='scheduling.recover_orphaned_builds',
        )
