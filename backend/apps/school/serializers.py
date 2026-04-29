from rest_framework import serializers
from .models import School, Grade, SchoolClass, TimeSlot, Room


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = '__all__'


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = '__all__'


class SchoolClassSerializer(serializers.ModelSerializer):
    display_name = serializers.ReadOnlyField()
    grade_name = serializers.CharField(source='grade.name', read_only=True)

    class Meta:
        model = SchoolClass
        fields = '__all__'


class TimeSlotSerializer(serializers.ModelSerializer):
    day_display = serializers.CharField(source='get_day_display', read_only=True)

    class Meta:
        model = TimeSlot
        fields = '__all__'


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = '__all__'
