from django.contrib import admin
from .models import ImportLog


@admin.register(ImportLog)
class ImportLogAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'status', 'uploaded_at', 'subjects_imported', 'teachers_imported']
    list_filter = ['status']
