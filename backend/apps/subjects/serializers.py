from rest_framework import serializers
from .models import Subject, Teacher, TeachingAssignment


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = '__all__'


class TeacherSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = '__all__'

    def get_full_name(self, obj):
        return str(obj)


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.__str__', read_only=True)
    subject_name = serializers.CharField(source='subject.name_he', read_only=True)
    class_name = serializers.CharField(source='school_class.display_name', read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = '__all__'
