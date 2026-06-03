"""Tests for the teacher auto-categorization service (department + coordinator
tags) and the bulk day-off endpoint."""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.school.models import Grade, School, SchoolClass
from apps.subjects.models import (
    Subject, Teacher, TeacherRole, TeacherTag, TeachingAssignment,
)
from apps.subjects.services.tagging import (
    sync_coordinator_tags, sync_department_tags,
)


class _Fixture(TestCase):
    """Builds a small school: two subjects, three teachers, assignments that
    give each teacher a clear (or tied) primary subject."""

    def setUp(self):
        self.school = School.objects.create(name='בית ספר לבדיקה')
        self.grade = Grade.objects.create(school=self.school, name='ז', level=7)
        self.cls1 = SchoolClass.objects.create(grade=self.grade, number=1)
        self.cls2 = SchoolClass.objects.create(grade=self.grade, number=2)

        self.math = Subject.objects.create(school=self.school, name_he='מתמטיקה')
        self.physics = Subject.objects.create(school=self.school, name_he='פיזיקה')

        # dana: 5h math in cls1 + 3h math in cls2 = 8h math, 2h physics -> math.
        self.dana = Teacher.objects.create(school=self.school, first_name='דנה')
        self._assign(self.dana, self.math, self.cls1, 5)
        self._assign(self.dana, self.math, self.cls2, 3)
        self._assign(self.dana, self.physics, self.cls1, 2)

        # noa: physics only -> physics.
        self.noa = Teacher.objects.create(school=self.school, first_name='נועה')
        self._assign(self.noa, self.physics, self.cls1, 4)

        # ron: no assignments -> no department.
        self.ron = Teacher.objects.create(school=self.school, first_name='רון')

    def _assign(self, teacher, subject, cls, hours):
        return TeachingAssignment.objects.create(
            subject=subject, teacher=teacher, school_class=cls,
            weekly_hours=Decimal(hours),
        )


class DepartmentTaggingTests(_Fixture):

    def test_assigns_primary_subject_department(self):
        sync_department_tags(self.school)
        self.assertEqual(
            sorted(self.dana.tags.values_list('name', flat=True)), ['מתמטיקה'],
        )
        self.assertEqual(
            sorted(self.noa.tags.values_list('name', flat=True)), ['פיזיקה'],
        )
        # No assignments -> no department tag.
        self.assertEqual(self.ron.tags.count(), 0)
        # One department tag per subject-with-teachers, kind + subject set.
        math_tag = TeacherTag.objects.get(school=self.school, name='מתמטיקה')
        self.assertEqual(math_tag.kind, TeacherTag.Kind.DEPARTMENT)
        self.assertEqual(math_tag.subject, self.math)

    def test_fill_if_empty_preserves_manual_move(self):
        sync_department_tags(self.school)
        # User moves dana to the physics department by hand.
        physics_tag = TeacherTag.objects.get(school=self.school, name='פיזיקה')
        self.dana.tags.remove(TeacherTag.objects.get(name='מתמטיקה'))
        self.dana.tags.add(physics_tag)
        # Re-running must NOT revert her back to math.
        sync_department_tags(self.school)
        self.assertEqual(
            sorted(self.dana.tags.values_list('name', flat=True)), ['פיזיקה'],
        )

    def test_idempotent(self):
        sync_department_tags(self.school)
        sync_department_tags(self.school)
        self.assertEqual(self.dana.tags.filter(kind=TeacherTag.Kind.DEPARTMENT).count(), 1)
        self.assertEqual(
            TeacherTag.objects.filter(school=self.school, kind=TeacherTag.Kind.DEPARTMENT).count(),
            2,
        )

    def test_homeroom_excluded_from_department(self):
        homeroom = Subject.objects.create(school=self.school, name_he='חינוך')
        # gil: 4h homeroom (most hours) + 2h math -> academic subject wins.
        gil = Teacher.objects.create(school=self.school, first_name='גיל')
        self._assign(gil, homeroom, self.cls1, 4)
        self._assign(gil, self.math, self.cls1, 2)
        # tal: homeroom only -> no department.
        tal = Teacher.objects.create(school=self.school, first_name='טל')
        self._assign(tal, homeroom, self.cls1, 2)

        sync_department_tags(self.school)
        self.assertEqual(sorted(gil.tags.values_list('name', flat=True)), ['מתמטיקה'])
        self.assertEqual(tal.tags.count(), 0)
        # No homeroom department tag is ever created.
        self.assertFalse(TeacherTag.objects.filter(school=self.school, name='חינוך').exists())


class CoordinatorTaggingTests(_Fixture):

    def test_creates_coordinator_tag_matched_to_subject(self):
        TeacherRole.objects.create(
            school=self.school, role_title='ריכוז מתמטיקה', context='מתמטיקה',
            teacher=self.dana,
        )
        sync_coordinator_tags(self.school)
        coord = TeacherTag.objects.get(school=self.school, kind=TeacherTag.Kind.COORDINATOR)
        self.assertEqual(coord.subject, self.math)
        self.assertIn(coord, self.dana.tags.all())

    def test_non_coordinator_role_ignored(self):
        TeacherRole.objects.create(
            school=self.school, role_title='מנהלת ביה"ס', context='', teacher=self.noa,
        )
        sync_coordinator_tags(self.school)
        self.assertEqual(
            TeacherTag.objects.filter(school=self.school, kind=TeacherTag.Kind.COORDINATOR).count(),
            0,
        )

    def test_role_without_teacher_skipped(self):
        TeacherRole.objects.create(
            school=self.school, role_title='ריכוז פיזיקה', context='פיזיקה', teacher=None,
        )
        sync_coordinator_tags(self.school)
        self.assertEqual(
            TeacherTag.objects.filter(school=self.school, kind=TeacherTag.Kind.COORDINATOR).count(),
            0,
        )

    def test_generic_subject_coordinator_split_by_primary_subject(self):
        # dana teaches mostly math (8h vs 2h physics) -> math coordinator.
        TeacherRole.objects.create(
            school=self.school, role_title='רכז מקצוע', context='', teacher=self.dana,
        )
        sync_coordinator_tags(self.school)
        coord = TeacherTag.objects.get(
            school=self.school, kind=TeacherTag.Kind.COORDINATOR, subject=self.math,
        )
        self.assertEqual(coord.name, 'רכז/ת מתמטיקה')
        self.assertIn(coord, self.dana.tags.all())

    def test_administrative_coordinator_stays_subjectless(self):
        TeacherRole.objects.create(
            school=self.school, role_title='רכז ביטחון', context='', teacher=self.noa,
        )
        sync_coordinator_tags(self.school)
        coord = TeacherTag.objects.get(school=self.school, name='רכז ביטחון')
        self.assertEqual(coord.kind, TeacherTag.Kind.COORDINATOR)
        self.assertIsNone(coord.subject)


class BulkDayOffEndpointTests(_Fixture):

    def setUp(self):
        super().setUp()
        from django.contrib.auth.models import User
        self.client = APIClient()
        self.user = User.objects.create_user('tester', password='x')
        self.client.force_authenticate(user=self.user)
        sync_department_tags(self.school)
        self.math_tag = TeacherTag.objects.get(school=self.school, name='מתמטיקה')

    def test_bulk_day_off_by_tag(self):
        resp = self.client.post(
            '/api/teachers/bulk-day-off/',
            {'tag_id': self.math_tag.id, 'day_off': Teacher.Day.TUESDAY},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.dana.refresh_from_db()
        self.noa.refresh_from_db()
        self.assertEqual(self.dana.day_off, Teacher.Day.TUESDAY)
        self.assertIsNone(self.noa.day_off)  # physics dept, untouched

    def test_bulk_day_off_by_ids_and_clear(self):
        self.dana.day_off = Teacher.Day.SUNDAY
        self.dana.save()
        resp = self.client.post(
            '/api/teachers/bulk-day-off/',
            {'teacher_ids': [self.dana.id], 'day_off': None},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.dana.refresh_from_db()
        self.assertIsNone(self.dana.day_off)

    def test_invalid_day_off_rejected(self):
        resp = self.client.post(
            '/api/teachers/bulk-day-off/',
            {'tag_id': self.math_tag.id, 'day_off': 99},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_missing_target_rejected(self):
        resp = self.client.post(
            '/api/teachers/bulk-day-off/', {'day_off': 1}, format='json',
        )
        self.assertEqual(resp.status_code, 400)
