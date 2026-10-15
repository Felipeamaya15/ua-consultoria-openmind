from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDay, TruncMonth
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.domain import historial as reglas
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
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
            rango = reglas.leer_rango(params)
            estado = reglas.leer_estado(params, {valor for valor, _ in Pedido.ESTADO_CHOICES})
            texto = reglas.leer_busqueda(params)
            orden = reglas.leer_orden(params)
            pagina = reglas.leer_pagina(params)
        except reglas.ParametroInvalido as error:
            return error_response(error.mensaje, error.codigo)

        pedidos = rango.aplicar(Pedido.objects.filter(tienda=tienda))
        if estado:
            pedidos = pedidos.filter(estado=estado)
        if texto:
            pedidos = pedidos.filter(Q(identificador__icontains=texto) | Q(nombre_contacto__icontains=texto))
        total = pedidos.count()
        filas = _solo_campos_de_la_tabla(pedidos).order_by(*orden)[pagina.inicio:pagina.fin]
        return _sin_cache(success_response(
            data=FilaHistorialSerializer(filas, many=True).data,
            mensaje='Historial de pedidos obtenido correctamente.',
            paginacion=pagina.metadatos(total),
        ))

class HistorialVentasAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        params = request.query_params
        try:
            rango = reglas.leer_rango(params)
            agrupacion = reglas.leer_agrupacion(params, rango)
            pagina = reglas.leer_pagina(params)
        except reglas.ParametroInvalido as error:
            return error_response(error.mensaje, error.codigo)

        ventas = rango.aplicar(Pedido.objects.filter(tienda=tienda, estado__in=Pedido.ESTADOS_PAGADOS))
        resumen = ventas.aggregate(cantidad=Count('id_pedido'), total=Sum('monto_total'))
        cantidad = resumen['cantidad']
        total = resumen['total'] or Decimal('0')
        promedio = (total / cantidad).quantize(CENTAVOS) if cantidad else Decimal('0')

        zona = timezone.get_current_timezone()
        truncar = TruncDay if agrupacion == 'dia' else TruncMonth
        formato = '%Y-%m-%d' if agrupacion == 'dia' else '%Y-%m'
        serie = (
            ventas.annotate(periodo=truncar('fecha_creacion', tzinfo=zona))
            .values('periodo').annotate(cantidad=Count('id_pedido'), total=Sum('monto_total'))
            .order_by('periodo')
        )
        filas = _solo_campos_de_la_tabla(ventas).order_by(*reglas.ORDENES['fecha_desc'])[pagina.inicio:pagina.fin]
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
                'ventas': FilaHistorialSerializer(filas, many=True).data,
            },
            mensaje='Historial de ventas obtenido correctamente.',
            paginacion=pagina.metadatos(cantidad),
        ))
