from rest_framework import viewsets
from .models import School, Grade, SchoolClass, TimeSlot, Room
from .serializers import (
    SchoolSerializer, GradeSerializer, SchoolClassSerializer,
    TimeSlotSerializer, RoomSerializer,
)


class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    filterset_fields = ['school']


class SchoolClassViewSet(viewsets.ModelViewSet):
    queryset = SchoolClass.objects.select_related('grade').all()
    serializer_class = SchoolClassSerializer
    filterset_fields = ['grade', 'grade__school', 'class_type']
    search_fields = ['grade__name']


class TimeSlotViewSet(viewsets.ModelViewSet):
    queryset = TimeSlot.objects.all()
    serializer_class = TimeSlotSerializer
    filterset_fields = ['school', 'day']


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    filterset_fields = ['school']
