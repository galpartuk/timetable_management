from django.contrib import admin
from .models import School, Grade, SchoolClass, TimeSlot, Room


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['name', 'days_per_week', 'periods_per_day']


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ['name', 'level', 'school']
    list_filter = ['school']


@admin.register(SchoolClass)
class SchoolClassAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'class_type', 'student_count']
    list_filter = ['grade__school', 'class_type', 'grade']


@admin.register(TimeSlot)
class TimeSlotAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'start_time', 'end_time']
    list_filter = ['day']


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['name', 'capacity', 'room_type']
