"""Checkout de prueba local: pedidos persistentes, sin cobro ni correo externo.

El endpoint no está disponible en producción. Los pagos reales requieren una
integración y pruebas separadas; no enviar fondos a este flujo.
"""
import hashlib
import json
import os
from decimal import Decimal
from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny

from apps.authentication.infrastructure.models import ConfiguracionAutenticacion
from apps.authentication.presentation.profile import IsCustomer, StrictSerializer
from apps.core.models import Tienda, Pedido, ItemPedido
from apps.core.presentation.checkout import ContactSerializer
from apps.core.presentation.responses import success_response
from apps.core.infrastructure.tenant import resolver_tienda
from apps.landing.activity_views import NoStoreActivityView, ActivityIPThrottle
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import availability, reserve_activity

TEST_MARKER = 'actividad_prueba_v1'


def is_test_order(order):
    return isinstance(order.entrega, dict) and order.entrega.get('origen') == TEST_MARKER


def local_test_enabled(request):
    if not settings.DEBUG or os.environ.get('PAID_ACTIVITY_TEST_CHECKOUT') != '1':
        return False
    host = urlsplit('http://' + request.get_host()).hostname
    return host in ('localhost', '127.0.0.1', '::1')


class PaidLineSerializer(StrictSerializer):
    seccion_id = serializers.UUIDField()
    cantidad = serializers.IntegerField(min_value=1, max_value=10000)
    version = serializers.RegexField(r'^[a-f0-9]{64}$')

    def to_internal_value(self, data):
        if hasattr(data, 'get') and type(data.get('cantidad')) is not int:
            raise ValidationError({'cantidad': 'La cantidad debe ser un entero.'})
        return super().to_internal_value(data)


class PaidCartSerializer(StrictSerializer):
    actividades = PaidLineSerializer(many=True, allow_empty=False, max_length=30)

    def validate_actividades(self, value):
        if len({line['seccion_id'] for line in value}) != len(value):
            raise ValidationError('Una actividad solo puede aparecer una vez.')
        return value


class PaidTestOrderSerializer(PaidCartSerializer):
    clave_checkout = serializers.UUIDField()
    contacto = ContactSerializer()
    acepta_prueba = serializers.BooleanField()

    def validate_acepta_prueba(self, value):
        if value is not True:
            raise ValidationError('Confirma que se trata de una compra sin cobro real.')
        return value


def quote_cart(store, lines):
    rows = []
    total = 0
    for item in lines:
        q = availability(store, item['seccion_id'])
        if q['version'] != item['version']:
            raise ValidationError('Las condiciones cambiaron. Elimina y vuelve a seleccionar la actividad.')
        if q['estado'] != 'disponible' or item['cantidad'] > q['cupos_disponibles']:
            raise ValidationError('Una actividad ya no está disponible o no tiene suficientes cupos.')
        rows.append({'seccion_id': str(item['seccion_id']), 'titulo': q['titulo'],
                     'cantidad': item['cantidad'], 'precio_unitario': q['precio'],
                     'inicio': q['inicio'], 'zona_horaria': q['zona_horaria'],
                     'subtotal': q['precio'] * item['cantidad']})
        total += rows[-1]['subtotal']
    if not 1 <= total <= 9999999999:
        raise ValidationError('El importe del pedido excede el máximo permitido.')
    return {'actividades': rows, 'total': total, 'costo_envio': 0, 'modo': 'prueba_local'}


def test_order_result(order):
    return {'id_pedido': order.pk, 'identificador': order.identificador,
            'estado': order.estado, 'total': int(order.monto_total), 'modo': 'prueba_local'}


@transaction.atomic
def create_test_order(store, buyer, data):
    Tienda.objects.select_for_update().get(pk=store.pk)
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
    previous = Pedido.objects.filter(clave_checkout=data['clave_checkout']).first()
    if previous:
        if (not is_test_order(previous) or previous.tienda_id != store.pk or
                previous.comprador_id != (buyer.pk if buyer else None) or previous.huella_checkout != digest):
            raise ValidationError('Esta clave de checkout corresponde a otra solicitud.')
        return previous, False
    reservations = [reserve_activity(store, line['seccion_id'], checkout_key=data['clave_checkout'],
                         quantity=line['cantidad'], accepted_version=line['version']) for line in data['actividades']]
    total = sum(r.precio_unitario * r.cantidad for r in reservations)
    if not 1 <= total <= 9999999999:
        raise ValidationError('El importe del pedido excede el máximo permitido.')
    contact = data['contacto']
    order = Pedido.objects.create(tienda=store, comprador=buyer, clave_checkout=data['clave_checkout'],
        huella_checkout=digest, monto_total=Decimal(total), contacto=contact,
        nombre_contacto=('[PRUEBA] ' + contact['nombre'])[:150], correo_contacto=contact['email'],
        telefono_contacto=contact.get('telefono',''), medio_pago='Transferencia', metodo_pago='Transferencia',
        entrega={'metodo':'Actividad', 'origen':TEST_MARKER, 'sin_despacho':True}, costo_envio=Decimal(0), descuento=Decimal(0))
    ItemPedido.objects.bulk_create([ItemPedido(id_pedido=order, nombre_producto=('[PRUEBA] ' + r.condiciones['titulo'])[:200],
        sku='', cantidad=r.cantidad, precio_unitario=Decimal(r.precio_unitario),
        atributos={'Actividad':r.condiciones['titulo'], 'Inicio':r.inicio.isoformat() if r.inicio else 'Grabación', 'Tipo':r.condiciones['tipo']}) for r in reservations])
    ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in reservations]).update(estado='en_pago')
    return order, True


def resolve_test_order(order, *, approve):
    """Solo dentro de la transacción que bloquea el pedido del propietario."""
    if not is_test_order(order):
        return False
    if not settings.DEBUG:
        raise PermissionDenied('Los pedidos de prueba no se gestionan en producción.')
    rows = list(ReservaActividadPagada.objects.select_for_update().filter(
        tienda_id=order.tienda_id, clave_checkout=order.clave_checkout))
    if not rows or any(r.estado not in ('en_pago','revision_pago') for r in rows):
        raise ValidationError('El pedido no tiene reservas pendientes válidas.')
    if approve and any(r.inicio is not None and timezone.now() >= r.inicio for r in rows):
        raise ValidationError('La actividad ya comenzó. Revisa el pedido antes de resolverlo.')
    ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in rows]).update(estado='confirmada' if approve else 'liberada')
    return True


class PaidTestCheckoutView(NoStoreActivityView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [AllowAny]
    throttle_classes = [ActivityIPThrottle]

    def post(self, request):
        if not local_test_enabled(request):
            raise NotFound('El checkout de prueba no está disponible.')
        store = resolver_tienda(request)
        buyer = request.user if request.user.is_authenticated else None
        if buyer and not IsCustomer().has_permission(request, self):
            raise PermissionDenied('Usa una cuenta de comprador, no la cuenta del emprendedor.')
        config = ConfiguracionAutenticacion.objects.filter(tienda=store).first()
        if not buyer and config and (not config.guest_checkout or config.requires_auth == 'required'):
            raise NotAuthenticated('Esta tienda requiere iniciar sesión para comprar.')
        if 'clave_checkout' not in request.data:
            serializer = PaidCartSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            return success_response(data=quote_cart(store,serializer.validated_data['actividades']))
        serializer = PaidTestOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order, created = create_test_order(store, buyer, serializer.validated_data)
        return success_response(data=test_order_result(order), status=201 if created else 200)
