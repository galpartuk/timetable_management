from collections import defaultdict

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Constraint, Timetable, TimetableEntry
from .serializers import (
    ConstraintSerializer, TimetableSerializer,
    TimetableListSerializer, TimetableEntrySerializer,
)
from .tasks import is_generating, start_generation


class ConstraintViewSet(viewsets.ModelViewSet):
    queryset = Constraint.objects.all()
    serializer_class = ConstraintSerializer
    filterset_fields = ['school', 'constraint_type', 'priority', 'is_active']

    def perform_destroy(self, instance):
        # When the user deletes a row that's a mirror of Teacher.day_off, also
        # clear the underlying field — otherwise the auto-sync code would just
        # recreate the row on the next set_teacher_day_off call, and the
        # solver would still respect the legacy day_off attribute. Keeps the
        # two storage locations consistent.
        params = instance.parameters if isinstance(instance.parameters, dict) else {}
        if params.get('auto_day_off') and instance.teacher_id:
            instance.teacher.day_off = None
            instance.teacher.save(update_fields=['day_off'])
        instance.delete()


class TimetableViewSet(viewsets.ModelViewSet):
    queryset = Timetable.objects.all()
    filterset_fields = ['school', 'status']

    def get_serializer_class(self):
        if self.action == 'list':
            return TimetableListSerializer
        return TimetableSerializer

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """Kick off a build for this timetable in a background thread.

        Returns ``202 Accepted`` immediately with the row already
        flipped to ``generating``. The CP-SAT solver routinely runs
        for minutes; reverse proxies (Caddy/nginx/Cloudflare) close
        idle upstream connections after 60-120s and the client used
        to see ``Unexpected end of JSON input``.

        The client should poll ``GET /api/timetables/{id}/`` until
        ``status`` is no longer ``generating`` (it becomes
        ``completed`` or ``failed``).

        Query string: ``?max_time_seconds=N`` caps the solver. Clamped
        to [5, 1800].
        """
        timetable = self.get_object()

        try:
            cap = int(request.query_params.get('max_time_seconds', '300'))
        except (TypeError, ValueError):
            cap = 300
        cap = max(5, min(cap, 1800))

        if is_generating(timetable.id):
            return Response(
                {
                    'status': 'generating',
                    'detail': 'בנייה אוטומטית כבר רצה למערכת הזו.',
                    'timetable': TimetableSerializer(timetable).data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        started = start_generation(timetable, max_time_seconds=cap)
        if not started:
            # Lost the race with another request — same outcome as above.
            return Response(
                {
                    'status': 'generating',
                    'detail': 'בנייה אוטומטית כבר רצה למערכת הזו.',
                    'timetable': TimetableSerializer(timetable).data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        timetable.refresh_from_db()
        return Response(
            {
                'status': 'generating',
                'detail': (
                    'בנייה אוטומטית התחילה ברקע. עקבו אחרי GET '
                    '/api/timetables/{id}/ עד שהסטטוס יתעדכן.'
                ),
                'poll_url': f'/api/timetables/{timetable.id}/',
                'timetable': TimetableSerializer(timetable).data,
                'max_time_seconds': cap,
            },
            status=status.HTTP_202_ACCEPTED,
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

    @action(detail=False, methods=['get'])
    def compare(self, request):
        """Compare quality metrics for several timetables side-by-side.

        Query: ?ids=1,2,3
        Returns: list of {id, name, status, totals, top5_window_teachers}
        """
        ids_raw = request.query_params.get('ids', '')
        ids = [int(x) for x in ids_raw.split(',') if x.strip().isdigit()]
        if not ids:
            return Response({'error': 'pass ?ids=1,2,…'}, status=status.HTTP_400_BAD_REQUEST)

        from collections import defaultdict
        results = []
        for tid in ids:
            tt = Timetable.objects.filter(id=tid).first()
            if not tt:
                continue
            entries = list(tt.entries.select_related('teacher', 'time_slot', 'school_class__grade'))
            t_periods = defaultdict(lambda: defaultdict(set))
            c_periods = defaultdict(lambda: defaultdict(set))
            for e in entries:
                if e.teacher_id:
                    t_periods[e.teacher_id][e.time_slot.day].add(e.time_slot.period)
                c_periods[e.school_class_id][e.time_slot.day].add(e.time_slot.period)
            t_windows = 0
            t_long = 0
            for days in t_periods.values():
                for periods in days.values():
                    if not periods:
                        continue
                    t_windows += max(periods) - min(periods) + 1 - len(periods)
                    sorted_p = sorted(periods)
                    gaps = [b - a - 1 for a, b in zip(sorted_p, sorted_p[1:]) if b - a > 1]
                    t_long += sum(1 for g in gaps if g >= 4)
            c_windows = 0
            for days in c_periods.values():
                for periods in days.values():
                    if periods:
                        c_windows += max(periods) - min(periods) + 1 - len(periods)
            late = sum(1 for e in entries if e.time_slot.period >= 9)
            results.append({
                'id': tt.id,
                'name': tt.name,
                'status': tt.status,
                'academic_year': tt.academic_year,
                'created_at': tt.created_at,
                'entries': len(entries),
                'teacher_windows': t_windows,
                'long_windows': t_long,
                'class_windows': c_windows,
                'late_period_lessons': late,
                'solver_log': tt.solver_log[:600] if tt.solver_log else '',
            })
        return Response({'comparisons': results})

    @action(detail=True, methods=['post'], url_path='move-entry')
    def move_entry(self, request, pk=None):
        """Move a TimetableEntry to a new time_slot.

        Body: {entry_id, new_day, new_period}
        Validates no conflicts (no teacher/class clash at the target slot).
        On conflict returns 409 with the conflicting entry's details.
        """
        timetable = self.get_object()
        entry_id = request.data.get('entry_id')
        new_day = request.data.get('new_day')
        new_period = request.data.get('new_period')
        if entry_id is None or new_day is None or new_period is None:
            return Response(
                {'error': 'pass entry_id, new_day, new_period'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entry = TimetableEntry.objects.filter(id=entry_id, timetable=timetable).first()
        if not entry:
            return Response({'error': 'entry not found'}, status=status.HTTP_404_NOT_FOUND)
        from apps.school.models import TimeSlot
        new_slot = TimeSlot.objects.filter(
            school=timetable.school, day=new_day, period=new_period,
        ).first()
        if not new_slot:
            return Response({'error': 'no such time slot'}, status=status.HTTP_400_BAD_REQUEST)

        # Conflict check: is the same teacher OR same class already booked
        # at the target slot in this timetable?
        teacher_conflict = TimetableEntry.objects.filter(
            timetable=timetable, time_slot=new_slot, teacher=entry.teacher,
        ).exclude(id=entry.id).first()
        if teacher_conflict:
            return Response({
                'error': f'מורה {entry.teacher} כבר משובץ בשעה זו (כיתה {teacher_conflict.school_class.display_name})',
                'conflict_entry_id': teacher_conflict.id,
            }, status=status.HTTP_409_CONFLICT)
        class_conflict = TimetableEntry.objects.filter(
            timetable=timetable, time_slot=new_slot, school_class=entry.school_class,
        ).exclude(id=entry.id).first()
        if class_conflict and class_conflict.teacher_id != entry.teacher_id:
            # Different teacher means a real conflict (parallel-track entries
            # for the same class are fine, but only when the same teacher
            # group is involved).
            return Response({
                'error': f'כיתה {entry.school_class.display_name} כבר משובצת בשעה זו ({class_conflict.subject.name_he})',
                'conflict_entry_id': class_conflict.id,
            }, status=status.HTTP_409_CONFLICT)

        entry.time_slot = new_slot
        entry.save(update_fields=['time_slot'])
        return Response(TimetableEntrySerializer(entry).data)

    @action(detail=True, methods=['post'], url_path='swap-entries')
    def swap_entries(self, request, pk=None):
        """Swap the time_slots of two entries."""
        timetable = self.get_object()
        a = request.data.get('entry_a')
        b = request.data.get('entry_b')
        if a is None or b is None:
            return Response({'error': 'pass entry_a and entry_b'}, status=status.HTTP_400_BAD_REQUEST)
        ea = TimetableEntry.objects.filter(id=a, timetable=timetable).first()
        eb = TimetableEntry.objects.filter(id=b, timetable=timetable).first()
        if not ea or not eb:
            return Response({'error': 'entry not found'}, status=status.HTTP_404_NOT_FOUND)
        ea.time_slot, eb.time_slot = eb.time_slot, ea.time_slot
        ea.save(update_fields=['time_slot'])
        eb.save(update_fields=['time_slot'])
        return Response({
            'a': TimetableEntrySerializer(ea).data,
            'b': TimetableEntrySerializer(eb).data,
        })

    @action(detail=True, methods=['post'], url_path='toggle-lock')
    def toggle_lock(self, request, pk=None):
        """Toggle the locked flag on a TimetableEntry — pinned entries
        stay put when the solver runs again."""
        timetable = self.get_object()
        entry_id = request.data.get('entry_id')
        entry = TimetableEntry.objects.filter(id=entry_id, timetable=timetable).first()
        if not entry:
            return Response({'error': 'entry not found'}, status=status.HTTP_404_NOT_FOUND)
        entry.locked = not entry.locked
        entry.save(update_fields=['locked'])
        return Response({'id': entry.id, 'locked': entry.locked})

    @action(detail=True, methods=['get'])
    def quality(self, request, pk=None):
        """Quality metrics for the generated timetable.

        Returns per-teacher and per-class window counts, plus aggregate
        scores. Powers the dashboard and teacher-view UI."""
        timetable = self.get_object()
        # While the solver is running, entries are being deleted and rewritten
        # — there's nothing meaningful to measure. Return an empty quality
        # payload immediately so the FE doesn't pay for a full scan + Python
        # aggregation against a moving target.
        if timetable.status == Timetable.Status.GENERATING:
            return Response({
                'timetable_id': timetable.id,
                'name': timetable.name,
                'status': timetable.status,
                'totals': {
                    'entries': 0,
                    'total_teacher_windows': 0,
                    'total_long_windows': 0,
                    'total_class_windows': 0,
                    'teachers_with_windows': 0,
                    'teachers_with_long_windows': 0,
                    'classes_with_windows': 0,
                    'avg_teacher_windows': 0,
                    'late_period_lessons': 0,
                },
                'teachers': [],
                'classes': [],
                'subject_by_period': {},
                'generating': True,
            })
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
        # Default 4 periods (≈ 3 hours), which is what teachers actually
        # complain about: a gap that big means going home and coming back.
        # Caller can override via ?long_threshold=N.
        try:
            LONG_WINDOW_THRESHOLD = max(2, int(request.query_params.get('long_threshold', '4')))
        except (TypeError, ValueError):
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

        # Pre-fetch role hours per teacher (from תפקידים sheet) plus the
        # stipend fraction (גמול תפקיד) — both useful for the contract view.
        role_hours_by_teacher: dict[int, float] = defaultdict(float)
        stipend_by_teacher: dict[int, float] = defaultdict(float)
        for role in TeacherRole.objects.filter(school=timetable.school).select_related('teacher'):
            if role.teacher_id:
                role_hours_by_teacher[role.teacher_id] += float(role.weekly_hours or 0)
                stipend_by_teacher[role.teacher_id] += float(role.stipend_fraction or 0)

        # Pre-fetch bagrut-bonus hours per teacher — these are hours that
        # count toward the contract above the actual lesson-hour count.
        from apps.subjects.models import TeachingAssignment
        bagrut_hours_by_teacher: dict[int, float] = defaultdict(float)
        active_assignments_by_teacher: dict[int, list] = defaultdict(list)
        for a in TeachingAssignment.objects.filter(
            subject__school=timetable.school, is_active=True, teacher__isnull=False,
        ).select_related('teacher'):
            bagrut_hours_by_teacher[a.teacher_id] += float(a.bagrut_bonus_hours or 0)
            active_assignments_by_teacher[a.teacher_id].append(a)

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

            bagrut_h = round(bagrut_hours_by_teacher.get(tid, 0), 1)
            role_h = round(role_hours_by_teacher.get(tid, 0), 1)
            total_contract = total_lessons + bagrut_h + role_h
            cap = t.max_weekly_hours or 0
            utilization = (
                round(total_contract / cap * 100, 0) if cap > 0 else 0
            )
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
                'bagrut_hours': bagrut_h,
                'role_hours': role_h,
                'stipend_fraction': round(stipend_by_teacher.get(tid, 0), 2),
                'total_contract_hours': round(total_contract, 1),
                'cap': cap,
                'utilization_pct': utilization,
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
