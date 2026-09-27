from django.urls import path

from apps.landing.views import ConfiguracionLandingAPIView


urlpatterns = [
    path(
        "configuracion/",
        ConfiguracionLandingAPIView.as_view(),
        name="configuracion-landing",
    ),
]
