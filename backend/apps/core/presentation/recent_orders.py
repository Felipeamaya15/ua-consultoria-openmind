"""Últimas órdenes registradas de la tienda (SCRUM-371 y SCRUM-376).

Listado liviano para el dashboard del propietario: solo las órdenes más recientes y
solo los datos que muestra la tabla. No incluye correo, teléfono, dirección ni ítems.
"""
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

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
