from django.contrib import admin
from .models import Subject, Teacher, TeachingAssignment


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['name_he', 'name_en', 'color']
    search_fields = ['name_he', 'name_en']


@admin.register(Teacher)
class TeacherAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'email', 'phone', 'max_weekly_hours']
    search_fields = ['first_name', 'last_name']


@admin.register(TeachingAssignment)
class TeachingAssignmentAdmin(admin.ModelAdmin):
    list_display = ['teacher', 'subject', 'school_class', 'weekly_hours']
    list_filter = ['subject', 'teacher']
    search_fields = ['teacher__first_name', 'teacher__last_name', 'subject__name_he']
