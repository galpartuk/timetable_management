"""One-time cleanup for the legacy "subject_key" parser bug: same person
appearing in multiple sheets (homeroom + subject) was imported as several
Teacher rows. This command merges duplicates by canonical first_name within
the same school, moving all referencing FKs to the oldest row and deleting
the rest.

Usage:
    python manage.py merge_duplicate_teachers --school-id 1
    python manage.py merge_duplicate_teachers --school-id 1 --dry-run

Idempotent: re-runs find no work to do once the data is clean.
"""

from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.subjects.models import Teacher, TeachingAssignment, TeacherRole
from apps.school.models import School, SchoolClass


class Command(BaseCommand):
    help = 'Merge duplicate Teacher rows that share a first name within a school.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--school-id', type=int, required=True,
            help='ID of the School whose teachers to dedupe.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report what would be merged without making any changes.',
        )

    def handle(self, *args, school_id, dry_run, **kwargs):
        try:
            school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            raise CommandError(f'School id={school_id} not found')

        # Group by canonical first_name (the parser already canonicalizes
        # when creating; we trust the stored value here).
        groups: dict[str, list[Teacher]] = defaultdict(list)
        for t in Teacher.objects.filter(school=school).order_by('id'):
            groups[t.first_name].append(t)

        duplicates = {n: ts for n, ts in groups.items() if len(ts) > 1}
        if not duplicates:
            self.stdout.write(self.style.SUCCESS('No duplicates found — DB is clean.'))
            return

        self.stdout.write(
            f'Found {len(duplicates)} name(s) with duplicates '
            f'({sum(len(ts) for ts in duplicates.values())} total Teacher rows):'
        )
        for name, teachers in duplicates.items():
            ids = ', '.join(f'#{t.id}' for t in teachers)
            self.stdout.write(f'  {name!r}: {ids}')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes made.'))
            return

        with transaction.atomic():
            merged_count = 0
            deleted_count = 0
            for name, teachers in duplicates.items():
                keeper = teachers[0]  # oldest id
                losers = teachers[1:]
                for loser in losers:
                    # Move all references onto the keeper.
                    TeachingAssignment.objects.filter(teacher=loser).update(teacher=keeper)
                    TeacherRole.objects.filter(teacher=loser).update(teacher=keeper)
                    SchoolClass.objects.filter(homeroom_teacher=loser).update(homeroom_teacher=keeper)
                    # Wipe the loser's identity fields before delete so any
                    # leftover refs we missed surface as nulls, not as
                    # "ghost teachers" with a half-formed name.
                    loser.delete()
                    deleted_count += 1
                # Normalize keeper's last_name: the bug stored the subject name there.
                if keeper.last_name:
                    keeper.last_name = ''
                    keeper.save(update_fields=['last_name'])
                merged_count += 1
            self.stdout.write(self.style.SUCCESS(
                f'Merged {merged_count} name group(s); deleted {deleted_count} duplicate row(s).'
            ))
