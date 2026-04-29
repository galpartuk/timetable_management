from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'constraints', views.ConstraintViewSet)
router.register(r'timetables', views.TimetableViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
