from django.shortcuts import get_object_or_404
from django.db.models import Prefetch
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from apps.authentication.presentation.profile import IsCustomer
from apps.core.models import Pedido, ItemPedido
from apps.core.presentation.responses import success_response


class OrderItemSerializer(serializers.ModelSerializer):
    producto_id = serializers.SerializerMethodField()
    nombre = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = ItemPedido
        fields = ['id_item_pedido', 'producto_id', 'nombre', 'cantidad', 'precio_unitario', 'subtotal']

    def get_subtotal(self, item):
        return format(item.precio_unitario * item.cantidad, '.2f')

    def get_producto_id(self, item):
        return item.producto_mongo_id or item.id_producto_id

    def get_nombre(self, item):
        return item.nombre_producto or (item.id_producto.nombre if item.id_producto else '')

    def to_representation(self, item):
        result = super().to_representation(item)
        if item.sku:
            result.update(sku=item.sku, atributos_variante=item.atributos_variante)
        return result


class OrderSerializer(serializers.ModelSerializer):
    estado_etiqueta = serializers.CharField(source='get_estado_display')
    cantidad_productos = serializers.SerializerMethodField()

    class Meta:
        model = Pedido
        fields = ['id_pedido', 'fecha_creacion', 'estado', 'estado_etiqueta', 'monto_total', 'cantidad_productos']

    def get_cantidad_productos(self, order):
        return sum(item.cantidad for item in order.itempedido_set.all())


class OrderDetailSerializer(OrderSerializer):
    items = OrderItemSerializer(source='itempedido_set', many=True)

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + ['items']

    def to_representation(self, order):
        result = super().to_representation(order)
        if order.clave_checkout:
            result.update(medio_pago=order.medio_pago, entrega=order.entrega,
                          costo_envio=format(order.costo_envio, '.2f'), descuento=format(order.descuento, '.2f'))
        return result


class CustomerOrdersAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request, pedido_id=None):
        if any(key in request.query_params for key in ('user_id', 'id_usuario', 'comprador', 'comprador_id')):
            raise ValidationError('El comprador se determina exclusivamente desde la sesión autenticada.')
        # Sin vínculo explícito, el pedido legado no pertenece a la sesión actual.
        orders = Pedido.objects.filter(comprador=request.user).prefetch_related(
            Prefetch('itempedido_set', queryset=ItemPedido.objects.select_related('id_producto'))
        ).order_by('-fecha_creacion', '-id_pedido')
        if pedido_id is not None:
            order = get_object_or_404(orders, pk=pedido_id)
            return success_response(data=OrderDetailSerializer(order).data, mensaje='Pedido obtenido correctamente.')
        return success_response(data=OrderSerializer(orders, many=True).data, mensaje='Pedidos obtenidos correctamente.')
