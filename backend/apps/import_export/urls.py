from django.urls import path
from . import views

urlpatterns = [
    path('import/upload/', views.upload_excel, name='upload-excel'),
    path('import/days-off/', views.upload_days_off, name='upload-days-off'),
    path('import/logs/', views.import_logs, name='import-logs'),
]
