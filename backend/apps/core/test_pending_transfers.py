from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.models import ConfiguracionPago
from datetime import timedelta
from decimal import Decimal
import json
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import ConfiguracionEntrega, ItemPedido, Pedido, Producto, Tienda
from apps.core.test_linkify_errores import RepositorioFalso


class TransferFixtureMixin:
    url = '/api/pagos/transferencias/pendientes/'

    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create_user(username='transfers-owner', is_staff=True)
        self.buyer = users.objects.create_user(username='transfers-buyer', email='buyer@example.com')
        self.other = users.objects.create_user(username='transfers-other', is_staff=True)
        self.store = Tienda.objects.create(nombre='Transfer store', id_usuario_propietario=self.owner)
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.owner).key)

    def create_order(self, **changes):
        data = dict(tienda=self.store, comprador=self.buyer, medio_pago='Transferencia',
                    metodo_pago='Transferencia', estado='pendiente', monto_total=Decimal('12990.00'),
                    nombre_contacto='Comprador', correo_contacto='buyer@example.com')
        data.update(changes)
        return Pedido.objects.create(**data)


class TransferenciasPendientesTests(TransferFixtureMixin, TestCase):
    def test_get_returns_pending_transfer_with_only_required_fields(self):
        order = self.create_order()
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['exito'])
        self.assertEqual(len(response.data['data']), 1)
        data = response.data['data'][0]
        self.assertEqual(set(data), {'id_pedido', 'identificador', 'fecha_creacion', 'nombre_contacto',
                                     'correo_contacto', 'monto_total', 'medio_pago', 'estado'})
        self.assertEqual(data['id_pedido'], order.pk)
        self.assertEqual(data['identificador'], order.identificador)
        self.assertEqual(data['nombre_contacto'], 'Comprador')
        self.assertEqual(data['correo_contacto'], 'buyer@example.com')
        self.assertEqual(data['monto_total'], '12990.00')
        self.assertEqual(data['medio_pago'], 'Transferencia')
        self.assertEqual(data['estado'], 'pendiente')
        self.assertTrue(data['fecha_creacion'])

    def test_other_payment_methods_are_excluded_even_with_legacy_transfer_field(self):
        expected = self.create_order()
        for method in ('Transbank', 'PayPal', 'MercadoPago', 'Linkify', ''):
            self.create_order(medio_pago=method, metodo_pago='Transferencia')
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id_pedido'] for item in response.data['data']], [expected.pk])

    def test_paid_shipped_and_cancelled_orders_are_excluded(self):
        expected = self.create_order()
        for state in ('pagado', 'enviado', 'cancelado'):
            self.create_order(estado=state)
        self.assertEqual([item['id_pedido'] for item in self.api.get(self.url).data['data']], [expected.pk])

    def test_paid_transfer_disappears_without_a_second_payment_state(self):
        order = self.create_order()
        self.assertEqual(len(self.api.get(self.url).data['data']), 1)
        order.estado = 'pagado'
        order.save(update_fields=['estado'])
        self.assertEqual(self.api.get(self.url).data['data'], [])

    def test_foreign_and_unassigned_orders_are_excluded_by_store_filter(self):
        own = self.create_order()
        other_store = Tienda.objects.create(nombre='Foreign', id_usuario_propietario=self.other)
        self.create_order(tienda=other_store)
        self.create_order(tienda=None)
        # El resolver real rechaza instalaciones con varias tiendas (probado aparte).
        # Aislamos el filtro de la vista manteniendo filas ajenas en PostgreSQL.
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.store) as resolver:
            response = self.api.get(self.url)
        self.assertEqual(resolver.call_args.kwargs, {'exigir_propietario': True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id_pedido'] for item in response.data['data']], [own.pk])

    def test_non_owner_admin_and_customer_cannot_consult(self):
        self.create_order()
        for user in (self.other, self.buyer):
            self.api.force_authenticate(user)
            response = self.api.get(self.url)
            self.assertEqual(response.status_code, 403, response.data)

    def test_anonymous_cannot_consult(self):
        self.create_order()
        self.api.credentials()
        self.assertEqual(self.api.get(self.url).status_code, 401)

    def test_empty_list_is_success_with_array(self):
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['exito'])
        self.assertEqual(response.data['data'], [])

    def test_newest_first_with_deterministic_tie_breaker(self):
        old = self.create_order()
        recent = self.create_order()
        tied = self.create_order()
        now = timezone.now()
        Pedido.objects.filter(pk=old.pk).update(fecha_creacion=now - timedelta(days=2))
        Pedido.objects.filter(pk__in=[recent.pk, tied.pk]).update(fecha_creacion=now)
        response = self.api.get(self.url)
        self.assertEqual([item['id_pedido'] for item in response.data['data']], [tied.pk, recent.pk, old.pk])

    def test_foreign_store_ids_in_query_headers_and_get_body_are_rejected(self):
        self.create_order()
        foreign_id = self.store.pk + 100
        for field in ('tienda_id', 'id_tienda'):
            self.assertEqual(self.api.get(self.url, {field: foreign_id}).status_code, 400)
            response = self.api.generic('GET', self.url, json.dumps({field: foreign_id}),
                                        content_type='application/json')
            self.assertEqual(response.status_code, 400)
        for header in ('HTTP_X_TIENDA_ID', 'HTTP_TIENDA_ID'):
            self.assertEqual(self.api.get(self.url, **{header: str(foreign_id)}).status_code, 400)

    def test_real_resolver_rejects_multiple_stores(self):
        self.create_order()
        Tienda.objects.create(nombre='Other store', id_usuario_propietario=self.other)
        self.assertEqual(self.api.get(self.url).status_code, 503)

    def test_missing_store_returns_503_without_creating_one(self):
        self.store.delete()
        self.assertEqual(self.api.get(self.url).status_code, 503)
        self.assertFalse(Tienda.objects.exists())

    def test_endpoint_cannot_create_update_or_verify_transfers(self):
        order = self.create_order()
        for method in ('post', 'put', 'patch', 'delete'):
            response = getattr(self.api, method)(self.url, {'estado': 'pagado'}, format='json')
            self.assertEqual(response.status_code, 405)
        order.refresh_from_db()
        self.assertEqual(order.estado, 'pendiente')
        self.assertEqual(Pedido.objects.count(), 1)


class AprobarTransferenciaManualTests(TransferFixtureMixin, TestCase):
    def approval_url(self, order):
        return f'/api/pagos/transferencias/{order.pk}/aprobar/'

    def test_owner_approves_pending_transfer_and_it_leaves_pending_list(self):
        order = self.create_order()
        response = self.api.post(self.approval_url(order), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['exito'])
        self.assertEqual(response.data['data'], {'id_pedido': order.pk, 'estado': 'pagado'})
        order.refresh_from_db()
        self.assertEqual(order.estado, 'pagado')
        self.assertEqual(self.api.get(self.url).data['data'], [])

    def test_repeated_approval_is_idempotent(self):
        order = self.create_order()
        self.assertEqual(self.api.post(self.approval_url(order)).status_code, 200)
        response = self.api.post(self.approval_url(order))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('ya estaba aprobada', response.data['mensaje'])

    def test_linkify_and_other_payment_methods_cannot_be_manually_approved(self):
        for method in ('Linkify', 'Transbank', 'PayPal'):
            order = self.create_order(medio_pago=method, metodo_pago=method)
            response = self.api.post(self.approval_url(order))
            self.assertEqual(response.status_code, 409, response.data)
            order.refresh_from_db()
            self.assertEqual(order.estado, 'pendiente')

    def test_non_pending_transfer_cannot_be_approved(self):
        for state in ('enviado', 'cancelado'):
            order = self.create_order(estado=state)
            response = self.api.post(self.approval_url(order))
            self.assertEqual(response.status_code, 409, response.data)
            order.refresh_from_db()
            self.assertEqual(order.estado, state)

    def test_other_store_order_is_not_disclosed_or_changed(self):
        foreign_store = Tienda.objects.create(nombre='Foreign', id_usuario_propietario=self.other)
        order = self.create_order(tienda=foreign_store)
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.store):
            response = self.api.post(self.approval_url(order))
        self.assertEqual(response.status_code, 404, response.data)
        order.refresh_from_db()
        self.assertEqual(order.estado, 'pendiente')

    def test_non_owner_and_anonymous_cannot_approve(self):
        order = self.create_order()
        self.api.force_authenticate(self.buyer)
        self.assertEqual(self.api.post(self.approval_url(order)).status_code, 403)
        self.api.force_authenticate(user=None)
        self.assertEqual(self.api.post(self.approval_url(order)).status_code, 401)
        order.refresh_from_db()
        self.assertEqual(order.estado, 'pendiente')


class RepositorioTransferencias(RepositorioFalso):
    """Reutiliza el repositorio de Linkify, vinculando también stock SQL aislado."""
    def __init__(self, producto_id):
        super().__init__()
        self.producto_id = producto_id

    def get_by_id(self, tienda_id, producto_id):
        product = super().get_by_id(tienda_id, producto_id)
        if product:
            product['id_producto'] = self.producto_id
        return product


class RegistroTransferenciasTests(TransferFixtureMixin, TestCase):
    checkout_url = '/api/checkout/pedidos/'

    def setUp(self):
        super().setUp()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.buyer).key)
        ConfiguracionEntrega.objects.create(tienda=self.store, datos={'pickup': {'enabled': True}})
        self.product = Producto.objects.create(nombre='Producto transferencia', precio=10000, stock=7,
                                              id_tienda=self.store)
        self.repository = RepositorioTransferencias(self.product.pk)
        patcher = patch('apps.core.presentation.checkout.ProductRepository', return_value=self.repository)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.payload = {
            'clave_checkout': str(uuid4()),
            'items': [{'producto_id': 'prod-1', 'sku': 'QA-M', 'cantidad': 2}],
            'contacto': {'nombre': 'Comprador', 'email': 'buyer@example.com', 'telefono': '+56912345678'},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Retiro',
        }

    def test_transfer_checkout_registers_pending_order_and_contact(self):
        response = self.api.post(self.checkout_url, self.payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        order = Pedido.objects.get()
        self.assertEqual(order.pk, response.data['data']['id_pedido'])
        self.assertEqual(order.tienda, self.store)
        self.assertEqual(order.comprador, self.buyer)
        self.assertEqual(order.contacto, self.payload['contacto'])
        self.assertEqual(order.nombre_contacto, 'Comprador')
        self.assertEqual(order.correo_contacto, 'buyer@example.com')
        self.assertEqual(order.telefono_contacto, '+56912345678')
        self.assertEqual(order.medio_pago, 'Transferencia')
        self.assertEqual(order.metodo_pago, 'Transferencia')
        self.assertEqual(order.estado, 'pendiente')
        self.assertEqual(order.monto_total, Decimal('20000.00'))
        self.assertTrue(order.identificador.startswith('ORD-'))
        self.assertNotIn('url_pago', response.data['data'])
        self.api.force_authenticate(self.owner)
        pending = self.api.get(self.url).data['data']
        self.assertEqual(pending[0]['identificador'], order.identificador)

    def test_guest_transfer_preserves_contact_and_store(self):
        self.api.credentials()
        response = self.api.post(self.checkout_url, self.payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        order = Pedido.objects.get()
        self.assertIsNone(order.comprador)
        self.assertEqual(order.tienda, self.store)
        self.assertEqual(order.contacto, self.payload['contacto'])
        self.assertEqual(order.estado, 'pendiente')

    def test_idempotent_retry_does_not_duplicate_transfer_items_or_stock_decrease(self):
        first = self.api.post(self.checkout_url, self.payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        second = self.api.post(self.checkout_url, self.payload, format='json')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data['data']['id_pedido'], second.data['data']['id_pedido'])
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(ItemPedido.objects.count(), 1)
        self.assertEqual(self.repository.descuentos, [('QA-M', 2)])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)
        self.api.force_authenticate(self.owner)
        self.assertEqual(len(self.api.get(self.url).data['data']), 1)

    def test_reusing_checkout_key_with_changed_contact_is_rejected_without_stock_changes(self):
        first = self.api.post(self.checkout_url, self.payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        changed = {**self.payload, 'contacto': {**self.payload['contacto'], 'email': 'changed@example.com'}}
        self.assertEqual(self.api.post(self.checkout_url, changed, format='json').status_code, 400)
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(self.repository.descuentos, [('QA-M', 2)])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)

    def test_other_checkout_payment_methods_do_not_become_pending_transfers(self):
        from apps.core.models import ConfiguracionTransbank, ConfiguracionPayPal, ConfiguracionMercadoPago
        ConfiguracionTransbank.objects.create(id_tienda=self.store, activo=True, codigo_comercio='qa', api_key='qa')
        ConfiguracionPayPal.objects.create(id_tienda=self.store, activo=True, client_id='qa', client_secret='qa')
        ConfiguracionMercadoPago.objects.create(id_tienda=self.store, activo=True, public_key='qa', access_token='qa')
        for method in ('Transbank', 'PayPal', 'MercadoPago'):
            data = {**self.payload, 'clave_checkout': str(uuid4()), 'medio_pago': method}
            order_count = Pedido.objects.count()
            discounts = list(self.repository.descuentos)
            response = self.api.post(self.checkout_url, data, format='json')
            if method in ('PayPal', 'MercadoPago'):
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(Pedido.objects.count(), order_count)
                self.assertEqual(self.repository.descuentos, discounts)
            else:
                self.assertEqual(response.status_code, 201, response.data)
                order = Pedido.objects.get(pk=response.data['data']['id_pedido'])
                self.assertEqual(order.medio_pago, method)
        self.api.force_authenticate(self.owner)
        self.assertEqual(self.api.get(self.url).data['data'], [])
