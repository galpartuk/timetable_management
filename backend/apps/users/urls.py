from django.urls import path

from . import views

urlpatterns = [
    # Public auth
    path('login/', views.login_view, name='login'),
    path('google/', views.google_login_view, name='google-login'),
    path('request-otp/', views.request_otp_view, name='request-otp'),
    path('verify-otp/', views.verify_otp_view, name='verify-otp'),
    # Press-1 DTMF flow: Asterisk hits the callback when the user
    # presses 1; the frontend polls /otp-status/ for the result.
    path('otp-dtmf-callback/<str:token>/', views.otp_dtmf_callback_view, name='otp-dtmf-callback'),
    path('otp-status/', views.otp_status_view, name='otp-status'),
    path('logout/', views.logout_view, name='logout'),
    path('me/', views.me_view, name='me'),

    # Super-admin
    path('admin/users/', views.admin_users_view, name='admin-users'),
    path('admin/users/<int:user_id>/', views.admin_user_detail_view, name='admin-user-detail'),
    path('admin/audit/logins/', views.admin_audit_logins_view, name='admin-audit-logins'),
    path('admin/audit/activities/', views.admin_audit_activities_view, name='admin-audit-activities'),
]
