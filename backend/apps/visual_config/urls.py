from django.urls import path

from apps.visual_config.views import (
    LogoNegocioAPIView,
    PlantillasDisponiblesAPIView,
)


urlpatterns = [
    path(
        "plantillas/",
        PlantillasDisponiblesAPIView.as_view(),
        name="plantillas-disponibles",
    ),
    path(
        "logo-negocio/",
        LogoNegocioAPIView.as_view(),
        name="logo-negocio",
    ),
]
