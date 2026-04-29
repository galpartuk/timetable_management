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
