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
from apps.scheduling.models import Constraint, Timetable
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
