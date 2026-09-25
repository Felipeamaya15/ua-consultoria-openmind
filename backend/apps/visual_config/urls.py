from django.urls import path

from apps.visual_config.views import PlantillasDisponiblesAPIView


urlpatterns = [
    path(
        "plantillas/",
        PlantillasDisponiblesAPIView.as_view(),
        name="plantillas-disponibles",
    ),
]