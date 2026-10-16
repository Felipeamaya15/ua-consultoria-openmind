"""Consulta de solo lectura para compradores con o sin cuenta."""
import re
from datetime import datetime

from django.db.models import Prefetch
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import ItemPedido, Pedido
from apps.core.presentation.customer_orders import OrderDetailSerializer
from apps.core.presentation.responses import success_response
from apps.core.presentation.tracking_guard import TrackingAttemptGuard, tracking_exception_handler


class TrackingLookupSerializer(StrictSerializer):
    identificador = serializers.CharField(min_length=17, max_length=17)
    email = serializers.EmailField(max_length=320)

    def validate_identificador(self, value):
        identifier = value.upper()
        match = re.fullmatch(r'ORD-(\d{8})-([A-Z0-9]{4})', identifier)
        if not match:
            raise serializers.ValidationError(
                'El número de orden debe tener el formato ORD-AAAAMMDD-XXXX.'
            )
        try:
            datetime.strptime(match.group(1), '%Y%m%d')
        except ValueError as error:
            raise serializers.ValidationError(
                'La fecha incluida en el número de orden no es válida.'
            ) from error
        return identifier

    def validate_email(self, value):
        return value.casefold()


class TrackingLookupThrottle(AnonRateThrottle):
    scope = 'order_tracking'
    rate = '20/min'


class OrderTrackingAPIView(APIView):
    """POST {identificador, email} -> detalle actual, 400 inválido, 404 sin coincidencia."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [TrackingLookupThrottle]

    def get_exception_handler(self):
        return tracking_exception_handler

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response

    def post(self, request):
        lookup = TrackingLookupSerializer(data=request.data)
        lookup.is_valid(raise_exception=True)
        tienda = resolver_tienda(request)
        guard = TrackingAttemptGuard(lookup.validated_data['identificador'], lookup.validated_data['email'])
        guard.check()

        matches = list(Pedido.objects.filter(
            tienda=tienda,
            identificador__iexact=lookup.validated_data['identificador'],
            correo_contacto__iexact=lookup.validated_data['email'],
        ).prefetch_related(
            Prefetch('itempedido_set', queryset=ItemPedido.objects.select_related('id_producto'))
        )[:2])

        if len(matches) != 1:
            guard.register_failure()
            raise NotFound('No encontramos un pedido con ese número y correo.')

        guard.register_success()
        order = matches[0]
        data = OrderDetailSerializer(order).data

        # --- SCRUM-377: Construcción de Línea de Tiempo (RF-02.4) ---
        alias_estado = {'preparacion': 'preparando', 'despachado': 'enviado'}
        estado_actual = alias_estado.get(getattr(order, 'estado', 'pendiente'), getattr(order, 'estado', 'pendiente'))
        estados_map = {
            'pendiente': 'Pendiente de pago',
            'pagado': 'Pago confirmado',
            'preparando': 'En preparación',
            'en_origen': 'En origen',
            'enviado': 'Despachado / En tránsito',
            'en_reparto': 'En reparto',
            'entregado': 'Entregado',
            'cancelado': 'Cancelado',
        }

        orden_estados = ['pendiente', 'pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado']

        if estado_actual == 'cancelado':
            linea_tiempo = [{'estado': 'cancelado', 'etiqueta': 'Cancelado', 'completado': True, 'actual': True}]
        else:
            try:
                indice_actual = orden_estados.index(estado_actual)
            except ValueError:
                indice_actual = 0

            pasos = [
                {'estado': 'pendiente', 'etiqueta': 'Recibido'},
                {'estado': 'pagado', 'etiqueta': 'Pago Confirmado'},
                {'estado': 'preparando', 'etiqueta': 'En Preparación'},
                {'estado': 'en_origen', 'etiqueta': 'En Origen'},
                {'estado': 'enviado', 'etiqueta': 'En Tránsito'},
                {'estado': 'en_reparto', 'etiqueta': 'En Reparto'},
                {'estado': 'entregado', 'etiqueta': 'Entregado'},
            ]
            for i, paso in enumerate(pasos):
                paso['completado'] = i <= indice_actual
                paso['actual'] = i == indice_actual
            linea_tiempo = pasos
        # -------------------------------------------------------------

        data.update(
            identificador=order.identificador,
            nombre_contacto=order.nombre_contacto,
            medio_pago=order.medio_pago or getattr(order, 'metodo_pago', ''),
            entrega={'metodo': order.entrega.get('metodo', '') if order.entrega else ''},
            costo_envio=format(order.costo_envio, '.2f') if order.costo_envio else '0.00',
            descuento=format(order.descuento, '.2f') if order.descuento else '0.00',
            estado_label=estados_map.get(estado_actual, str(estado_actual).capitalize()),
            linea_tiempo=linea_tiempo,
        )

        response = success_response(data=data, mensaje='Pedido obtenido correctamente.')
        response['Cache-Control'] = 'no-store'
        return response