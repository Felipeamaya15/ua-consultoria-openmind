"""Creacion de pedidos SQL con precios y variantes del catalogo Mongo."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from hashlib import sha256
import json
import logging
from uuid import uuid4

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
from apps.core.models import Pedido, ItemPedido, Tienda, Producto, ConfiguracionPago
from apps.core.presentation.responses import success_response
from apps.core.infrastructure.linkify_client import LinkifyAdapter
from apps.core.delivery import DELIVERY_METHODS, delivery_for_store
from apps.core.shipping import validate_quote
from apps.core.payments import PAYMENT_METHODS, payment_methods_for_store

logger = logging.getLogger(__name__)
PICKUP_SHIPPING_COST = Decimal('0.00')


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
    nombre = serializers.CharField(max_length=150)
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
    cotizacion = serializers.CharField(max_length=4096, required=False)
    codigo_promocional = serializers.ChoiceField(choices=['', 'VERANO20', 'NUEVO5000'], default='', allow_blank=True)

    def validate(self, data):
        if data['metodo_entrega'] != 'Retiro':
            address = data.get('direccion', {})
            if not all(address.get(key, '').strip() for key in ('street', 'number', 'city')):
                raise serializers.ValidationError({'direccion': 'La entrega requiere calle, numero y ciudad.'})
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
        serializer = CheckoutSerializer(data=self.order_data(request, tienda))
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        fingerprint = sha256(json.dumps({key: value for key, value in data.items() if key != 'cotizacion'},
                                       sort_keys=True, default=str).encode()).hexdigest()
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=tienda.pk)
            previous = Pedido.objects.filter(clave_checkout=data['clave_checkout']).first()
            if previous:
                if (previous.tienda_id != tienda.pk or previous.comprador_id != (buyer.pk if buyer else None)
                        or previous.huella_checkout != fingerprint):
                    raise ValidationError('Esta clave de checkout ya fue utilizada para otra solicitud.')
                return success_response(data=self.result(previous, self._url_pago(previous, tienda)),
                                        mensaje='Pedido ya registrado.')
            payment = payment_methods_for_store(tienda).get(PAYMENT_METHODS[data['medio_pago']], {})
            if payment.get('enabled') is not True:
                raise ValidationError({'medio_pago': f"{data['medio_pago']} no está disponible en esta tienda. "
                                                     'Elige otro medio de pago o contacta a la tienda.'})
            method = DELIVERY_METHODS[data['metodo_entrega']]
            delivery = delivery_for_store(tienda)
            if not delivery[method]['enabled']:
                raise ValidationError({'metodo_entrega': 'El método de entrega no está habilitado en esta tienda.'})
            quote = (validate_quote(tienda, data['metodo_entrega'], data.get('direccion', {}), data.get('cotizacion'))
                     if method != 'pickup' else None)
            

            # El retiro nunca hereda cotizaciones ni costos enviados por el cliente.
            shipping = PICKUP_SHIPPING_COST if method == 'pickup' else Decimal(quote['monto'])
            
            delivery_snapshot = {'metodo': data['metodo_entrega'], 'direccion': data.get('direccion', {})}
            if quote:
                delivery_snapshot['cotizacion'] = quote
            else:
                delivery_snapshot['retiro'] = {key: delivery['pickup'][key] for key in ('address', 'schedule')}
            repository = ProductRepository()
            lines = {}
            for item in data['items']:
                product = (
                    repository.get_by_id(str(tienda.pk), item['producto_id'])
                    or repository.get_by_slug(str(tienda.pk), item['producto_id'])
                )
                if not product or not product.get('activo', False):
                    raise ValidationError({'items': 'Un producto no esta disponible en esta tienda.'})
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
                        raise ValueError('Precio invalido.')
                    if quantity > variant.get('stock', 0):
                        raise ValueError(f"Stock insuficiente para {item['sku']}.")
                except (ValueError, InvalidOperation, KeyError) as exc:
                    raise ValidationError({'items': str(exc)}) from exc
                lines[key] = dict(
                    producto_mongo_id=key[0], 
                    id_producto_id=product.get('id_producto'),
                    nombre_producto=product['nombre'], 
                    sku=item['sku'],
                    atributos_variante=variant.get('atributos_variante', []), 
                    cantidad=quantity,
                    atributos={a.get('etiqueta') or a.get('clave'): a.get('valor')
                               for a in variant.get('atributos_variante', [])},
                    precio_unitario=price.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
                )
                
            subtotal = sum((line['precio_unitario'] * line['cantidad'] for line in lines.values()), Decimal(0))
            promo = data['codigo_promocional']
            discount = min(subtotal, (subtotal * Decimal('.2')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
                           if promo == 'VERANO20' else Decimal(5000) if promo == 'NUEVO5000' else Decimal(0))
            total = subtotal - discount + shipping

            if data['medio_pago'] == 'Transbank' and (total <= 0 or total != total.to_integral_value()):
                raise ValidationError({'medio_pago': 'Webpay requiere un total positivo en pesos enteros.'})
            if total > Decimal('9999999999.99'):
                raise ValidationError({'items': 'El importe del pedido excede el maximo permitido.'})
            order = Pedido.objects.create(
                comprador=buyer, tienda=tienda, monto_total=total,
                clave_checkout=data['clave_checkout'], huella_checkout=fingerprint,
                contacto=data['contacto'], medio_pago=data['medio_pago'],
                nombre_contacto=data['contacto']['nombre'], correo_contacto=data['contacto']['email'],
                telefono_contacto=data['contacto'].get('telefono', ''), metodo_pago=data['medio_pago'],
                entrega=delivery_snapshot,
                costo_envio=shipping, descuento=discount,
            )
            ItemPedido.objects.bulk_create([ItemPedido(id_pedido=order, **line) for line in lines.values()])
            result = self.result(order, self._url_pago(order, tienda))
            reserved = []
            try:
                for line in lines.values():
                    if not repository.decrease_stock(str(tienda.pk), line['sku'], line['cantidad']):
                        raise ValidationError({'items': f"Stock insuficiente para {line['sku']}."})
                    reserved.append(line)
                    id_prod_pg = line.get('id_producto_id')
                    if id_prod_pg:
                        try:
                            prod_pg = Producto.objects.select_for_update().get(pk=id_prod_pg, id_tienda=tienda)
                            prod_pg.stock -= line['cantidad']
                            prod_pg.save(update_fields=['stock'])
                        except Producto.DoesNotExist:
                            pass
            except Exception:
                # PostgreSQL revierte su transacción; Mongo requiere compensar las reservas ya confirmadas.
                for line in reversed(reserved):
                    try:
                        if not repository.restore_stock(str(tienda.pk), line['producto_mongo_id'], line['sku'], line['cantidad']):
                            raise RuntimeError('No se encontró la reserva a restituir.')
                    except Exception:
                        logger.exception('No se pudo restituir stock del pedido %s, SKU %s', order.pk, line['sku'])
                raise
            return success_response(data=result, mensaje='Pedido creado correctamente.', status=201)

    @staticmethod
    def _credenciales_linkify(tienda):
        """(id_cuenta, clave_privada) si Linkify esta habilitado y configurado en la tienda; si no, None."""
        config_pago = ConfiguracionPago.objects.filter(tienda=tienda).first()
        linkify = ((config_pago.datos or {}).get('linkify') or {}) if config_pago else {}
        campos = linkify.get('fields') or {}
        id_cuenta = str(campos.get('idCuenta') or '').strip()
        clave = str(campos.get('clavePrivada') or '').strip()
        if linkify.get('enabled') is True and id_cuenta and clave:
            return id_cuenta, clave
        return None

    def _url_pago(self, order, tienda):
        """URL de pago de Linkify del pedido; None si el pedido no es de Linkify o no se puede generar."""
        if (order.medio_pago or '').strip().lower() != 'linkify':
            return None
        credenciales = self._credenciales_linkify(tienda)
        if not credenciales:
            return None
        return LinkifyAdapter(*credenciales).url_de_pago(str(order.pk))

    def order_data(self, request, tienda):
        return request.data

    @staticmethod
    def result(order, url_pago=None):
        data = {
            'id_pedido': order.pk, 'identificador': order.identificador,
            'tienda_id': order.tienda_id, 'estado': order.estado,
            'monto_total': format(order.monto_total, '.2f'),
            'descuento': format(order.descuento, '.2f'), 'costo_envio': format(order.costo_envio, '.2f'),
        }
        if url_pago:
            data['url_pago'] = url_pago
        return data
        

class GuestCheckoutOrderAPIView(CheckoutOrderAPIView):
    def order_data(self, request, tienda):
        # La ruta entrante también acepta el contrato canónico del checkout.
        if 'contacto' in request.data:
            return request.data
        from apps.core.presentation.serializers import RegistrarCompraSerializer
        serializer = RegistrarCompraSerializer(data=request.data, context={'tienda': tienda})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        repository = ProductRepository()
        items = []
        for item in data['items']:
            product = repository.get_by_sku(str(tienda.pk), item['sku'])
            if not product:
                raise ValidationError({'items': 'El SKU no está disponible en esta tienda.'})
            items.append(dict(producto_id=str(product['_id']), sku=item['sku'], cantidad=item['cantidad']))
        return dict(clave_checkout=data.get('clave_checkout', uuid4()), items=items,
                    contacto={'nombre': data['nombre_contacto'], 'email': data['correo_contacto'],
                              'telefono': data.get('telefono_contacto', '')},
                    medio_pago=data['metodo_pago'], metodo_entrega='Retiro')
