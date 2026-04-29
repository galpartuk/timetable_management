from django.contrib import admin
from .models import Constraint, Timetable, TimetableEntry


@admin.register(Constraint)
class ConstraintAdmin(admin.ModelAdmin):
    list_display = ['name', 'constraint_type', 'priority', 'is_active']
    list_filter = ['constraint_type', 'priority', 'is_active']


@admin.register(Timetable)
class TimetableAdmin(admin.ModelAdmin):
    list_display = ['name', 'academic_year', 'status', 'created_at']
    list_filter = ['status']


@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = ['timetable', 'school_class', 'subject', 'teacher', 'time_slot']
    list_filter = ['timetable', 'subject']
