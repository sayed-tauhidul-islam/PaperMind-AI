from django.urls import path
from . import account_views as views

urlpatterns = [
    path("usage/", views.usage),
    path("register/", views.register), path("login/", views.login),
    path("profile/", views.profile), path("password/", views.change_password),
    path("password-reset/", views.request_password_reset), path("password-reset/confirm/", views.reset_password),
    path("account/", views.delete_account),
]
