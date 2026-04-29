from django.urls import path

from . import views

urlpatterns = [
    path('chat/', views.chat_view, name='ai-chat'),
    path('execute_tool/', views.execute_tool_view, name='ai-execute-tool'),
    path('tools/', views.list_tools_view, name='ai-list-tools'),
]
