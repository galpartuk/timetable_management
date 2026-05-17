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
        # Per-teacher: subjects and classes they touch (for variety metrics)
        teacher_subjects = defaultdict(set)
        teacher_classes = defaultdict(set)
        for e in entries:
            if e.teacher_id:
                teacher_periods[e.teacher_id][e.time_slot.day].add(e.time_slot.period)
                teacher_subjects[e.teacher_id].add(e.subject_id)
                teacher_classes[e.teacher_id].add(e.school_class_id)
            class_periods[e.school_class_id][e.time_slot.day].add(e.time_slot.period)

        # "Long window" threshold — gaps this size or larger are flagged.
        # 4 periods at 45 min each ≈ 3 hours of sitting around, which is
        # what teachers actually complain about. Adjust if the school
        # uses a different period length.
        LONG_WINDOW_THRESHOLD = 4

        def _day_gap_breakdown(periods: set[int]) -> tuple[list[int], int, int]:
            """Given a teacher's periods on one day, return:
              - list of gap sizes (one entry per discrete gap; e.g.,
                periods {1, 4, 8} → [2, 3] meaning 2-period gap then 3-period gap)
              - max single gap size (0 if none)
              - sum of all gap sizes (== windows count for the day)
            """
            if not periods:
                return [], 0, 0
            sorted_p = sorted(periods)
            gaps = []
            for prev, cur in zip(sorted_p, sorted_p[1:]):
                if cur - prev > 1:
                    gaps.append(cur - prev - 1)
            return gaps, (max(gaps) if gaps else 0), sum(gaps)

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

        from apps.subjects.models import Teacher, Subject, TeacherRole
        from apps.school.models import SchoolClass

        # Pre-fetch role hours per teacher (from תפקידים sheet).
        role_hours_by_teacher: dict[int, float] = defaultdict(float)
        for role in TeacherRole.objects.filter(school=timetable.school).select_related('teacher'):
            if role.teacher_id:
                role_hours_by_teacher[role.teacher_id] += float(role.weekly_hours or 0)

        # Pre-fetch all teachers and subjects in one query for speed.
        teachers_by_id = {t.id: t for t in Teacher.objects.filter(school=timetable.school)}
        subjects_by_id = {s.id: s.name_he for s in Subject.objects.filter(school=timetable.school)}

        teacher_stats = []
        for tid, days in teacher_periods.items():
            total_windows, per_day = _window_stats(days)
            total_lessons = sum(len(p) for p in days.values())
            t = teachers_by_id.get(tid)
            if not t:
                continue

            # Per-day rich breakdown
            day_details = {}
            long_window_count = 0
            max_single_gap = 0
            longest_teaching_day = 0
            days_with_long_gap = 0
            first_periods = []
            last_periods = []
            late_lessons = 0  # lessons after period 8
            for day, periods in days.items():
                if not periods:
                    continue
                gaps, max_gap, sum_gaps = _day_gap_breakdown(periods)
                day_long = sum(1 for g in gaps if g >= LONG_WINDOW_THRESHOLD)
                long_window_count += day_long
                if day_long > 0:
                    days_with_long_gap += 1
                max_single_gap = max(max_single_gap, max_gap)
                span = max(periods) - min(periods) + 1
                longest_teaching_day = max(longest_teaching_day, span)
                first_periods.append(min(periods))
                last_periods.append(max(periods))
                late_lessons += sum(1 for p in periods if p >= 9)
                day_details[day] = {
                    'lessons': len(periods),
                    'first': min(periods),
                    'last': max(periods),
                    'span': span,
                    'windows': sum_gaps,
                    'max_gap': max_gap,
                    'long_window_count': day_long,
                }

            teacher_stats.append({
                'id': tid,
                'name': str(t),
                'first_name': t.first_name,
                'last_name': t.last_name,
                'lessons': total_lessons,
                'windows': total_windows,
                'long_windows': long_window_count,
                'max_single_gap': max_single_gap,
                'days_taught': len([d for d in days if days[d]]),
                'days_with_windows': sum(1 for v in per_day.values() if v > 0),
                'days_with_long_gap': days_with_long_gap,
                'longest_teaching_day': longest_teaching_day,
                'avg_daily_lessons': (
                    round(total_lessons / max(1, len(days)), 1) if days else 0
                ),
                'max_daily_lessons': max(
                    (len(p) for p in days.values()), default=0,
                ),
                'first_period_count': sum(1 for p in first_periods if p == 1),
                'late_period_lessons': late_lessons,
                'distinct_subjects': len(teacher_subjects.get(tid, set())),
                'distinct_classes': len(teacher_classes.get(tid, set())),
                'role_hours': round(role_hours_by_teacher.get(tid, 0), 1),
                'has_day_off': t.day_off is not None,
                'day_off': t.day_off,
                'windows_by_day': per_day,
                'day_details': day_details,
                'subjects': sorted({
                    subjects_by_id.get(sid, '?')
                    for sid in teacher_subjects.get(tid, set())
                }),
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
        total_long_windows = sum(t['long_windows'] for t in teacher_stats)
        total_class_windows = sum(c['windows'] for c in class_stats)
        teachers_with_windows = sum(1 for t in teacher_stats if t['windows'] > 0)
        teachers_with_long_windows = sum(1 for t in teacher_stats if t['long_windows'] > 0)
        classes_with_windows = sum(1 for c in class_stats if c['windows'] > 0)
        # Late-period count: lessons in periods 9 or 10
        late_count = sum(1 for e in entries if e.time_slot.period >= 9)

        return Response({
            'timetable_id': timetable.id,
            'name': timetable.name,
            'status': timetable.status,
            'long_window_threshold': LONG_WINDOW_THRESHOLD,
            'totals': {
                'entries': len(entries),
                'total_teacher_windows': total_teacher_windows,
                'total_long_windows': total_long_windows,
                'total_class_windows': total_class_windows,
                'teachers_with_windows': teachers_with_windows,
                'teachers_with_long_windows': teachers_with_long_windows,
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
