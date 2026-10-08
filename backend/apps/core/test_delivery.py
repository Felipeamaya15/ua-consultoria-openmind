from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.models import ConfiguracionPago
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from apps.core.delivery import delivery_data, delivery_defaults
from apps.core.models import ConfiguracionEntrega, ItemPedido, Pedido, Tienda
from apps.core.presentation.serializers import ShippingConfigurationSerializer
from apps.core.presentation.views import AlternativasEntregaAPIView, ConfiguracionEntregaAPIView


class DeliveryContractTests(SimpleTestCase):
    """Validación del contrato sin PostgreSQL ni MongoDB."""

    def test_defaults_are_disabled_and_independent(self):
        defaults = delivery_defaults()
        self.assertTrue(all(value['enabled'] is False for value in defaults.values()))
        defaults['pickup']['enabled'] = True
        self.assertFalse(delivery_defaults()['pickup']['enabled'])

    def test_complete_configuration_and_partial_toggle_are_valid(self):
        data = delivery_defaults()
        data['pickup'] = {'enabled': True, 'address': 'Calle 123', 'schedule': 'Lun–Vie 9–18'}
        serializer = ShippingConfigurationSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['pickup'], data['pickup'])
        serializer = ShippingConfigurationSerializer(data={'pickup': {'enabled': False}}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data, {'pickup': {'enabled': False}})

    def test_boolean_requires_json_boolean(self):
        for section in ('pickup', 'chilexpress', 'starken'):
            for value in ('true', 'false', 1, 0, None, [], {}):
                with self.subTest(section=section, value=value):
                    serializer = ShippingConfigurationSerializer(data={section: {'enabled': value}}, partial=True)
                    self.assertFalse(serializer.is_valid())

    def test_address_and_schedule_require_strings(self):
        for field in ('address', 'schedule'):
            for value in (12, False, None, [], {}, 'a' * 501):
                with self.subTest(field=field, value=value):
                    serializer = ShippingConfigurationSerializer(data={'pickup': {field: value}}, partial=True)
                    self.assertFalse(serializer.is_valid())

    def test_unknown_fields_and_invalid_nested_objects_are_rejected(self):
        for data in ({'tienda_id': 99}, {'pickup': {'unexpected': 'value'}},
                     {'pickup': []}, {'pickup': None}, [], 'configuration'):
            with self.subTest(data=data):
                serializer = ShippingConfigurationSerializer(data=data, partial=True)
                self.assertFalse(serializer.is_valid())

    def test_put_requires_complete_configuration(self):
        for data in ({}, {'pickup': {'enabled': True}},
                     {**delivery_defaults(), 'pickup': {'enabled': True}}):
            serializer = ShippingConfigurationSerializer(data=data)
            self.assertFalse(serializer.is_valid())

    def test_carrier_credentials_cannot_be_stored_in_json(self):
        for field in ('apiKey', 'accountId'):
            serializer = ShippingConfigurationSerializer(
                data={'chilexpress': {field: 'secret'}}, partial=True)
            self.assertFalse(serializer.is_valid())

    def test_read_normalizes_partial_or_malformed_data_and_masks_credentials(self):
        for data in (None, [], 'invalid', {'pickup': None}, {'pickup': {'enabled': 'true', 'address': 1}}):
            self.assertEqual(delivery_data(data), delivery_defaults())
        config = delivery_data({'chilexpress': {'enabled': True, 'apiKey': 'secret', 'accountId': 'account'},
                                'pickup': {'enabled': True, 'address': 'Local'}})
        self.assertTrue(config['chilexpress']['enabled'])
        self.assertEqual(config['chilexpress']['apiKey'], '')
        self.assertEqual(config['chilexpress']['accountId'], '')
        self.assertEqual(config['pickup'], {'enabled': True, 'address': 'Local', 'schedule': ''})

    def test_get_default_response_without_database(self):
        factory = APIRequestFactory()
        request = factory.get('/api/entregas/configuracion/')
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))
        with patch('apps.core.presentation.views.resolver_tienda') as resolver, patch(
            'apps.core.delivery.ConfiguracionEntrega.objects.filter'
        ) as query:
            query.return_value.first.return_value = None
            response = ConfiguracionEntregaAPIView.as_view()(request)
        resolver.assert_called_once()
        self.assertEqual(resolver.call_args.kwargs, {'exigir_propietario': True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'], delivery_defaults())

    def test_public_get_returns_saved_pickup_without_secrets(self):
        datos = {'pickup': {'enabled': True, 'address': 'Local', 'schedule': '9–18'},
                 'starken': {'apiKey': 'secret'}}
        with patch('apps.core.presentation.views.resolver_tienda'), patch(
            'apps.core.delivery.ConfiguracionEntrega.objects.filter'
        ) as query:
            query.return_value.first.return_value = SimpleNamespace(datos=datos)
            response = AlternativasEntregaAPIView.as_view()(APIRequestFactory().get('/'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['pickup'], datos['pickup'])
        self.assertNotIn('secret', str(response.data))

    def test_invalid_patch_returns_http_400_before_database_write(self):
        request = APIRequestFactory().patch('/', {'pickup': {'enabled': 'true'}}, format='json')
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))
        with patch('apps.core.presentation.views.resolver_tienda'), patch(
            'apps.core.presentation.views.ConfiguracionEntrega.objects.get_or_create'
        ) as create:
            response = ConfiguracionEntregaAPIView.as_view()(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error']['codigo'], 'ERROR_VALIDACION')
        create.assert_not_called()


class DeliveryConfigurationTests(TestCase):
    url = '/api/entregas/configuracion/'
    public_url = '/api/entregas/alternativas/'

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='delivery-owner', is_staff=True)
        self.other = get_user_model().objects.create_user(username='delivery-other', is_staff=True)
        self.store = Tienda.objects.create(nombre='Delivery store', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.configuration = delivery_defaults()
        self.configuration['pickup'] = {'enabled': True, 'address': 'Av. Providencia 1234', 'schedule': 'Lun–Sáb 9–18'}

    def test_get_without_configuration_returns_defaults_without_creating_row(self):
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'], delivery_defaults())
        self.assertFalse(ConfiguracionEntrega.objects.exists())

    def test_save_pickup_and_get_saved_configuration(self):
        response = self.api.put(self.url, self.configuration, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(ConfiguracionEntrega.objects.get(tienda=self.store).datos, self.configuration)
        self.assertEqual(self.api.get(self.url).data['data'], self.configuration)
        self.assertEqual(self.api.get(self.public_url).data['data'], self.configuration)

    def test_partial_save_and_disable_preserve_address_schedule_and_carriers(self):
        self.configuration['chilexpress']['enabled'] = True
        self.api.put(self.url, self.configuration, format='json')
        response = self.api.patch(self.url, {'pickup': {'enabled': False}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        expected = deepcopy(self.configuration)
        expected['pickup']['enabled'] = False
        self.assertEqual(response.data['data'], expected)
        self.assertEqual(self.api.get(self.url).data['data'], expected)
        self.assertEqual(ConfiguracionEntrega.objects.count(), 1)

    def test_patch_can_create_configuration_with_defaults(self):
        response = self.api.patch(self.url, {'pickup': self.configuration['pickup']}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'], self.configuration)

    def test_non_owner_cannot_read_or_configure_store(self):
        self.api.force_authenticate(self.other)
        for method in ('get', 'put', 'patch'):
            response = getattr(self.api, method)(self.url, self.configuration if method != 'get' else {}, format='json')
            self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(ConfiguracionEntrega.objects.exists())

    def test_anonymous_can_only_read_public_alternatives(self):
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get(self.url).status_code, 401)
        self.assertEqual(self.api.patch(self.url, {'pickup': {'enabled': True}}, format='json').status_code, 401)
        response = self.api.get(self.public_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'], delivery_defaults())

    def test_foreign_store_identifiers_are_rejected(self):
        for response in (
            self.api.get(self.url, {'tienda_id': self.store.pk + 1}),
            self.api.get(self.url, HTTP_X_TIENDA_ID=str(self.store.pk + 1)),
            self.api.patch(self.url, {'tienda_id': self.store.pk + 1, 'pickup': {'enabled': True}}, format='json'),
        ):
            self.assertEqual(response.status_code, 400)
        self.assertFalse(ConfiguracionEntrega.objects.exists())

    def test_multiple_stores_are_not_silently_selected(self):
        Tienda.objects.create(nombre='Other store', id_usuario_propietario=self.other)
        self.assertEqual(self.api.get(self.url).status_code, 503)
        self.assertEqual(self.api.get(self.public_url).status_code, 503)
        self.assertFalse(ConfiguracionEntrega.objects.exists())

    def test_invalid_payload_returns_400_without_mutation(self):
        ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.configuration)
        for data in ({'pickup': {'enabled': 'true'}}, {'pickup': {'address': 123}},
                     {'pickup': {'schedule': []}}, {'pickup': {'extra': 'value'}},
                     {'chilexpress': {'apiKey': 'secret'}}, {'unknown': {}}, {'pickup': None}):
            response = self.api.patch(self.url, data, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(ConfiguracionEntrega.objects.get().datos, self.configuration)


class DeliveryCheckoutTests(TestCase):
    url = '/api/checkout/pedidos/'

    def setUp(self):
        owner = get_user_model().objects.create_user(username='delivery-checkout-owner')
        self.store = Tienda.objects.create(nombre='Checkout delivery', id_usuario_propietario=owner)
        self.api = APIClient()
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.configuration = delivery_defaults()
        self.configuration['pickup'] = {'enabled': True, 'address': 'Local', 'schedule': '9–18'}
        self.payload = {
            'clave_checkout': str(uuid4()),
            'items': [{'producto_id': 'prod-1', 'sku': 'DELIVERY-SKU', 'cantidad': 1}],
            'contacto': {'nombre': 'Buyer', 'email': 'buyer@example.com'},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Retiro',
        }
        patcher = patch('apps.core.presentation.checkout.ProductRepository')
        self.repository_class = patcher.start()
        self.addCleanup(patcher.stop)
        self.repository = self.repository_class.return_value
        self.repository.get_by_id.return_value = {
            '_id': 'prod-1', 'nombre': 'Product', 'activo': True,
            'variantes': [{'sku': 'DELIVERY-SKU', 'precio': 1000, 'stock': 5}],
        }

    def test_no_configuration_rejects_pickup_before_creating_order_or_stock_changes(self):
        response = self.api.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('metodo_entrega', response.data)
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ItemPedido.objects.exists())
        self.repository_class.assert_not_called()

    def test_disabled_methods_are_rejected(self):
        ConfiguracionEntrega.objects.create(tienda=self.store, datos=delivery_defaults())
        for method in ('Retiro', 'Chilexpress', 'Starken'):
            data = {**self.payload, 'metodo_entrega': method,
                    'direccion': {'street': 'Street', 'number': '1', 'apt': '', 'city': 'City', 'region': ''}}
            response = self.api.post(self.url, data, format='json')
            self.assertEqual(response.status_code, 400)
        self.assertFalse(Pedido.objects.exists())
        self.repository_class.assert_not_called()

    def test_enabled_pickup_creates_order_with_free_shipping(self):
        ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.configuration)
        response = self.api.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        order = Pedido.objects.get()
        self.assertEqual(order.entrega['metodo'], 'Retiro')
        self.assertEqual(order.costo_envio, 0)
        self.assertEqual(order.monto_total, 1000)
        self.repository.decrease_stock.assert_called_once_with(str(self.store.pk), 'DELIVERY-SKU', 1)

    def test_retry_of_existing_order_survives_disable_without_new_stock_changes(self):
        config = ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.configuration)
        first = self.api.post(self.url, self.payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        config.datos['pickup']['enabled'] = False
        config.save()
        retry = self.api.post(self.url, self.payload, format='json')
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data['data']['id_pedido'], first.data['data']['id_pedido'])
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(self.repository.decrease_stock.call_count, 1)
        new_data = {**self.payload, 'clave_checkout': str(uuid4())}
        self.assertEqual(self.api.post(self.url, new_data, format='json').status_code, 400)
