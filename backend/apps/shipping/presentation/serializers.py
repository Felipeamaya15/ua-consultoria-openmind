from rest_framework import serializers
from decimal import Decimal


REGIONES_VALIDAS = [
    "ARICA Y PARINACOTA", "TARAPACA", "ANTOFAGASTA", "ATACAMA", "COQUIMBO",
    "VALPARAISO", "METROPOLITANA", "O'HIGGINS", "MAULE", "NUBLE",
    "BIOBIO", "LA ARAUCANIA", "LOS RIOS", "LOS LAGOS", "AYSEN", "MAGALLANES"
]

class CotizacionEnvioSerializer(serializers.Serializer):
    calle = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    numero = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    comuna = serializers.CharField(max_length=100, required=True, error_messages={
        "required": "El campo 'comuna' es obligatorio.",
        "blank": "El campo 'comuna' no puede estar vacio."
    })
    region = serializers.CharField(max_length=100, required=True, error_messages={
        "required": "El campo 'region' es obligatorio.",
        "blank": "El campo 'region' no puede estar vacio."
    })
    total_carrito = serializers.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        min_value=Decimal("0.01"), 
        required=True
    )
    total_items = serializers.IntegerField(min_value=1, required=True)
    peso_kg = serializers.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        min_value=Decimal("0.1"), 
        required=False, 
        default=Decimal("1.0")
    )

    def validate_region(self, value):
        region_limpia = value.strip().upper()
        # Verificar coincidencia parcial o completa
        if not any(r in region_limpia for r in REGIONES_VALIDAS):
            raise serializers.ValidationError(
                f"La region '{value}' no es valida dentro del territorio nacional cubierto."
            )
        return region_limpia