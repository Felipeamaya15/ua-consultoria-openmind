"""Horarios, dirección firmada, compatibilidad, API y snapshots de retiro v2."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.core import signing
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIClient
from apps.core.pickup import DAYS, SALT, grouped_hours, readable_pickup, validate_pickup
from apps.core.delivery import delivery_defaults, delivery_for_store
from apps.core.models import Tienda, ConfiguracionEntrega, ConfiguracionPago, Pedido
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.infrastructure.pickup_address import GoogleAddressProvider, AddressProviderError


def make_pickup(tienda):
    location = {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'street': 'Avenida Providencia',
                'number': '1234', 'reference': 'Local 2'}
    location['verification'] = signing.dumps({'tienda': str(tienda.pk),
        'address': {k: location[k] for k in ('region', 'comuna', 'street', 'number')}, 'special': False, 'place_id': 'test-place'}, salt=SALT)
    hours = {day: {'enabled': day == 'mon', 'start': '09:00' if day == 'mon' else '', 'end': '18:00' if day == 'mon' else ''} for day, _ in DAYS}
    return readable_pickup({'enabled': True, 'version': 2, 'location': location, 'hours': hours, 'address': '', 'schedule': ''})


class PickupTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='pickup-v2')
        self.store = Tienda.objects.create(nombre='Pickup', id_usuario_propietario=self.owner)
        self.api = APIClient(); self.api.force_authenticate(self.owner)
        self.config = delivery_defaults(); self.config['pickup'] = make_pickup(self.store)
        self.url = '/api/entregas/configuracion/'

    def save(self, data=None, expected=200):
        response = self.api.put(self.url, self.config if data is None else data, format='json')
        self.assertEqual(response.status_code, expected, response.data)
        return response

    def test_one_day_save_reload_public_summary_and_private_proof(self):
        self.save()
        self.assertEqual(self.api.get(self.url).data['data'], self.config)
        self.assertEqual(ConfiguracionEntrega.objects.count(), 1)
        public = self.api.get('/api/entregas/alternativas/').data['data']['pickup']
        self.assertTrue(public['enabled']); self.assertIn('Lunes: 09:00 a 18:00', public['schedule'])
        self.assertIn('Providencia', public['address']); self.assertNotIn('verification', public['location'])
        self.config['pickup']['hours']['mon']['end'] = '19:00'
        self.save(); self.assertEqual(ConfiguracionEntrega.objects.count(), 1)
        self.assertIn('19:00', self.api.get(self.url).data['data']['pickup']['schedule'])

    def test_invalid_hours_address_and_verification_are_rejected_without_writes(self):
        changes = [({'location': {'region': ''}}, 'location.region'), ({'location': {'comuna': 'Valparaíso'}}, 'location.comuna'),
                   ({'location': {'street': ''}}, 'location.street'), ({'location': {'number': ''}}, 'location.number'),
                   ({'location': {'verification': 'inventado'}}, 'location.verification'),
                   ({'hours': {'mon': {'end': '08:00'}}}, 'hours.mon.end'),
                   ({'hours': {'mon': {'start': ''}}}, 'hours.mon.start'),
                   ({'hours': {'mon': {'end': ''}}}, 'hours.mon.end'),
                   ({'hours': {'mon': {'enabled': False}}}, 'hours')]
        for changes, field in changes:
            with self.subTest(field=field):
                config = deepcopy(self.config)
                for section, fields in changes.items():
                    for key, value in fields.items():
                        if isinstance(value, dict): config['pickup'][section][key].update(value)
                        else: config['pickup'][section][key] = value
                response = self.save(config, 400)
                self.assertIn(field, response.data['error']['detalles']['pickup'])
                self.assertFalse(ConfiguracionEntrega.objects.exists())

    def test_signed_address_cannot_be_reused_for_another_store(self):
        self.assertIn('location.verification', validate_pickup(self.config['pickup'], 999))

    @patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': '', 'PICKUP_GOOGLE_GEOCODING_KEY': ''})
    @patch('apps.core.infrastructure.pickup_address.requests.get')
    def test_manual_address_without_provider_persists_as_manual_not_google(self, external):
        self.config['pickup']['location']['verification'] = ''
        self.config['pickup']['validation_method'] = 'google'  # el cliente no decide la procedencia
        response = self.save()
        saved = response.data['data']['pickup']
        self.assertEqual(saved['validation_method'], 'manual')
        proof = signing.loads(saved['location']['verification'], salt=SALT)
        self.assertEqual(proof['provider'], 'manual')
        self.assertFalse(proof['special'])
        self.assertEqual(self.api.get(self.url).data['data']['pickup'], saved)
        public = self.api.get('/api/entregas/alternativas/').data['data']['pickup']
        self.assertTrue(public['enabled'])
        self.assertEqual(public['validation_method'], 'manual')
        self.assertNotIn('verification', public['location'])
        self.assertIn('Providencia', public['address'])
        self.assertIn('09:00 a 18:00', public['schedule'])
        external.assert_not_called()

    @patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': '', 'PICKUP_GOOGLE_GEOCODING_KEY': ''})
    def test_manual_http_request_cannot_skip_required_fields_territory_or_hours(self):
        self.config['pickup']['location']['verification'] = ''
        for field in ('region', 'comuna', 'street', 'number'):
            for value in ('', '   '):
                with self.subTest(field=field, value=value):
                    config = deepcopy(self.config)
                    config['pickup']['location'][field] = value
                    response = self.save(config, 400)
                    self.assertIn(f'location.{field}', response.data['error']['detalles']['pickup'])
                    self.assertFalse(ConfiguracionEntrega.objects.exists())
        for changes, field in [({'location': {'comuna': 'Valparaíso'}}, 'location.comuna'),
                               ({'hours': {'mon': {'end': '08:00'}}}, 'hours.mon.end'),
                               ({'hours': {'mon': {'start': ''}}}, 'hours.mon.start'),
                               ({'hours': {'mon': {'enabled': False}}}, 'hours')]:
            config = deepcopy(self.config)
            for section, values in changes.items():
                for key, value in values.items():
                    if isinstance(value, dict): config['pickup'][section][key].update(value)
                    else: config['pickup'][section][key] = value
            response = self.save(config, 400)
            self.assertIn(field, response.data['error']['detalles']['pickup'])
            self.assertFalse(ConfiguracionEntrega.objects.exists())

    @patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': 'google', 'PICKUP_GOOGLE_GEOCODING_KEY': 'test-not-real'})
    def test_configured_provider_requires_proof_regardless_of_client_manual_flag(self):
        self.config['pickup']['location']['verification'] = ''
        self.config['pickup']['validation_method'] = 'manual'
        response = self.save(expected=400)
        self.assertIn('location.verification', response.data['error']['detalles']['pickup'])
        self.assertFalse(ConfiguracionEntrega.objects.exists())

    def test_manual_receipt_survives_provider_activation_but_cannot_cover_other_address(self):
        self.config['pickup']['location']['verification'] = ''
        with patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': '', 'PICKUP_GOOGLE_GEOCODING_KEY': ''}):
            saved = deepcopy(self.save().data['data'])
        with patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': 'google', 'PICKUP_GOOGLE_GEOCODING_KEY': 'test-not-real'}):
            self.assertTrue(delivery_for_store(self.store)['pickup']['enabled'])
            self.save(saved)
            saved['pickup']['location']['street'] = 'Calle distinta'
            response = self.save(saved, 400)
            self.assertIn('location.verification', response.data['error']['detalles']['pickup'])
            self.assertNotIn('Calle distinta', self.api.get(self.url).data['data']['pickup']['address'])

    @patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': '', 'PICKUP_GOOGLE_GEOCODING_KEY': ''})
    def test_manual_checkout_free_shipping_snapshot_and_unchanged_payments(self):
        self.config['pickup']['location']['verification'] = ''
        self.config['chilexpress']['enabled'] = True
        self.config['starken']['enabled'] = True
        self.save()
        payment_data = {'transfer': {'enabled': True, 'fields': {f: 'qa' for f in TRANSFER_PUBLIC_FIELDS}}}
        ConfiguracionPago.objects.create(tienda=self.store, datos=payment_data)
        payload = {'clave_checkout': str(uuid4()), 'items': [{'producto_id': 'prod', 'sku': 'SKU', 'cantidad': 1}],
                   'contacto': {'nombre': 'Buyer', 'email': 'buyer@example.com'}, 'medio_pago': 'Transferencia', 'metodo_entrega': 'Retiro'}
        with patch('apps.core.presentation.checkout.ProductRepository') as repo, patch('apps.core.presentation.checkout.validate_quote') as quote:
            repo.return_value.get_by_id.return_value = {'_id': 'prod', 'nombre': 'Product', 'activo': True,
                'variantes': [{'sku': 'SKU', 'precio': 1000, 'stock': 5}]}
            response = APIClient().post('/api/checkout/pedidos/', payload, format='json')
            self.assertEqual(response.status_code, 201, response.data)
            quote.assert_not_called()
        order = Pedido.objects.get()
        original = deepcopy(order.entrega)
        self.assertEqual(order.costo_envio, 0)
        self.assertEqual(order.monto_total, 1000)
        self.assertEqual(order.medio_pago, 'Transferencia')
        self.assertEqual(order.entrega['retiro']['validation_method'], 'manual')
        self.assertEqual(order.entrega['retiro']['hours'], self.config['pickup']['hours'])
        self.assertNotIn('verification', order.entrega['retiro']['location'])
        self.config['pickup']['location']['street'] = 'Otro local'
        self.config['pickup']['hours']['mon']['end'] = '19:00'
        self.save()
        order.refresh_from_db()
        self.assertEqual(order.entrega, original)
        self.assertEqual(ConfiguracionPago.objects.get(tienda=self.store).datos, payment_data)
        public = delivery_for_store(self.store)
        self.assertTrue(public['chilexpress']['enabled'])
        self.assertTrue(public['starken']['enabled'])

    @patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': 'google', 'PICKUP_GOOGLE_GEOCODING_KEY': 'test-not-real'})
    @patch('apps.core.infrastructure.pickup_address.GoogleAddressProvider.search')
    def test_suggestion_endpoint_issues_proof_bound_to_owner_store_and_address(self, search):
        row = {key: self.config['pickup']['location'][key] for key in ('region', 'comuna', 'street', 'number', 'reference')}
        search.return_value = [{**row, 'place_id': 'place', 'special': False}]
        response = self.api.post('/api/entregas/retiro/direcciones/', {
            'region': row['region'], 'comuna': row['comuna'], 'query': 'Providencia 1234'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response['Cache-Control'], 'no-store')
        candidate = response.data['data'][0]
        self.config['pickup']['location'] = candidate
        self.save()
        candidate['street'] = 'Dirección inventada'
        self.save(expected=400)

    def test_special_address_without_number_requires_provider_signed_exception(self):
        location = self.config['pickup']['location']
        location['number'] = ''; location['street'] = 'Establecimiento reconocido'
        location['verification'] = signing.dumps({'tienda': str(self.store.pk),
            'address': {k: location[k] for k in ('region', 'comuna', 'street', 'number')}, 'special': True}, salt=SALT)
        self.save()
        location['verification'] = signing.dumps({'tienda': str(self.store.pk),
            'address': {k: location[k] for k in ('region', 'comuna', 'street', 'number')}, 'special': False}, salt=SALT)
        response = self.save(expected=400)
        self.assertIn('location.number', response.data['error']['detalles']['pickup'])

    def test_disabled_incomplete_draft_does_not_block_carriers_or_payments(self):
        self.config['pickup'] = {'enabled': False, 'address': '', 'schedule': '', 'version': 2}
        self.config['chilexpress']['enabled'] = True; self.config['starken']['enabled'] = True
        self.save(); data = self.api.get(self.url).data['data']
        self.assertTrue(data['chilexpress']['enabled']); self.assertTrue(data['starken']['enabled'])
        self.assertFalse(data['pickup']['enabled'])

    def test_legacy_preserved_but_new_activation_or_edits_require_v2(self):
        legacy = delivery_defaults(); legacy['pickup'] = {'enabled': True, 'address': 'Local antiguo', 'schedule': 'Lun–Vie 9–18'}
        ConfiguracionEntrega.objects.create(tienda=self.store, datos=legacy)
        self.save(legacy); self.assertTrue(delivery_for_store(self.store)['pickup']['enabled'])
        changed = deepcopy(legacy); changed['pickup']['address'] = 'Otro local'
        self.save(changed, 400)
        legacy['pickup']['enabled'] = False; self.save(legacy)
        legacy['pickup']['enabled'] = True; self.save(legacy, 400)
        self.config['pickup'].update({'legacy_address': 'Local antiguo', 'legacy_schedule': 'Lun–Vie 9–18'})
        self.save(); self.assertEqual(self.api.get(self.url).data['data']['pickup']['legacy_schedule'], 'Lun–Vie 9–18')

    def test_invalid_persisted_v2_is_not_offered(self):
        self.config['pickup']['location']['verification'] = 'fake'
        ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.config)
        self.assertFalse(delivery_for_store(self.store)['pickup']['enabled'])
        self.assertTrue(self.api.get(self.url).data['data']['pickup']['enabled'])  # editable privately

    def test_nested_patch_validates_merged_data_without_losing_other_days(self):
        self.save()
        response = self.api.patch(self.url, {'pickup': {'hours': {'mon': {'end': '19:30'}}}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['pickup']['hours']['mon']['start'], '09:00')
        bad = self.api.patch(self.url, {'pickup': {'hours': {'mon': {'end': '08:30'}}}}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.api.get(self.url).data['data']['pickup']['hours']['mon']['end'], '19:30')

    def test_checkout_zero_and_snapshot_unchanged_after_local_edit_and_disable(self):
        self.save()
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True, 'fields': {f: 'qa' for f in TRANSFER_PUBLIC_FIELDS}}})
        buyer = APIClient()
        payload = {'clave_checkout': str(uuid4()), 'items': [{'producto_id': 'prod', 'sku': 'SKU', 'cantidad': 1}],
                   'contacto': {'nombre': 'Buyer', 'email': 'buyer@example.com'}, 'medio_pago': 'Transferencia', 'metodo_entrega': 'Retiro'}
        with patch('apps.core.presentation.checkout.ProductRepository') as repo, patch('apps.core.presentation.checkout.validate_quote') as quote:
            repo.return_value.get_by_id.return_value = {'_id': 'prod', 'nombre': 'Product', 'activo': True, 'variantes': [{'sku': 'SKU', 'precio': 1000, 'stock': 5}]}
            response = buyer.post('/api/checkout/pedidos/', payload, format='json')
            self.assertEqual(response.status_code, 201, response.data); quote.assert_not_called()
            order = Pedido.objects.get(); original = deepcopy(order.entrega)
            self.assertEqual(order.costo_envio, 0); self.assertEqual(order.entrega['retiro']['hours'], self.config['pickup']['hours'])
            self.assertNotIn('verification', order.entrega['retiro']['location'])
            self.config['pickup']['location']['reference'] = 'Local 5'; self.config['pickup']['hours']['mon']['end'] = '19:00'; self.save()
            order.refresh_from_db(); self.assertEqual(order.entrega, original)
            self.config['pickup']['enabled'] = False; self.save()
            payload['clave_checkout'] = str(uuid4())
            self.assertEqual(buyer.post('/api/checkout/pedidos/', payload, format='json').status_code, 400)
            self.assertEqual(Pedido.objects.count(), 1)

    @patch.dict('os.environ', {'PICKUP_GEOCODING_PROVIDER': '', 'PICKUP_GOOGLE_GEOCODING_KEY': ''})
    def test_provider_unconfigured_and_access(self):
        url = '/api/entregas/retiro/direcciones/'
        self.assertFalse(self.api.get(url).data['data']['configured'])
        self.assertEqual(self.api.post(url, {'region': 'Metropolitana', 'comuna': 'Providencia', 'query': 'Calle 123'}, format='json').status_code, 503)
        self.assertEqual(APIClient().get(url).status_code, 401)
        self.assertEqual(self.api.get(url, {'tienda_id': 999}).status_code, 400)


class PickupGroupsAndProviderTests(SimpleTestCase):
    def test_groups_nonconsecutive_days_multiple_ranges_and_closed(self):
        hours = {d: {'enabled': False, 'start': '', 'end': ''} for d, _ in DAYS}
        for d in ('mon', 'tue', 'fri'): hours[d] = {'enabled': True, 'start': '09:00', 'end': '18:00'}
        for d in ('wed', 'thu'): hours[d] = {'enabled': True, 'start': '10:00', 'end': '15:00'}
        hours['sat'] = {'enabled': True, 'start': '10:00', 'end': '14:00'}
        summary = grouped_hours(hours)
        self.assertIn('Lunes, Martes, Viernes: 09:00 a 18:00', summary)
        self.assertIn('Miércoles, Jueves: 10:00 a 15:00', summary)
        self.assertIn('Sábado: 10:00 a 14:00', summary); self.assertIn('Domingo: cerrado', summary)

    @patch.dict('os.environ', {'PICKUP_GOOGLE_GEOCODING_KEY': 'test-not-real'})
    @patch('apps.core.infrastructure.pickup_address.requests.get')
    def test_real_provider_contract_rejects_partial_wrong_region_comuna_country_and_approximate(self, get):
        row = {'place_id': 'place', 'types': ['street_address'], 'geometry': {'location_type': 'ROOFTOP'},
               'address_components': [{'types': [kind], 'long_name': name, 'short_name': short} for kind, name, short in [
                   ('country', 'Chile', 'CL'), ('administrative_area_level_1', 'Región Metropolitana', ''),
                   ('locality', 'Providencia', ''), ('route', 'Avenida Providencia', ''), ('street_number', '1234', '')]]}
        get.return_value.json.return_value = {'status': 'OK', 'results': [row]}
        provider = GoogleAddressProvider()
        self.assertEqual(len(provider.search('Metropolitana de Santiago', 'Providencia', 'Providencia 1234')), 1)
        for field, value in [('partial_match', True), ('geometry', {'location_type': 'RANGE_INTERPOLATED'})]:
            bad = deepcopy(row); bad[field] = value; get.return_value.json.return_value['results'] = [bad]
            self.assertEqual(provider.search('Metropolitana de Santiago', 'Providencia', '1234'), [])
        get.return_value.json.return_value['results'] = [row]
        self.assertEqual(provider.search('Valparaíso', 'Providencia', '1234'), [])
        self.assertEqual(provider.search('Metropolitana de Santiago', 'Santiago', '1234'), [])
        foreign = deepcopy(row)
        foreign['address_components'][0]['short_name'] = 'AR'
        get.return_value.json.return_value['results'] = [foreign]
        self.assertEqual(provider.search('Metropolitana de Santiago', 'Providencia', '1234'), [])
        no_number = deepcopy(row)
        no_number['address_components'] = [c for c in no_number['address_components'] if 'street_number' not in c['types']]
        get.return_value.json.return_value['results'] = [no_number]
        self.assertEqual(provider.search('Metropolitana de Santiago', 'Providencia', 'sin número'), [])
        self.assertEqual(get.call_args.kwargs['timeout'], 8)
        get.return_value.json.return_value = {'status': 'REQUEST_DENIED', 'error_message': 'secret'}
        with self.assertRaises(AddressProviderError) as error: provider.search('region', 'comuna', 'street')
        self.assertNotIn('secret', str(error.exception))
