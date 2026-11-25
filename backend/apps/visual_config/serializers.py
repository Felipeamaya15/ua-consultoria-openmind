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
        choices=ConfiguracionVisual.Plantilla.choices,
        required=False,
    )
    plantilla_activa = serializers.ChoiceField(
        choices=ConfiguracionVisual.Plantilla.choices,
        required=False,
        write_only=True,
    )

    class Meta:
        model = ConfiguracionVisual
        fields = [
            'plantilla_seleccionada',
            'plantilla_activa',
        ]

    def validate(self, attrs):
        plantilla = attrs.get('plantilla_seleccionada') or attrs.get('plantilla_activa')
        if not plantilla:
            raise serializers.ValidationError({'plantilla_seleccionada': 'Este campo es requerido.'})
        return {'plantilla_seleccionada': plantilla}
