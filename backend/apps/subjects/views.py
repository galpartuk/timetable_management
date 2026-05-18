from rest_framework import viewsets
from .models import Subject, Teacher, TeacherTag, TeachingAssignment
from .serializers import (
    SubjectSerializer, TeacherSerializer, TeacherTagSerializer,
    TeachingAssignmentSerializer,
)


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


class TeacherTagViewSet(viewsets.ModelViewSet):
    queryset = TeacherTag.objects.all()
    serializer_class = TeacherTagSerializer
    filterset_fields = ['school']
    search_fields = ['name']


class TeachingAssignmentViewSet(viewsets.ModelViewSet):
    queryset = TeachingAssignment.objects.select_related('subject', 'teacher', 'school_class').all()
    serializer_class = TeachingAssignmentSerializer
    filterset_fields = ['subject', 'teacher', 'school_class', 'subject__school']
