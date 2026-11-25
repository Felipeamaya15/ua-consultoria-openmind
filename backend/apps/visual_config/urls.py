from apps.visual_config.palettes import PalettesAPIView, AppearanceAPIView
from django.urls import path

from apps.visual_config.views import (
    LogoNegocioAPIView,
    PlantillaSeleccionadaAPIView,
    PlantillasDisponiblesAPIView,
)


urlpatterns = [
    path("paletas/", PalettesAPIView.as_view()),
    path("paletas/<uuid:palette_id>/", PalettesAPIView.as_view()),
    path("apariencia/", AppearanceAPIView.as_view()),
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

    path(
        "plantilla-seleccionada/",
        PlantillaSeleccionadaAPIView.as_view(),
        name="plantilla-seleccionada",
    ),
]