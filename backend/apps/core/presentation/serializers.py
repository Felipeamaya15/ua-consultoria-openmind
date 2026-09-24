from rest_framework import serializers
from apps.core.models import Producto, Tienda, Usuario

class ProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = '__all__'