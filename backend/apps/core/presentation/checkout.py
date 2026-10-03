"""Creación de pedidos SQL con precios y variantes del catálogo Mongo."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from hashlib import sha256
import json

from django.db import transaction
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.authentication.infrastructure.models import ConfiguracionAutenticacion
from apps.authentication.presentation.profile import IsCustomer, StrictSerializer
from apps.catalog.domain.stock import validate_stock
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido, ItemPedido, Tienda
from apps.core.presentation.responses import success_response


class CheckoutItemSerializer(StrictSerializer):
    producto_id = serializers.CharField(max_length=100)
    sku = serializers.CharField(max_length=100)
    cantidad = serializers.IntegerField(min_value=1, max_value=100000)

    def to_internal_value(self, data):
        if isinstance(data, dict) and (isinstance(data.get('cantidad'), bool)
                                     or not isinstance(data.get('cantidad'), int)):
            raise serializers.ValidationError({'cantidad': 'La cantidad debe ser un entero positivo.'})
        return super().to_internal_value(data)


class ContactSerializer(StrictSerializer):
    nombre = serializers.CharField(max_length=200)
    email = serializers.EmailField()
    telefono = serializers.CharField(max_length=30, allow_blank=True, required=False)


class AddressSerializer(StrictSerializer):
    street = serializers.CharField(max_length=200, allow_blank=True)
    number = serializers.CharField(max_length=30, allow_blank=True)
    apt = serializers.CharField(max_length=100, allow_blank=True)
    city = serializers.CharField(max_length=100, allow_blank=True)
    region = serializers.CharField(max_length=100, allow_blank=True)


class CheckoutSerializer(StrictSerializer):
    clave_checkout = serializers.UUIDField()
    items = CheckoutItemSerializer(many=True, allow_empty=False, max_length=100)
    contacto = ContactSerializer()
    medio_pago = serializers.ChoiceField(choices=['Transbank', 'PayPal', 'MercadoPago', 'Linkify', 'Transferencia'])
    metodo_entrega = serializers.ChoiceField(choices=['Chilexpress', 'Starken', 'Retiro'])
    direccion = AddressSerializer(required=False)
    codigo_promocional = serializers.ChoiceField(choices=['', 'VERANO20', 'NUEVO5000'], default='', allow_blank=True)

    def validate(self, data):
        if data['metodo_entrega'] != 'Retiro':
            address = data.get('direccion', {})
            if not all(address.get(key, '').strip() for key in ('street', 'number', 'city')):
                raise serializers.ValidationError({'direccion': 'La entrega requiere calle, número y ciudad.'})
        return data


class CheckoutOrderAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        tienda = resolver_tienda(request)
        buyer = request.user if request.user.is_authenticated else None
        if buyer and not IsCustomer().has_permission(request, self):
            raise PermissionDenied('Solo un comprador puede crear pedidos autenticados.')
        config = ConfiguracionAutenticacion.objects.filter(tienda=tienda).first()
        if not buyer and config and (not config.guest_checkout or config.requires_auth == 'required'):
            raise NotAuthenticated('Esta tienda requiere iniciar sesión para comprar.')
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        fingerprint = sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
        with transaction.atomic():
            # Serializa confirmaciones de la tienda, incluida la repetición concurrente.
            Tienda.objects.select_for_update().get(pk=tienda.pk)
            previous = Pedido.objects.filter(clave_checkout=data['clave_checkout']).first()
            if previous:
                if (previous.tienda_id != tienda.pk or previous.comprador_id != (buyer.pk if buyer else None)
                        or previous.huella_checkout != fingerprint):
                    raise ValidationError('Esta clave de checkout ya fue utilizada para otra solicitud.')
                return success_response(data=self.result(previous), mensaje='Pedido ya registrado.')
            repository = ProductRepository()
            lines = {}
            for item in data['items']:
                product = repository.get_by_id(str(tienda.pk), item['producto_id'])
                if not product or not product.get('activo', False):
                    raise ValidationError({'items': 'Un producto no está disponible en esta tienda.'})
                variant = next((v for v in product.get('variantes', []) if v.get('sku') == item['sku']), None)
                if variant is None or variant.get('activo') is False:
                    raise ValidationError({'items': 'El SKU no pertenece al producto seleccionado.'})
                key = (str(product['_id']), item['sku'])
                quantity = lines.get(key, {}).get('cantidad', 0) + item['cantidad']
                try:
                    validate_stock(variant.get('stock', 0))
                    base = Decimal(str(variant['precio']))
                    offer = variant.get('precio_oferta')
                    price = Decimal(str(offer)) if offer is not None else base
                    if (not price.is_finite() or not base.is_finite() or price < 0 or base < 0
                            or price > base or base > Decimal('9999999999.99')):
                        raise ValueError('Precio inválido.')
                    if quantity > variant.get('stock', 0):
                        raise ValueError(f"Stock insuficiente para {item['sku']}.")
                except (ValueError, InvalidOperation, KeyError) as exc:
                    raise ValidationError({'items': str(exc)}) from exc
                lines[key] = dict(producto_mongo_id=key[0], nombre_producto=product['nombre'], sku=item['sku'],
                                  atributos_variante=variant.get('atributos_variante', []), cantidad=quantity,
                                  precio_unitario=price.quantize(Decimal('.01'), rounding=ROUND_HALF_UP))
            subtotal = sum((line['precio_unitario'] * line['cantidad'] for line in lines.values()), Decimal(0))
            # Reproduce las reglas actuales del carrito; nunca acepta importes del cliente.
            promo = data['codigo_promocional']
            discount = min(subtotal, (subtotal * Decimal('.2')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
                           if promo == 'VERANO20' else Decimal(5000) if promo == 'NUEVO5000' else Decimal(0))
            shipping = Decimal(0) if data['metodo_entrega'] == 'Retiro' or subtotal > 50000 else Decimal(3490)
            total = subtotal - discount + shipping
            if total > Decimal('9999999999.99'):
                raise ValidationError({'items': 'El importe del pedido excede el máximo permitido.'})
            order = Pedido.objects.create(comprador=buyer, tienda=tienda, monto_total=total,
                clave_checkout=data['clave_checkout'], huella_checkout=fingerprint,
                contacto=data['contacto'], medio_pago=data['medio_pago'],
                entrega={'metodo': data['metodo_entrega'], 'direccion': data.get('direccion', {})},
                costo_envio=shipping, descuento=discount)
            ItemPedido.objects.bulk_create([ItemPedido(id_pedido=order, **line) for line in lines.values()])
        return success_response(data=self.result(order), mensaje='Pedido creado correctamente.', status=201)

    @staticmethod
    def result(order):
        return {'id_pedido': order.pk, 'tienda_id': order.tienda_id, 'estado': order.estado,
                'monto_total': format(order.monto_total, '.2f'),
                'descuento': format(order.descuento, '.2f'), 'costo_envio': format(order.costo_envio, '.2f')}
