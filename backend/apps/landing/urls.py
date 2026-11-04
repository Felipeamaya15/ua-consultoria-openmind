from django.urls import path

from apps.landing.views import ConfiguracionLandingAPIView, AparienciaBloquesAPIView, RedesSocialesAPIView


urlpatterns = [
    path('redes-sociales/', RedesSocialesAPIView.as_view(), name='redes-sociales'),
    path('apariencia/', AparienciaBloquesAPIView.as_view(), name='apariencia-bloques'),
    path(
        "configuracion/",
        ConfiguracionLandingAPIView.as_view(),
        name="configuracion-landing",
    ),
]
