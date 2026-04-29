from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'schools', views.SchoolViewSet)
router.register(r'grades', views.GradeViewSet)
router.register(r'classes', views.SchoolClassViewSet)
router.register(r'timeslots', views.TimeSlotViewSet)
router.register(r'rooms', views.RoomViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
