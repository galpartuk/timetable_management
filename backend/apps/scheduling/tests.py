"""Tests for the scheduling app.

Focus: regressions we've actually hit and would want to catch again.
- solver_log surfacing on infeasibility (P3.5)
- detail serializer slimming during 'generating' status (P1.1)
- auto teacher_availability constraint sync on set_teacher_day_off (P2.4)

Kept narrow on purpose — the solver itself is exercised by its own engine
tests; here we only verify the contracts the UI relies on.
"""
from datetime import time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.school.models import Grade, School, SchoolClass, TimeSlot
from apps.subjects.models import Subject, Teacher, TeachingAssignment
from apps.scheduling.models import Constraint, Timetable, TimetableEntry, TimetableSnapshot
from apps.scheduling.snapshots import (
    MAX_SNAPSHOTS_PER_TIMETABLE, restore_snapshot, snapshot_timetable,
)
from solver.engine import solve_timetable


def _make_school_with_minimum_load() -> tuple[School, SchoolClass, Teacher, Subject]:
    school = School.objects.create(name='Test School')
    grade = Grade.objects.create(school=school, name='ז', level=7)
    klass = SchoolClass.objects.create(grade=grade, number=1)
    teacher = Teacher.objects.create(school=school, first_name='Test', last_name='Teacher')
    subject = Subject.objects.create(school=school, name_he='מתמטיקה')
    # Five teaching slots Sun..Thu, period 1 — enough to fit a 5-hour weekly load.
    for day in range(1, 6):
        TimeSlot.objects.create(
            school=school, day=day, period=1,
            start_time=time(8, 0), end_time=time(8, 45),
        )
    TeachingAssignment.objects.create(
        subject=subject, teacher=teacher, school_class=klass,
        weekly_hours=Decimal('5'),
    )
    return school, klass, teacher, subject


class SolverLogSurfacingTest(TestCase):
    """P3.5 — when the builder fails (infeasibility), Timetable.solver_log
    must be populated AND the value must be returned via the detail API,
    because the failure UI is the only diagnostic the user gets."""

    def test_infeasible_constraint_populates_solver_log(self):
        school, klass, teacher, subject = _make_school_with_minimum_load()
        # Impossible: cap the class at 1 lesson/day when it needs 5 in 5 slots
        # all on different days — actually feasible. To force infeasibility,
        # cap at 1 lesson/day AND require a day off for the teacher → only
        # 4 days left, but 5 lessons → over-allocated.
        Constraint.objects.create(
            school=school, name='cap',
            constraint_type='max_daily_hours_class',
            priority=Constraint.Priority.HARD,
            school_class=klass,
            parameters={'max_hours': 1},
        )
        teacher.day_off = 1
        teacher.save(update_fields=['day_off'])
        tt = Timetable.objects.create(school=school, name='t', academic_year='2026-2027')
        ok = solve_timetable(tt, max_time_seconds=5)
        self.assertFalse(ok)
        self.assertTrue(tt.solver_log.strip(),
                        'solver_log must be populated on failure so the UI can show it')

    def test_detail_api_returns_solver_log_for_failed_timetable(self):
        school, klass, teacher, subject = _make_school_with_minimum_load()
        # Persist a failed timetable directly — no need to actually run the
        # solver for this contract check, the log is what we care about.
        tt = Timetable.objects.create(
            school=school, name='already-failed', academic_year='2026-2027',
            status=Timetable.Status.FAILED, solver_log='diagnostic message',
        )
        user = get_user_model().objects.create_user(username='u', password='p')
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get(f'/api/timetables/{tt.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('solver_log', resp.data)
        self.assertEqual(resp.data['solver_log'], 'diagnostic message')


class GeneratingDetailIsSlimTest(TestCase):
    """P1.1 — the detail endpoint must NOT walk every entry while the
    solver is mid-write. The whole-grid load is what blocked F5 for two
    minutes during a build; the serializer returns [] instead."""

    def test_entries_omitted_while_generating(self):
        school, klass, teacher, subject = _make_school_with_minimum_load()
        tt = Timetable.objects.create(
            school=school, name='in-flight', academic_year='2026-2027',
            status=Timetable.Status.GENERATING,
        )
        user = get_user_model().objects.create_user(username='u2', password='p')
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get(f'/api/timetables/{tt.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['entries'], [])

    def test_quality_returns_empty_while_generating(self):
        school, klass, teacher, subject = _make_school_with_minimum_load()
        tt = Timetable.objects.create(
            school=school, name='in-flight', academic_year='2026-2027',
            status=Timetable.Status.GENERATING,
        )
        user = get_user_model().objects.create_user(username='u3', password='p')
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get(f'/api/timetables/{tt.id}/quality/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data.get('generating'))
        self.assertEqual(resp.data['teachers'], [])


class AutoTeacherDayOffConstraintTest(TestCase):
    """P2.4 — set_teacher_day_off mirrors the legacy Teacher.day_off field
    to a real Constraint row so the user can see + edit + remove it from
    the Constraints page."""

    def test_set_creates_constraint_and_clear_deletes(self):
        from apps.ai_assistant.tools.constraints import _set_teacher_day_off
        from apps.ai_assistant.tools.base import ToolContext

        school, klass, teacher, _subject = _make_school_with_minimum_load()
        # Spread time slots across all 5 days so the auto-constraint has
        # something to block on each day.
        for day in range(1, 6):
            for period in range(2, 5):
                TimeSlot.objects.get_or_create(
                    school=school, day=day, period=period,
                    defaults={'start_time': time(8, 0), 'end_time': time(8, 45)},
                )

        ctx = ToolContext(request=None, module='global',
                          view_state={'school_id': school.id})
        result = _set_teacher_day_off(
            {'teacher_id': teacher.id, 'day': 3}, ctx,
        )
        self.assertTrue(result.get('updated'))
        self.assertIsNotNone(result.get('constraint_id'))

        c = Constraint.objects.get(id=result['constraint_id'])
        self.assertEqual(c.constraint_type, 'teacher_availability')
        self.assertEqual(c.teacher_id, teacher.id)
        self.assertTrue(c.parameters.get('auto_day_off'))
        slots = c.parameters.get('unavailable', [])
        self.assertGreater(len(slots), 0)
        self.assertTrue(all(s['day'] == 3 for s in slots))

        # Clearing the day off deletes the auto constraint.
        result2 = _set_teacher_day_off(
            {'teacher_id': teacher.id, 'day': None}, ctx,
        )
        self.assertTrue(result2.get('updated'))
        self.assertIsNone(result2.get('constraint_id'))
        self.assertFalse(Constraint.objects.filter(id=c.id).exists())


class SnapshotRoundTripTest(TestCase):
    """Snapshot → mutate → restore must put the timetable back to byte-for-byte
    the same shape. This is the foundation of the auto-approve safety net."""

    def setUp(self):
        self.school, self.klass, self.teacher, self.subject = _make_school_with_minimum_load()
        self.tt = Timetable.objects.create(
            school=self.school, name='snap-tt', academic_year='2026-2027',
            status=Timetable.Status.COMPLETED,
        )
        # Seed two entries we can mutate + restore.
        ts1 = TimeSlot.objects.get(school=self.school, day=1, period=1)
        ts2 = TimeSlot.objects.get(school=self.school, day=2, period=1)
        self.e1 = TimetableEntry.objects.create(
            timetable=self.tt, school_class=self.klass, subject=self.subject,
            teacher=self.teacher, time_slot=ts1,
        )
        self.e2 = TimetableEntry.objects.create(
            timetable=self.tt, school_class=self.klass, subject=self.subject,
            teacher=self.teacher, time_slot=ts2,
        )
        self.ts1, self.ts2 = ts1, ts2

    def test_snapshot_then_restore_repopulates_entries(self):
        snap = snapshot_timetable(
            self.tt, TimetableSnapshot.TriggeredBy.MANUAL_SAVE,
            description='test save',
        )
        self.assertIsNotNone(snap)
        self.assertEqual(len(snap.entries_data), 2)

        # Wipe the entries — simulates a bad rebuild / destructive AI action.
        TimetableEntry.objects.filter(timetable=self.tt).delete()
        self.assertEqual(self.tt.entries.count(), 0)

        restored = restore_snapshot(snap)
        self.assertEqual(restored, 2)
        self.assertEqual(self.tt.entries.count(), 2)
        # Restore also created a before_restore snapshot of the (empty) state.
        kinds = list(self.tt.snapshots.values_list('triggered_by', flat=True))
        self.assertIn(TimetableSnapshot.TriggeredBy.BEFORE_RESTORE, kinds)

    def test_prune_caps_at_max(self):
        for i in range(MAX_SNAPSHOTS_PER_TIMETABLE + 5):
            snapshot_timetable(
                self.tt, TimetableSnapshot.TriggeredBy.MANUAL_SAVE,
                description=f'#{i}',
            )
        self.assertEqual(self.tt.snapshots.count(), MAX_SNAPSHOTS_PER_TIMETABLE)


class FeasibilityAnalyzerTest(TestCase):
    """The pre-flight analyzer must catch the cases that would otherwise
    cost a 3-30s solver round-trip and a "no clear cause" message."""

    def test_clean_setup_has_no_blockers(self):
        from solver.feasibility import analyze
        school, *_ = _make_school_with_minimum_load()
        report = analyze(school)
        self.assertTrue(report.feasible_likely, report.as_dict())
        self.assertEqual(report.blockers, [])

    def test_class_overload_is_a_blocker(self):
        from solver.feasibility import analyze
        from datetime import time
        school, klass, teacher, subject = _make_school_with_minimum_load()
        # The fixture has 5 time slots (one per day, period 1). Pile 20
        # weekly hours on the class → 20 lessons, 5 slots → blocker.
        TeachingAssignment.objects.filter(school_class=klass).delete()
        TeachingAssignment.objects.create(
            subject=subject, teacher=teacher, school_class=klass,
            weekly_hours=Decimal('20'),
        )
        report = analyze(school)
        self.assertFalse(report.feasible_likely)
        codes = [i.code for i in report.blockers]
        self.assertIn('class_overload', codes)
        self.assertIn('teacher_overload', codes)

    def test_subject_day_blackout_overload_caught(self):
        """Loading 5 weekly hours of a subject AND blacking out 4 of the 5
        school days for it leaves only 1 day's worth of slots — blocker."""
        from solver.feasibility import analyze
        from datetime import time
        school, klass, teacher, subject = _make_school_with_minimum_load()
        # Extend slots so the only blocker is the blackout, not raw capacity.
        for day in range(1, 6):
            for period in range(2, 5):
                TimeSlot.objects.get_or_create(
                    school=school, day=day, period=period,
                    defaults={'start_time': time(8, 0), 'end_time': time(8, 45)},
                )
        Constraint.objects.create(
            school=school, name='no subject most days',
            constraint_type='subject_day_blackout',
            priority=Constraint.Priority.HARD,
            school_class=klass, subject=subject,
            parameters={'days': [1, 2, 3, 4]},  # only day 5 left
        )
        # Bump assignment hours past day-5's max-per-day cap (default 4).
        TeachingAssignment.objects.filter(school_class=klass).delete()
        TeachingAssignment.objects.create(
            subject=subject, teacher=teacher, school_class=klass,
            weekly_hours=Decimal('10'),
        )
        report = analyze(school)
        codes = [i.code for i in report.blockers]
        self.assertIn('blackout_overload', codes)


class SubjectDayBlackoutTest(TestCase):
    """subject_day_blackout — forbid a (subject, day) for a class (or all
    classes). Verifies (a) the AI tool creates the constraint correctly and
    (b) the solver actually respects it (no lessons of that subject land on
    the blocked day for the targeted class)."""

    def test_create_via_ai_tool(self):
        from apps.ai_assistant.tools.constraints import _create_constraint
        from apps.ai_assistant.tools.base import ToolContext

        school, klass, _teacher, subject = _make_school_with_minimum_load()
        ctx = ToolContext(request=None, module='global',
                          view_state={'school_id': school.id})

        # Missing days → rejected.
        bad = _create_constraint({
            'constraint_type': 'subject_day_blackout',
            'subject_id': subject.id,
            'class_id': klass.id,
        }, ctx)
        self.assertIn('error', bad)

        # Happy path with a name (Hebrew) and explicit day.
        ok = _create_constraint({
            'constraint_type': 'subject_day_blackout',
            'subject_id': subject.id,
            'class_id': klass.id,
            'days': [3],
        }, ctx)
        self.assertTrue(ok.get('created'), ok)
        c = Constraint.objects.get(id=ok['constraint_id'])
        self.assertEqual(c.constraint_type, 'subject_day_blackout')
        self.assertEqual(c.parameters['days'], [3])

    def test_solver_respects_blocked_day(self):
        # Single class, one subject, 5 weekly lessons across Sun..Thu period 1.
        # Block the subject on Tuesday (day=3) — solver should pack 5 lessons
        # into the remaining 4 days. We accept it failing too (legitimate
        # infeasibility), but if it SUCCEEDS, the day-3 slot must be empty.
        school, klass, teacher, subject = _make_school_with_minimum_load()
        # Give 4 weekly hours so 4 days (Sun, Mon, Wed, Thu) are enough.
        TeachingAssignment.objects.filter(school_class=klass).delete()
        TeachingAssignment.objects.create(
            subject=subject, teacher=teacher, school_class=klass,
            weekly_hours=Decimal('4'),
        )
        Constraint.objects.create(
            school=school, name='no Tuesday math',
            constraint_type='subject_day_blackout',
            priority=Constraint.Priority.HARD,
            school_class=klass, subject=subject,
            parameters={'days': [3]},
        )
        tt = Timetable.objects.create(school=school, name='t', academic_year='2026-2027')
        ok = solve_timetable(tt, max_time_seconds=10)
        self.assertTrue(ok, tt.solver_log)
        # No entries on day 3.
        bad = tt.entries.filter(time_slot__day=3).count()
        self.assertEqual(bad, 0, 'subject was scheduled on a blacked-out day')


class SnapshotEndpointsTest(TestCase):
    """The /api/timetables/{id}/snapshots/ endpoints — list, create, restore."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient

        self.school, self.klass, self.teacher, self.subject = _make_school_with_minimum_load()
        self.tt = Timetable.objects.create(
            school=self.school, name='ep-tt', academic_year='2026-2027',
            status=Timetable.Status.COMPLETED,
        )
        ts1 = TimeSlot.objects.get(school=self.school, day=1, period=1)
        TimetableEntry.objects.create(
            timetable=self.tt, school_class=self.klass, subject=self.subject,
            teacher=self.teacher, time_slot=ts1,
        )
        self.user = get_user_model().objects.create_user(username='snap', password='p')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_post_creates_manual_snapshot_and_get_lists_it(self):
        resp = self.client.post(f'/api/timetables/{self.tt.id}/snapshots/',
                                {'description': 'before risky stuff'},
                                format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['triggered_by'], 'manual_save')
        self.assertEqual(resp.data['entry_count'], 1)

        listing = self.client.get(f'/api/timetables/{self.tt.id}/snapshots/')
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(listing.data[0]['description'], 'before risky stuff')

    def test_restore_endpoint_roundtrips(self):
        # Create a snapshot, wipe entries, restore — count comes back.
        self.client.post(f'/api/timetables/{self.tt.id}/snapshots/', {}, format='json')
        snap_id = self.tt.snapshots.first().id

        TimetableEntry.objects.filter(timetable=self.tt).delete()
        self.assertEqual(self.tt.entries.count(), 0)

        resp = self.client.post(
            f'/api/timetables/{self.tt.id}/snapshots/{snap_id}/restore/',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['entries_restored'], 1)
        self.assertEqual(self.tt.entries.count(), 1)
