from rest_framework import serializers
from .models import Constraint, Timetable, TimetableEntry, TimetableSnapshot


class ConstraintSerializer(serializers.ModelSerializer):
    constraint_type_display = serializers.CharField(source='get_constraint_type_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    # True when this constraint was auto-created by set_teacher_day_off (a
    # teacher_availability row blocking every period of a chosen day). The
    # Constraints page renders these with an "auto" badge and a hint that
    # editing the Teacher.day_off field is the canonical way to change them.
    auto_day_off = serializers.SerializerMethodField()

    class Meta:
        model = Constraint
        fields = '__all__'

    def get_auto_day_off(self, obj) -> bool:
        params = obj.parameters if isinstance(obj.parameters, dict) else {}
        return bool(params.get('auto_day_off'))


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
    # Heavy: nested serialization of every TimetableEntry with subject/teacher/
    # class joins. Returned for completed timetables; omitted while the row is
    # 'generating' because (a) the solver clears entries before writing, so the
    # list is empty or partial anyway, and (b) the poll loop only needs status
    # + progress, not the full grid. Skipping the nested fetch is what keeps
    # F5-during-build from blocking the UI for 2 minutes.
    entries = serializers.SerializerMethodField()
    entry_count = serializers.IntegerField(source='entries.count', read_only=True)

    class Meta:
        model = Timetable
        fields = '__all__'

    def get_entries(self, obj):
        if obj.status == Timetable.Status.GENERATING:
            return []
        return TimetableEntrySerializer(obj.entries.all(), many=True).data


class TimetableListSerializer(serializers.ModelSerializer):
    entry_count = serializers.IntegerField(source='entries.count', read_only=True)

    class Meta:
        model = Timetable
        fields = ['id', 'name', 'academic_year', 'status', 'created_at', 'updated_at', 'entry_count']


class TimetableSnapshotListSerializer(serializers.ModelSerializer):
    """Lean payload for the history list — omits the full entries blob."""
    triggered_by_display = serializers.CharField(source='get_triggered_by_display', read_only=True)
    entry_count = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = TimetableSnapshot
        fields = [
            'id', 'created_at', 'triggered_by', 'triggered_by_display',
            'description', 'entry_count', 'actor_name',
        ]

    def get_entry_count(self, obj) -> int:
        data = obj.entries_data
        return len(data) if isinstance(data, list) else 0

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        return (obj.actor.get_full_name() or obj.actor.username or '').strip() or None


class TimetableSnapshotSerializer(TimetableSnapshotListSerializer):
    """Full payload (includes the entries blob) — used when restoring."""

    class Meta(TimetableSnapshotListSerializer.Meta):
        fields = TimetableSnapshotListSerializer.Meta.fields + ['entries_data']
