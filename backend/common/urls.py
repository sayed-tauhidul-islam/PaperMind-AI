from django.urls import path
from . import account_views as views

urlpatterns = [
    path("csrf/", views.csrf_token), path("logout/", views.logout),
    path("usage/", views.usage),
    path("register/", views.register), path("login/", views.login),
    path("verify-email/", views.verify_email), path("verify-email/resend/", views.resend_verification),
    path("profile/", views.profile), path("password/", views.change_password),
    path("password-reset/", views.request_password_reset), path("password-reset/confirm/", views.reset_password),
    path("account/", views.delete_account),
]
