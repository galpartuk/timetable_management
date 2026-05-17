from collections import defaultdict

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Constraint, Timetable, TimetableEntry
from .serializers import (
    ConstraintSerializer, TimetableSerializer,
    TimetableListSerializer, TimetableEntrySerializer,
)


class ConstraintViewSet(viewsets.ModelViewSet):
    queryset = Constraint.objects.all()
    serializer_class = ConstraintSerializer
    filterset_fields = ['school', 'constraint_type', 'priority', 'is_active']


class TimetableViewSet(viewsets.ModelViewSet):
    queryset = Timetable.objects.all()
    filterset_fields = ['school', 'status']

    def get_serializer_class(self):
        if self.action == 'list':
            return TimetableListSerializer
        return TimetableSerializer

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        timetable = self.get_object()
        timetable.status = Timetable.Status.GENERATING
        timetable.save()

        try:
            from solver.engine import solve_timetable
            success = solve_timetable(timetable)
            if success:
                timetable.status = Timetable.Status.COMPLETED
            else:
                timetable.status = Timetable.Status.FAILED
            timetable.save()
            return Response(TimetableSerializer(timetable).data)
        except Exception as e:
            timetable.status = Timetable.Status.FAILED
            timetable.solver_log = str(e)
            timetable.save()
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['get'], url_path='by-class/(?P<class_id>[^/.]+)')
    def by_class(self, request, pk=None, class_id=None):
        timetable = self.get_object()
        entries = timetable.entries.filter(school_class_id=class_id).select_related(
            'subject', 'teacher', 'time_slot',
        )
        return Response(TimetableEntrySerializer(entries, many=True).data)

    @action(detail=True, methods=['get'], url_path='by-teacher/(?P<teacher_id>[^/.]+)')
    def by_teacher(self, request, pk=None, teacher_id=None):
        timetable = self.get_object()
        entries = timetable.entries.filter(teacher_id=teacher_id).select_related(
            'subject', 'school_class', 'time_slot',
        )
        return Response(TimetableEntrySerializer(entries, many=True).data)

    @action(detail=True, methods=['get'])
    def quality(self, request, pk=None):
        """Quality metrics for the generated timetable.

        Returns per-teacher and per-class window counts, plus aggregate
        scores. Powers the dashboard and teacher-view UI."""
        timetable = self.get_object()
        entries = list(
            timetable.entries.select_related(
                'teacher', 'school_class__grade', 'subject', 'time_slot',
            )
        )

        # Periods per (teacher | class) per day
        teacher_periods = defaultdict(lambda: defaultdict(set))
        class_periods = defaultdict(lambda: defaultdict(set))
        for e in entries:
            if e.teacher_id:
                teacher_periods[e.teacher_id][e.time_slot.day].add(e.time_slot.period)
            class_periods[e.school_class_id][e.time_slot.day].add(e.time_slot.period)

        def _window_stats(periods_by_day):
            total = 0
            per_day = defaultdict(int)
            for day, periods in periods_by_day.items():
                if not periods:
                    continue
                gap = (max(periods) - min(periods) + 1) - len(periods)
                total += gap
                per_day[day] = gap
            return total, dict(per_day)

        from apps.subjects.models import Teacher
        from apps.school.models import SchoolClass

        teacher_stats = []
        for tid, days in teacher_periods.items():
            total_windows, per_day = _window_stats(days)
            total_lessons = sum(len(p) for p in days.values())
            t = Teacher.objects.filter(id=tid).first()
            if not t:
                continue
            teacher_stats.append({
                'id': tid,
                'name': str(t),
                'first_name': t.first_name,
                'last_name': t.last_name,
                'lessons': total_lessons,
                'windows': total_windows,
                'windows_by_day': per_day,
                'days_taught': len([d for d in days if days[d]]),
                'has_day_off': t.day_off is not None,
                'day_off': t.day_off,
            })
        teacher_stats.sort(key=lambda x: -x['windows'])

        class_stats = []
        for cid, days in class_periods.items():
            total_windows, per_day = _window_stats(days)
            total_lessons = sum(len(p) for p in days.values())
            c = SchoolClass.objects.filter(id=cid).select_related('grade').first()
            if not c:
                continue
            # Earliest and latest period the class is active each day —
            # signals "long days" or "short days"
            day_spans = {}
            for day, periods in days.items():
                if periods:
                    day_spans[day] = {'first': min(periods), 'last': max(periods)}
            class_stats.append({
                'id': cid,
                'name': c.display_name,
                'grade': c.grade.name,
                'lessons': total_lessons,
                'windows': total_windows,
                'windows_by_day': per_day,
                'day_spans': day_spans,
            })
        class_stats.sort(key=lambda x: (-x['windows'], x['name']))

        # Subject usage by period — helps the principal see if math is
        # in the morning vs afternoon.
        subject_by_period = defaultdict(lambda: defaultdict(int))
        for e in entries:
            subject_by_period[e.subject.name_he][e.time_slot.period] += 1

        # Aggregate scores
        total_teacher_windows = sum(t['windows'] for t in teacher_stats)
        total_class_windows = sum(c['windows'] for c in class_stats)
        teachers_with_windows = sum(1 for t in teacher_stats if t['windows'] > 0)
        classes_with_windows = sum(1 for c in class_stats if c['windows'] > 0)

        # Late-period count: lessons in periods 9 or 10
        late_count = sum(1 for e in entries if e.time_slot.period >= 9)

        return Response({
            'timetable_id': timetable.id,
            'name': timetable.name,
            'status': timetable.status,
            'totals': {
                'entries': len(entries),
                'total_teacher_windows': total_teacher_windows,
                'total_class_windows': total_class_windows,
                'teachers_with_windows': teachers_with_windows,
                'classes_with_windows': classes_with_windows,
                'avg_teacher_windows': (
                    total_teacher_windows / len(teacher_stats) if teacher_stats else 0
                ),
                'late_period_lessons': late_count,
            },
            'teachers': teacher_stats,
            'classes': class_stats,
            'subject_by_period': {
                subject: dict(periods)
                for subject, periods in subject_by_period.items()
            },
        })
