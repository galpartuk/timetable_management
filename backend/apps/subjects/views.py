from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Subject, Teacher, TeacherTag, TeachingAssignment
from .serializers import (
    SubjectSerializer, TeacherSerializer, TeacherTagSerializer,
    TeachingAssignmentSerializer,
)


# Valid Teacher.day_off values (1=Sunday … 5=Thursday). None clears the day off.
_VALID_DAY_OFF = {c[0] for c in Teacher.Day.choices}


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    filterset_fields = ['school']
    search_fields = ['name_he', 'name_en']


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.prefetch_related('tags').all()
    serializer_class = TeacherSerializer
    filterset_fields = ['school', 'tags']
    search_fields = ['first_name', 'last_name']

    @action(detail=False, methods=['post'], url_path='bulk-day-off')
    def bulk_day_off(self, request):
        """Set (or clear) ``day_off`` for many teachers at once.

        Body: ``{"day_off": int|null}`` plus a target — either
        ``{"tag_id": int}`` (all teachers in that tag) or
        ``{"teacher_ids": [int, ...]}``.
        """
        day_off = request.data.get('day_off', 'missing')
        if day_off == 'missing':
            return Response({'error': 'נדרש שדה day_off'}, status=status.HTTP_400_BAD_REQUEST)
        if day_off is not None and day_off not in _VALID_DAY_OFF:
            return Response(
                {'error': f'יום חופש לא תקין: {day_off}'}, status=status.HTTP_400_BAD_REQUEST,
            )

        tag_id = request.data.get('tag_id')
        teacher_ids = request.data.get('teacher_ids')
        if tag_id:
            # Resolve to a distinct id list first — updating across an M2M join
            # directly is unreliable and can double-count.
            ids = list(
                Teacher.objects.filter(tags__id=tag_id)
                .values_list('id', flat=True).distinct()
            )
        elif teacher_ids:
            ids = teacher_ids
        else:
            return Response(
                {'error': 'נדרש tag_id או teacher_ids'}, status=status.HTTP_400_BAD_REQUEST,
            )

        updated = Teacher.objects.filter(id__in=ids).update(day_off=day_off)
        return Response({'updated': updated, 'day_off': day_off})


class TeacherTagViewSet(viewsets.ModelViewSet):
    queryset = TeacherTag.objects.all()
    serializer_class = TeacherTagSerializer
    filterset_fields = ['school', 'kind', 'subject']
    search_fields = ['name']

    @action(detail=True, methods=['post'], url_path='set-members')
    def set_members(self, request, pk=None):
        """Replace this tag's member set. Body: ``{"teacher_ids": [int, ...]}``.

        Only touches this tag's membership — other tags on each teacher are
        left as-is.
        """
        tag = self.get_object()
        teacher_ids = request.data.get('teacher_ids')
        if teacher_ids is None:
            return Response({'error': 'נדרש teacher_ids'}, status=status.HTTP_400_BAD_REQUEST)
        members = Teacher.objects.filter(id__in=teacher_ids, school=tag.school)
        tag.teachers.set(members)
        return Response({'tag_id': tag.id, 'member_count': tag.teachers.count()})


class TeachingAssignmentViewSet(viewsets.ModelViewSet):
    queryset = TeachingAssignment.objects.select_related('subject', 'teacher', 'school_class').all()
    serializer_class = TeachingAssignmentSerializer
    filterset_fields = ['subject', 'teacher', 'school_class', 'subject__school']
