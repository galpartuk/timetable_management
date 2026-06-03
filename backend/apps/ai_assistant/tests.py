"""Tests for AI-assistant data-admin tools (destructive reset)."""
from datetime import time
from decimal import Decimal

from django.test import TestCase

from apps.scheduling.models import Timetable, TimetableEntry
from apps.school.models import Grade, School, SchoolClass, TimeSlot
from apps.subjects.models import (
    Subject, Teacher, TeacherTag, TeachingAssignment,
)
from apps.ai_assistant.tools import data_admin, get_tool
from apps.ai_assistant.tools.base import ToolContext


class ResetSchoolDataToolTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='איפוס')
        self.grade = Grade.objects.create(school=self.school, name='ז', level=7)
        self.cls = SchoolClass.objects.create(grade=self.grade, number=1)
        self.slot = TimeSlot.objects.create(
            school=self.school, day=1, period=1,
            start_time=time(8, 0), end_time=time(8, 45),
        )
        self.subj = Subject.objects.create(school=self.school, name_he='מתמטיקה')
        self.teacher = Teacher.objects.create(school=self.school, first_name='דנה')
        TeacherTag.objects.create(school=self.school, name='מתמטיקה', kind='department')
        TeachingAssignment.objects.create(
            subject=self.subj, teacher=self.teacher, school_class=self.cls,
            weekly_hours=Decimal('3'),
        )
        self.tt = Timetable.objects.create(school=self.school, name='tt')
        self.ctx = ToolContext(request=None, module='global', view_state={'school_id': self.school.id})

    def _run(self, scope):
        return data_admin._reset_data({'school_id': self.school.id, 'scope': scope}, self.ctx)

    def test_registered_and_requires_confirmation(self):
        tool = get_tool('reset_school_data')
        self.assertIsNotNone(tool)
        self.assertTrue(tool.requires_confirmation)

    def test_scope_assignments_only(self):
        res = self._run('assignments')
        self.assertTrue(res['reset'])
        self.assertEqual(TeachingAssignment.objects.filter(school_class__grade__school=self.school).count(), 0)
        # Teachers/subjects/timetables untouched.
        self.assertEqual(Teacher.objects.filter(school=self.school).count(), 1)
        self.assertEqual(Timetable.objects.filter(school=self.school).count(), 1)

    def test_scope_everything_wipes_but_keeps_structure(self):
        res = self._run('everything')
        self.assertTrue(res['reset'])
        self.assertEqual(Teacher.objects.filter(school=self.school).count(), 0)
        self.assertEqual(Subject.objects.filter(school=self.school).count(), 0)
        self.assertEqual(TeachingAssignment.objects.filter(school_class__grade__school=self.school).count(), 0)
        self.assertEqual(TeacherTag.objects.filter(school=self.school).count(), 0)
        self.assertEqual(Timetable.objects.filter(school=self.school).count(), 0)
        # Classes and time slots are preserved so a fresh import can upsert.
        self.assertEqual(SchoolClass.objects.filter(grade__school=self.school).count(), 1)
        self.assertEqual(TimeSlot.objects.filter(school=self.school).count(), 1)

    def test_invalid_scope_rejected(self):
        res = self._run('bogus')
        self.assertIn('error', res)
