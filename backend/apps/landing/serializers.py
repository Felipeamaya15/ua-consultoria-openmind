from rest_framework import serializers

from apps.landing.models import ConfiguracionLanding


class ConfiguracionLandingSerializer(serializers.ModelSerializer):
    titulo = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
    )
    descripcion = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    texto_boton = serializers.CharField(
        max_length=100,
        trim_whitespace=True,
    )
    imagen_principal = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    secciones = serializers.JSONField(
        required=False,
        default=dict,
    )

    class Meta:
        model = ConfiguracionLanding
        fields = [
            'id',
            'tienda',
            'titulo',
            'descripcion',
            'texto_boton',
            'imagen_principal',
            'secciones',
        ]
        read_only_fields = [
            'id',
            'tienda',
        ]

    def validate_secciones(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "Las secciones de la landing deben enviarse como un objeto."
            )

        return value