from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'subjects', views.SubjectViewSet)
router.register(r'teachers', views.TeacherViewSet)
router.register(r'teacher-tags', views.TeacherTagViewSet)
router.register(r'assignments', views.TeachingAssignmentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
