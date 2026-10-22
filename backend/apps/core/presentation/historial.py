from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDay, TruncMonth
from apps.core.domain.periodos import ZONA_COMERCIAL
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.domain import historial as reglas
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
from apps.core.infrastructure.commercial import order_query, serialize_order, paid_summary, product_totals
from django.shortcuts import get_object_or_404
from apps.core.presentation.responses import error_response, success_response

CAMPOS = [
    'id_pedido', 'identificador', 'nombre_contacto', 'estado', 'estado_etiqueta',
    'medio_pago', 'monto_total', 'fecha_creacion',
]
CENTAVOS = Decimal('0.01')


class FilaHistorialSerializer(serializers.ModelSerializer):
    estado_etiqueta = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = Pedido
        fields = CAMPOS
        read_only_fields = CAMPOS


def _solo_campos_de_la_tabla(queryset):
    return queryset.only('id_pedido', 'identificador', 'nombre_contacto', 'estado', 'medio_pago',
                         'monto_total', 'fecha_creacion')


def _sin_cache(response):
    response['Cache-Control'] = 'no-store'
    return response

class HistorialPedidosAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        params = request.query_params
        try:
            pedidos, rango = order_query(tienda, params)
            pagina = reglas.leer_pagina(params)
        except reglas.ParametroInvalido as error:
            return error_response(error.mensaje, error.codigo)

        total = pedidos.count()
        filas = pedidos.prefetch_related('itempedido_set')[pagina.inicio:pagina.fin]
        return _sin_cache(success_response(
            data=[serialize_order(row) for row in filas],
            mensaje='Historial de pedidos obtenido correctamente.',
            paginacion=pagina.metadatos(total),
        ))

class HistorialVentasAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        params = request.query_params
        try:
            ventas, rango = order_query(tienda, params, sales=True)
            agrupacion = reglas.leer_agrupacion(params, rango)
            pagina = reglas.leer_pagina(params)
        except reglas.ParametroInvalido as error:
            return error_response(error.mensaje, error.codigo)

        resumen = ventas.aggregate(cantidad=Count('id_pedido'), total=Sum('monto_total'))
        cantidad = resumen['cantidad']
        total = resumen['total'] or Decimal('0')
        promedio = (total / cantidad).quantize(CENTAVOS) if cantidad else Decimal('0')

        zona = ZONA_COMERCIAL
        truncar = TruncDay if agrupacion == 'dia' else TruncMonth
        formato = '%Y-%m-%d' if agrupacion == 'dia' else '%Y-%m'
        serie = (
            ventas.annotate(periodo=truncar('fecha_creacion', tzinfo=zona))
            .values('periodo').annotate(cantidad=Count('id_pedido'), total=Sum('monto_total'))
            .order_by('periodo')
        )
        filas = ventas.prefetch_related('itempedido_set')[pagina.inicio:pagina.fin]
        return _sin_cache(success_response(
            data={
                'resumen': {
                    'cantidad_ventas': cantidad,
                    'total_vendido': format(total, '.2f'),
                    'ticket_promedio': format(promedio, '.2f'),
                },
                'agrupacion': agrupacion,
                'serie': [
                    {'periodo': fila['periodo'].strftime(formato), 'cantidad_ventas': fila['cantidad'],
                     'total_vendido': format(fila['total'], '.2f')}
                    for fila in serie
                ],
                'ventas': [serialize_order(row) for row in filas],
                'importes': paid_summary(ventas),
                'productos': [{'nombre': row['nombre_producto'], 'sku': row['sku'], 'cantidad': row['unidades'],
                               'bruto_lineas': format(row['bruto_lineas'], '.2f')}
                              for row in product_totals(ventas).order_by('-unidades', 'nombre_producto', 'sku')[:10]],
            },
            mensaje='Historial de ventas obtenido correctamente.',
            paginacion=pagina.metadatos(cantidad),
        ))


class PedidoDetallePrivadoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id_pedido):
        tienda = resolver_tienda(request, exigir_propietario=True)
        pedido = get_object_or_404(Pedido.objects.filter(tienda=tienda).prefetch_related('itempedido_set'), pk=id_pedido)
        return _sin_cache(success_response(data=serialize_order(pedido)))
