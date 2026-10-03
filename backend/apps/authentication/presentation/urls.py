from .profile import ProfileAPIView, PasswordAPIView, EntrepreneurProfileAPIView, EntrepreneurPasswordAPIView
from django.urls import path
from .views import (
    RegisterAPIView,
    LoginAPIView,
    MeAPIView,
    GoogleLoginAPIView,
    ConfiguracionAutenticacionAPIView,
    ConfiguracionPagosAPIView,
)

urlpatterns = [
    path('emprendedor/perfil/', EntrepreneurProfileAPIView.as_view(), name='api_entrepreneur_profile'),
    path('emprendedor/perfil/password/', EntrepreneurPasswordAPIView.as_view(), name='api_entrepreneur_password'),
    path('perfil/', ProfileAPIView.as_view(), name='api_profile'),
    path('perfil/password/', PasswordAPIView.as_view(), name='api_profile_password'),
    path('register/', RegisterAPIView.as_view(), name='api_register'),
    path('login/', LoginAPIView.as_view(), name='api_login'),
    path('google/', GoogleLoginAPIView.as_view(), name='api_google_login'),
    path('me/', MeAPIView.as_view(), name='api_me'),
    path(
        'configuracion/',
        ConfiguracionAutenticacionAPIView.as_view(),
        name='api_configuracion_autenticacion',
    ),
    path(
        'configuracion-pagos/',
        ConfiguracionPagosAPIView.as_view(),
        name='api_configuracion_pagos',
    ),
]
