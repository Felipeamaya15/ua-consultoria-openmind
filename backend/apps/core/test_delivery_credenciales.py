from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.delivery import carrier_credentials
from apps.core.models import ConfiguracionEntrega, Tienda
from apps.shipping.infrastructure import live

CREDENCIALES = {'cotizador': 'COTIZADOR-1234567890', 'coberturas': 'COBERTURAS-1234567890',
                'envios': 'ENVIOS-1234567890', 'tcc': '18578680', 'origen': 'SANT'}


class DeliveryCredentialsTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='cred-owner', is_staff=True)
        self.store = Tienda.objects.create(nombre='Tienda credenciales', id_usuario_propietario=owner)
        self.api = APIClient()
        self.api.force_authenticate(owner)
        self.url = '/api/entregas/configuracion/'

    def _save(self, **extra):
        body = {'chilexpress': {'enabled': True, 'ambiente': 'SANDBOX', 'credenciales': CREDENCIALES, **extra}}
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.store):
            return self.api.patch(self.url, body, format='json')

    def test_credentials_are_encrypted_at_rest_and_masked_in_responses(self):
        response = self._save()
        self.assertEqual(response.status_code, 200, response.data)
        raw = ConfiguracionEntrega.objects.get(tienda=self.store).datos
        self.assertTrue(raw['credenciales_transportistas']['chilexpress']['cotizador'].startswith('enc::'))
        self.assertNotIn('COTIZADOR-1234567890', str(raw))
        shown = response.data['data']['chilexpress']
        self.assertEqual(shown['status'], 'configured')
        self.assertNotIn('COTIZADOR-1234567890', str(response.data))
        self.assertTrue(shown['credenciales']['cotizador'].endswith('7890'))
        self.assertEqual(shown['credenciales']['tcc'], '18578680')
        self.assertEqual(carrier_credentials(raw, 'chilexpress')['cotizador'], 'COTIZADOR-1234567890')

    def test_resending_masked_or_blank_values_keeps_the_stored_key(self):
        shown = self._save().data['data']['chilexpress']['credenciales']
        self._save(credenciales={**shown, 'envios': ''}, ambiente='PRODUCCION')
        raw = ConfiguracionEntrega.objects.get(tienda=self.store).datos
        creds = carrier_credentials(raw, 'chilexpress')
        self.assertEqual(creds['cotizador'], 'COTIZADOR-1234567890')
        self.assertEqual(creds['envios'], 'ENVIOS-1234567890')
        self.assertEqual(raw['chilexpress']['ambiente'], 'PRODUCCION')

    def test_invalid_environment_is_rejected(self):
        self.assertEqual(self._save(ambiente='STAGING').status_code, 400)

    def test_public_endpoint_never_exposes_credentials(self):
        self._save()
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.store):
            public = self.api.get('/api/entregas/alternativas/')
        self.assertNotIn('COTIZADOR-1234567890', str(public.content))

    def test_live_client_uses_store_environment_and_keys(self):
        self._save(ambiente='PRODUCCION')
        client = live.get_client('Chilexpress', self.store)
        self.assertEqual(client.base_url, 'https://services.wschilexpress.com')
        self.assertEqual(client.api_keys['coberturas'], 'COBERTURAS-1234567890')
        self.assertEqual(client.origin_county_code, 'SANT')

    def test_store_without_credentials_has_no_live_client(self):
        with self.settings(CHILEXPRESS_API_KEY='k', CHILEXPRESS_BASE_URL='https://c.test', CHILEXPRESS_ORIGIN_COUNTY='STGO'):
            self.assertIsNone(live.get_client('Chilexpress', self.store))
