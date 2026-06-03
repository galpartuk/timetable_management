from rest_framework import serializers
from .models import Subject, Teacher, TeacherTag, TeachingAssignment


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = '__all__'


class TeacherTagSerializer(serializers.ModelSerializer):
    teacher_count = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source='subject.name_he', read_only=True, default=None)

    class Meta:
        model = TeacherTag
        fields = ['id', 'school', 'name', 'color', 'kind', 'subject', 'subject_name', 'teacher_count']

    def get_teacher_count(self, obj):
        return obj.teachers.count()


class TeacherSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    # Exposed alongside `tags` (the M2M id list) so the UI can render
    # chip labels without a second fetch.
    tag_names = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = '__all__'

    def get_full_name(self, obj):
        return str(obj)

    def get_tag_names(self, obj):
        return [t.name for t in obj.tags.all()]


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.__str__', read_only=True)
    subject_name = serializers.CharField(source='subject.name_he', read_only=True)
    class_name = serializers.CharField(source='school_class.display_name', read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = '__all__'
