from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.presentation.responses import success_response
from apps.visual_config.serializers import PlantillaDisponibleSerializer


PLANTILLAS_DISPONIBLES = [
    {
        "id": "editorial",
        "name": "Plantilla 01 — Studio Pop",
        "description": (
            "Tienda luminosa y modular con escaparate visual, "
            "CTA vibrante y compra rápida."
        ),
        "tags": ["Modular", "Color", "Editorial"],
        "preview": (
            "https://images.unsplash.com/photo-1555212697-194d092e3b8f"
            "?w=400&h=250&fit=crop&auto=format"
        ),
    },
    {
        "id": "minimal",
        "name": "Plantilla 02 — Soft Discovery",
        "description": (
            "Estilo Shop con bordes redondeados suaves (28px), "
            "buscador en píldora con acento violeta (#5433eb) "
            "y tarjetas ultra suaves."
        ),
        "tags": ["Pillow-soft", "Shop Violet", "Clean Canvas"],
        "preview": (
            "https://images.unsplash.com/photo-1441986300917-64674bd600d8"
            "?w=400&h=250&fit=crop&auto=format"
        ),
    },
    {
        "id": "visual",
        "name": "Plantilla 03 — Velta Editorial",
        "description": (
            "Imágenes a pantalla completa, navegación superpuesta oscura, "
            "bloques de producto con gran protagonismo visual."
        ),
        "tags": ["Oscuro", "Full-bleed", "Editorial"],
        "preview": (
            "https://images.unsplash.com/photo-1558769132-cb1aea458c5e"
            "?w=400&h=250&fit=crop&auto=format"
        ),
    },
    {
        "id": "catalog",
        "name": "Plantilla 04 — Obsidian Showcase",
        "description": (
            "Vitrina oscura premium, producto protagonista "
            "y acción de compra enfocada."
        ),
        "tags": ["Premium", "Oscuro", "Showcase"],
        "preview": (
            "https://images.unsplash.com/photo-1472851294608-062f824d29cc"
            "?w=400&h=250&fit=crop&auto=format"
        ),
    },
]


class PlantillasDisponiblesAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        serializer = PlantillaDisponibleSerializer(
            PLANTILLAS_DISPONIBLES,
            many=True,
        )

        return success_response(
            data=serializer.data,
            mensaje="Plantillas disponibles obtenidas correctamente",
            status=status.HTTP_200_OK,
        )