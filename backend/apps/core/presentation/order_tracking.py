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


class TrackingLookupThrottle(AnonRateThrottle):
    scope = 'order_tracking'
    rate = '20/min'


class OrderTrackingAPIView(APIView):
    """POST {identificador, email} -> detalle actual, 400 inválido, 404 sin coincidencia.

    El correo viaja en el cuerpo; la respuesta excluye dirección, teléfono y claves.
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [TrackingLookupThrottle]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response

    def post(self, request):
        lookup = TrackingLookupSerializer(data=request.data)
        lookup.is_valid(raise_exception=True)
        tienda = resolver_tienda(request)
        # Ambos datos son obligatorios: nunca se consulta solo por número/ID.
        matches = list(Pedido.objects.filter(
            tienda=tienda,
            identificador__iexact=lookup.validated_data['identificador'],
            correo_contacto__iexact=lookup.validated_data['email'],
        ).prefetch_related(
            Prefetch('itempedido_set', queryset=ItemPedido.objects.select_related('id_producto'))
        )[:2])
        if len(matches) != 1:
            raise NotFound('No encontramos un pedido con ese número y correo.')
        order = matches[0]
        data = OrderDetailSerializer(order).data
        data.update(
            identificador=order.identificador,
            nombre_contacto=order.nombre_contacto,
            medio_pago=order.medio_pago or order.metodo_pago,
            entrega={'metodo': order.entrega.get('metodo', '')},
            costo_envio=format(order.costo_envio, '.2f'),
            descuento=format(order.descuento, '.2f'),
        )
        response = success_response(data=data, mensaje='Pedido obtenido correctamente.')
        response['Cache-Control'] = 'no-store'
        return response
