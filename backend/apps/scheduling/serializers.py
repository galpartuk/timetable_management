from rest_framework import serializers
from .models import Constraint, Timetable, TimetableEntry


class ConstraintSerializer(serializers.ModelSerializer):
    constraint_type_display = serializers.CharField(source='get_constraint_type_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)

    class Meta:
        model = Constraint
        fields = '__all__'


class TimetableEntrySerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name_he', read_only=True)
    subject_color = serializers.CharField(source='subject.color', read_only=True)
    teacher_name = serializers.CharField(source='teacher.__str__', read_only=True)
    class_name = serializers.CharField(source='school_class.display_name', read_only=True)
    day = serializers.IntegerField(source='time_slot.day', read_only=True)
    period = serializers.IntegerField(source='time_slot.period', read_only=True)

    class Meta:
        model = TimetableEntry
        fields = '__all__'


class TimetableSerializer(serializers.ModelSerializer):
    entries = TimetableEntrySerializer(many=True, read_only=True)
    entry_count = serializers.IntegerField(source='entries.count', read_only=True)

    class Meta:
        model = Timetable
        fields = '__all__'


class TimetableListSerializer(serializers.ModelSerializer):
    entry_count = serializers.IntegerField(source='entries.count', read_only=True)

    class Meta:
        model = Timetable
        fields = ['id', 'name', 'academic_year', 'status', 'created_at', 'updated_at', 'entry_count']
