from rest_framework import viewsets
from .models import Subject, Teacher, TeachingAssignment
from .serializers import SubjectSerializer, TeacherSerializer, TeachingAssignmentSerializer


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    filterset_fields = ['school']
    search_fields = ['name_he', 'name_en']


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.all()
    serializer_class = TeacherSerializer
    filterset_fields = ['school']
    search_fields = ['first_name', 'last_name']


class TeachingAssignmentViewSet(viewsets.ModelViewSet):
    queryset = TeachingAssignment.objects.select_related('subject', 'teacher', 'school_class').all()
    serializer_class = TeachingAssignmentSerializer
    filterset_fields = ['subject', 'teacher', 'school_class', 'subject__school']
