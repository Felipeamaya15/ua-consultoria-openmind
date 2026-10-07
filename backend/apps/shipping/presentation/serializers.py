from rest_framework import serializers

class CotizacionEnvioRequestSerializer(serializers.Serializer):
    calle = serializers.CharField(max_length=150, required=True)
    numero = serializers.CharField(max_length=20, required=True)
    comuna = serializers.CharField(max_length=100, required=True)
    region = serializers.CharField(max_length=100, required=True)
    total_carrito = serializers.DecimalField(max_digits=10, decimal_places=2, required=True)
    total_items = serializers.IntegerField(min_value=1, required=True)