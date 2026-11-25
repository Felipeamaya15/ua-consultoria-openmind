"""Regresiones verificadas durante la revisión integral; no conecta a pasarelas reales."""
import json
from unittest.mock import patch

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import TestCase, RequestFactory
from rest_framework.test import APIClient

from apps.core.admin import ProductoAdmin
from apps.core.models import ConfiguracionPago, Pedido, Producto, Tienda
from apps.core.test_linkify_notificacion import firmar, CLAVE


class StabilityHTTPTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='stability-owner', is_staff=True)
        self.customer = get_user_model().objects.create_user(username='stability-customer')
        self.store = Tienda.objects.create(nombre='Stability', id_usuario_propietario=self.owner)
        ConfiguracionPago.objects.create(tienda=self.store, datos={'linkify': {'enabled': True,
            'fields': {'idCuenta': 'CUENTA-QA', 'clavePrivada': CLAVE}}})
        self.order = Pedido.objects.create(tienda=self.store, monto_total='1000.00', medio_pago='Linkify',
                                           correo_contacto='buyer@example.test')
        self.api = APIClient()

    def webhook(self, payload, signed=True):
        body = json.dumps(payload).encode()
        return self.api.generic('POST', '/api/pagos/linkify/webhook/', body, content_type='application/json',
                                **({'HTTP_X_LINKIFY_CONFIRMATION': firmar(body)} if signed else {}))

    def test_legacy_webhook_rejects_unsigned_paid_notification(self):
        response = self.webhook({'reference': self.order.identificador, 'status': 'PAID'}, signed=False)
        self.assertEqual(response.status_code, 401, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'pendiente')

    def test_legacy_webhook_preserves_signed_reference_status_contract_and_idempotency(self):
        payload = {'buy_order': self.order.identificador, 'status': 'VERIFIED', 'amount': '1000.00'}
        for _ in range(2):
            self.assertEqual(self.webhook(payload).status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'pagado')

    def test_webhook_does_not_pay_other_method_or_cancelled_order(self):
        for changes in ({'medio_pago': 'Transferencia'}, {'medio_pago': 'Linkify', 'estado': 'cancelado'}):
            Pedido.objects.filter(pk=self.order.pk).update(**changes)
            response = self.webhook({'reference': self.order.identificador, 'status': 'PAID', 'monto': 1000})
            self.assertEqual(response.status_code, 409, response.data)

    def test_webhook_rejects_fractional_mismatch_and_nonfinite_amount(self):
        for amount, expected in (('1000.99', 409), ('NaN', 400), ('Infinity', 400)):
            response = self.webhook({'reference': self.order.identificador, 'status': 'PAID', 'amount': amount})
            self.assertEqual(response.status_code, expected, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'pendiente')

    def test_manual_linkify_verification_cannot_pay_manual_transfer(self):
        Pedido.objects.filter(pk=self.order.pk).update(medio_pago='Transferencia')
        self.api.force_authenticate(self.owner)
        with patch('apps.catalog.infrastructure.adapters.linkify_adapter.LinkifyAdapter') as adapter:
            response = self.api.post('/api/pagos/linkify/verificar/', {'pedido_id': self.order.pk}, format='json')
            self.assertEqual(response.status_code, 409)
            adapter.assert_not_called()

    def test_payment_configuration_rejects_malformed_fields_and_null_credentials(self):
        self.api.force_authenticate(self.owner)
        original = ConfiguracionPago.objects.get(tienda=self.store).datos
        for value in ({'linkify': None}, {'linkify': {'enabled': 'true', 'fields': {}}},
                      {'linkify': {'enabled': True, 'fields': []}},
                      {'linkify': {'enabled': True, 'fields': {'idCuenta': 'qa', 'clavePrivada': None}}}):
            response = self.api.put('/api/pagos/configuracion/', value, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(ConfiguracionPago.objects.get(tienda=self.store).datos, original)

    def test_store_orders_preserve_array_contract_and_reject_other_user_or_store(self):
        self.api.force_authenticate(self.owner)
        response = self.api.get('/api/tienda/pedidos/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(response.data[0]['identificador'], self.order.identificador)
        self.assertEqual(self.api.get('/api/tienda/pedidos/?tienda_id=999').status_code, 400)
        self.api.force_authenticate(self.customer)
        self.assertEqual(self.api.get('/api/tienda/pedidos/').status_code, 403)
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get('/api/tienda/pedidos/').status_code, 401)

    def test_gateway_http_rejects_foreign_store_before_external_call(self):
        for url in ('/api/pagos/paypal/iniciar/', '/api/pagos/paypal/capturar/',
                    '/api/catalog/pagos/transbank/iniciar/', '/api/catalog/pagos/transbank/confirmar/'):
            response = self.api.post(url, {'tienda_id': 999, 'id_tienda': 999}, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_missing_paypal_configuration_returns_controlled_error(self):
        response = self.api.post('/api/pagos/paypal/iniciar/', {'tienda_id': self.store.pk}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['error']['codigo'], 'PAYPAL_NO_CONFIGURADO')

    def test_private_store_endpoints_reject_visitors_and_nonowners(self):
        urls = ('/api/pagos/configuracion/', '/api/entregas/configuracion/',
                '/api/pagos/transferencias/pendientes/', '/api/tienda/pedidos/',
                '/api/pagos/mi-tienda/', '/api/auth/emprendedor/perfil/',
                *(f'/api/catalog/tiendas/{self.store.pk}/configuracion/{method}/'
                  for method in ('transbank', 'paypal', 'mercadopago')))
        for user, expected in ((None, 401), (self.customer, 403)):
            self.api.force_authenticate(user)
            for url in urls:
                with self.subTest(user=user, url=url):
                    self.assertEqual(self.api.get(url).status_code, expected)

    def test_public_payment_configuration_omits_secrets_and_incomplete_methods(self):
        from apps.core.models import ConfiguracionPayPal, ConfiguracionTransbank, ConfiguracionMercadoPago
        from apps.core.payments import TRANSFER_PUBLIC_FIELDS
        ConfiguracionPayPal.objects.create(id_tienda=self.store, activo=True, client_id='qa', client_secret='')
        ConfiguracionTransbank.objects.create(id_tienda=self.store, activo=True, codigo_comercio='qa', api_key='')
        ConfiguracionMercadoPago.objects.create(id_tienda=self.store, activo=True, public_key='qa', access_token='')
        ConfiguracionPago.objects.filter(tienda=self.store).update(datos={
            'linkify': {'enabled': True, 'fields': {'idCuenta': 'qa', 'clavePrivada': ' '}},
            'transfer': {'enabled': True, 'fields': {
                **{field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}, 'api_key': 'private-value'}},
        })
        response = self.api.get('/api/pagos/activos/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data['data']), {'transfer'})
        self.assertEqual(set(response.data['data']['transfer']['fields']), set(TRANSFER_PUBLIC_FIELDS))
        self.assertNotIn('private-value', response.content.decode())

    def test_webhook_rejects_nonobject_and_malformed_json(self):
        for url in ('/api/pagos/linkify/webhook/', '/api/pagos/linkify/notificacion/'):
            for body in (b'[]', b'{invalid'):
                self.assertEqual(self.api.generic('POST', url, body, content_type='application/json').status_code, 400)

    def test_django_admin_creation_preserves_sql_mongo_link_and_scoped_repository_signature(self):
        request = RequestFactory().post('/admin/core/producto/add/')
        request.user = self.owner
        product = Producto(nombre='Admin', precio=10, stock=3, id_tienda=self.store)
        admin = ProductoAdmin(Producto, AdminSite())
        with patch('apps.core.admin.ProductRepository') as repository, patch.object(admin, 'message_user'):
            admin.save_model(request, product, None, change=False)
            args = repository.return_value.create.call_args.args
            self.assertEqual(args[0], str(self.store.pk))
            self.assertEqual(args[1]['id_producto'], product.pk)
        self.assertTrue(Producto.objects.filter(pk=product.pk).exists())
