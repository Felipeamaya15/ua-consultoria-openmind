from django.db import transaction
from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import ItemPedido, Pedido, Producto, Usuario, VarianteProducto
from .serializers import (
    RegistrarCompraSerializer,
    VarianteProductoSerializer,
)


class VarianteProductoListCreateView(generics.ListCreateAPIView):
    serializer_class = VarianteProductoSerializer

    def get_producto(self):
        tienda = resolver_tienda(
            self.request, exigir_propietario=self.request.method == 'POST',
        )
        id_producto = self.kwargs.get('id_producto')
        try:
            return Producto.objects.get(id_producto=id_producto, id_tienda=tienda)
        except Producto.DoesNotExist:
            raise NotFound(detail=f"No existe un producto con el id {id_producto}.")

    def get_queryset(self):
        return VarianteProducto.objects.filter(id_producto=self.get_producto())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['id_producto'] = self.get_producto().pk
        return context

    def perform_create(self, serializer):
        serializer.save(id_producto=self.get_producto())


class VarianteProductoDetailView(generics.RetrieveUpdateAPIView):
    """
    Permite consultar (GET) y actualizar (PUT / PATCH) 
    los datos editables de una variante específica.
    """
    serializer_class = VarianteProductoSerializer
    lookup_field = 'id_variante'
    lookup_url_kwarg = 'id_variante'

    def get_producto(self):
        tienda = resolver_tienda(
            self.request, exigir_propietario=self.request.method in ('PUT', 'PATCH'),
        )
        id_producto = self.kwargs.get('id_producto')
        try:
            return Producto.objects.get(id_producto=id_producto, id_tienda=tienda)
        except Producto.DoesNotExist:
            raise NotFound(detail=f"No existe un producto con el id {id_producto}.")

    def get_queryset(self):
        return VarianteProducto.objects.filter(id_producto=self.get_producto())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['id_producto'] = self.get_producto().pk
        return context


class RegistrarCompraView(APIView):
    """
    Procesa compras garantizando que:
    1. Si una variante tiene stock 0 o insuficiente, la solicitud se rechaza (400 Bad Request).
    2. La operación es atómica: si falla, no se altera el stock ni se crean pedidos inconsistentes.
    """
    authentication_classes = []

    def post(self, request):
        tienda = resolver_tienda(request)
        serializer = RegistrarCompraSerializer(data=request.data, context={'tienda': tienda})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        datos = serializer.validated_data
        id_usuario = datos['id_usuario']
        items = datos['items']

        try:
            usuario = Usuario.objects.get(id_usuario=id_usuario)
        except Usuario.DoesNotExist:
            return Response(
                {"error": f"El usuario con ID {id_usuario} no existe."}, 
                status=status.HTTP_404_NOT_FOUND
            )

        # Transacción ACID: cualquier error intermedio cancela toda la operación
        try:
            with transaction.atomic():
                pedido = Pedido.objects.create(
                    id_usuario=usuario,
                    monto_total=0,
                    estado='pagado'
                )
                monto_acumulado = 0

                for item in items:
                    # select_for_update bloquea la fila en la BD para evitar compras concurrentes duplicadas
                    variante = VarianteProducto.objects.select_for_update().get(
                        id_variante=item['id_variante'],
                        id_producto__id_tienda=tienda,
                    )

                    # Validación de seguridad: rechazar si stock es 0 o menor a lo pedido
                    if variante.stock <= 0:
                        raise ValueError(
                            f"Operación rechazada: La variante '{variante.sku}' tiene stock 0."
                        )
                    if variante.stock < item['cantidad']:
                        raise ValueError(
                            f"Stock insuficiente para '{variante.sku}'. Disponible: {variante.stock}, Solicitado: {item['cantidad']}."
                        )

                    subtotal = variante.precio * item['cantidad']
                    monto_acumulado += subtotal

                    ItemPedido.objects.create(
                        id_pedido=pedido,
                        id_producto=variante.id_producto,
                        id_variante=variante,
                        cantidad=item['cantidad'],
                        precio_unitario=variante.precio
                    )

                    # Solo se descuenta el stock tras superar las validaciones
                    variante.stock -= item['cantidad']
                    variante.save()

                pedido.monto_total = monto_acumulado
                pedido.save()

            return Response(
                {
                    "mensaje": "Compra procesada exitosamente.",
                    "id_pedido": pedido.id_pedido,
                    "monto_total": str(pedido.monto_total),
                    "estado": pedido.estado
                },
                status=status.HTTP_201_CREATED
            )

        except VarianteProducto.DoesNotExist:
            return Response(
                {"error": "COMPRA_RECHAZADA", "detalle": "La variante no existe en la tienda de esta instalación."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as err:
            return Response(
                {"error": "COMPRA_RECHAZADA", "detalle": str(err)}, 
                status=status.HTTP_400_BAD_REQUEST
            )
