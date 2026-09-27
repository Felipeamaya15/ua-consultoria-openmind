from django.urls import path

from apps.visual_config.views import (
    PlantillaSeleccionadaAPIView,
    PlantillasDisponiblesAPIView,
)


urlpatterns = [
    path(
        "plantillas/",
        PlantillasDisponiblesAPIView.as_view(),
        name="plantillas-disponibles",
    ),
    path(
        "plantilla-seleccionada/",
        PlantillaSeleccionadaAPIView.as_view(),
        name="plantilla-seleccionada",
    ),
]
