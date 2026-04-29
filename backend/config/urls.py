from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('apps.school.urls')),
    path('api/', include('apps.subjects.urls')),
    path('api/', include('apps.scheduling.urls')),
    path('api/', include('apps.import_export.urls')),
    path('api/auth/', include('apps.users.urls')),
]
