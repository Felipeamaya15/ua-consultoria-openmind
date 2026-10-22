"""Últimas órdenes registradas de la tienda (SCRUM-371 y SCRUM-376).

Listado liviano para el dashboard del propietario: solo las órdenes más recientes y
solo los datos que muestra la tabla. No incluye correo, teléfono, dirección ni ítems.
"""
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from apps.authentication.permissions import IsStoreOwner
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from apps.core.presentation.serializers import PedidoEstadoUpdateSerializer
from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
from apps.core.presentation.responses import error_response, success_response

LIMITE_POR_DEFECTO = 5
LIMITE_MAXIMO = 20
MENSAJE_LIMITE = f'El límite debe ser un número entero entre 1 y {LIMITE_MAXIMO}.'
CAMPOS = [
    'id_pedido', 'identificador', 'nombre_contacto', 'estado', 'estado_etiqueta',
    'monto_total', 'fecha_creacion',
]


class UltimaOrdenSerializer(serializers.ModelSerializer):
    estado_etiqueta = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = Pedido
        fields = CAMPOS
        read_only_fields = CAMPOS


def leer_limite(valor):
    """Devuelve el límite pedido o None si no es un entero entre 1 y LIMITE_MAXIMO."""
    if valor is None:
        return LIMITE_POR_DEFECTO
    # isdigit() acepta también dígitos de otros alfabetos y superíndices: solo se admiten 0-9.
    if not (valor.isascii() and valor.isdigit()):
        return None
    limite = int(valor)
    return limite if 1 <= limite <= LIMITE_MAXIMO else None


class UltimasOrdenesAPIView(APIView):
    """GET /api/tienda/pedidos/ultimos/?limite=5 -> las órdenes más recientes (solo el propietario)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        limite = leer_limite(request.query_params.get('limite'))
        if limite is None:
            return error_response(MENSAJE_LIMITE, 'LIMITE_INVALIDO')
        ordenes = (
            Pedido.objects.filter(tienda=tienda)
            .only('id_pedido', 'identificador', 'nombre_contacto', 'estado', 'monto_total', 'fecha_creacion')
            .order_by('-fecha_creacion', '-id_pedido')[:limite]
        )
        response = success_response(
            data=UltimaOrdenSerializer(ordenes, many=True).data,
            mensaje='Últimas órdenes obtenidas correctamente.',
        )
        response['Cache-Control'] = 'no-store'
        return response


class ActualizarEstadoPedidoAPIView(APIView):
    """PATCH /api/tienda/pedidos/<id_pedido>/estado/ -> actualiza el estado de una orden de la tienda."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_pedido):
        tienda = resolver_tienda(request, exigir_propietario=True)

        serializer = PedidoEstadoUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                mensaje="El estado logístico proporcionado no es válido.",
                codigo="ESTADO_INVALIDO",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        estado_normalizado = serializer.validated_data['estado']

        pedido = Pedido.objects.filter(id_pedido=id_pedido, tienda=tienda).first()
        if not pedido:
            return error_response(
                mensaje="No se encontró el pedido solicitado.",
                codigo="PEDIDO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )

        estado_anterior = pedido.estado
        pedido.estado = estado_normalizado
        pedido.save(update_fields=['estado'])
        correo = notificar_cambio_de_estado(pedido, estado_anterior)

        return success_response(
            data={
                "id_pedido": pedido.id_pedido,
                "identificador": pedido.identificador,
                "estado": pedido.estado,
                "estado_etiqueta": pedido.get_estado_display(),
                "correo": None if correo is None else {"enviado": correo.enviado, "codigo": correo.codigo},
            },
            mensaje=f"El estado de la orden fue actualizado a '{pedido.get_estado_display()}' exitosamente.",
        )