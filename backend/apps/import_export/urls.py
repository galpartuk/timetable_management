from django.urls import path
from . import views

urlpatterns = [
    path('import/upload/', views.upload_excel, name='upload-excel'),
    path('import/days-off/', views.upload_days_off, name='upload-days-off'),
    path('import/logs/', views.import_logs, name='import-logs'),
    # Export
    path('export/options/', views.list_export_options, name='export-options'),
    path('export/excel/', views.export_excel, name='export-excel'),
    # Bulk delete
    path('manage/timetable/<int:timetable_id>/', views.delete_timetable, name='delete-timetable'),
    path('manage/timetable/<int:timetable_id>/clear/', views.clear_timetable_entries, name='clear-timetable-entries'),
    path('manage/bulk-delete/', views.bulk_delete, name='bulk-delete'),
]
