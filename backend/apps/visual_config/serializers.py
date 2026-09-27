from rest_framework import serializers

from apps.visual_config.models import ConfiguracionVisual


class PlantillaDisponibleSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    tags = serializers.ListField(
        child=serializers.CharField()
    )
    preview = serializers.CharField()


class PlantillaSeleccionadaSerializer(serializers.ModelSerializer):
    plantilla_seleccionada = serializers.ChoiceField(
        choices=ConfiguracionVisual.Plantilla.choices
    )

    class Meta:
        model = ConfiguracionVisual
        fields = [
            'plantilla_seleccionada',
        ]
