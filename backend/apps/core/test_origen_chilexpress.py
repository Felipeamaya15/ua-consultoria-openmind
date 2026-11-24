from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.shipping.domain.exceptions import DireccionFueraDeCoberturaException

CLAVES = {'cotizador': 'COTIZADOR-1234567890', 'coberturas': 'COBERTURAS-1234567890'}
COUNTY = 'apps.shipping.infrastructure.carrier_clients.ChilexpressClient.county_code'


class OrigenChilexpressTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='origen-owner', is_staff=True)
        self.store = Tienda.objects.create(nombre='Tienda origen', id_usuario_propietario=owner)
        self.api = APIClient()
        self.api.force_authenticate(owner)

    def _save(self, **credenciales):
        body = {'chilexpress': {'enabled': True, 'ambiente': 'SANDBOX', 'credenciales': {**CLAVES, **credenciales}}}
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.store):
            return self.api.patch('/api/entregas/configuracion/', body, format='json')

    def test_region_y_comuna_se_convierten_en_el_codigo_de_cobertura(self):
        with patch(COUNTY, return_value='PUDA') as county:
            response = self._save(origen_region='Metropolitana de Santiago', origen_comuna='Pudahuel')
        self.assertEqual(response.status_code, 200, response.data)
        county.assert_called_once_with('Metropolitana de Santiago', 'Pudahuel')
        shown = response.data['data']['chilexpress']
        self.assertEqual(shown['credenciales']['origen'], 'PUDA')
        self.assertEqual(shown['credenciales']['origen_comuna'], 'Pudahuel')
        self.assertEqual(shown['status'], 'configured')

    def test_si_la_comuna_no_cambia_no_se_vuelve_a_consultar(self):
        with patch(COUNTY, return_value='PUDA'):
            self._save(origen_region='Metropolitana de Santiago', origen_comuna='Pudahuel')
        with patch(COUNTY, side_effect=AssertionError('no debía consultar')):
            response = self._save(origen_region='Metropolitana de Santiago', origen_comuna='Pudahuel', origen='PUDA')
        self.assertEqual(response.status_code, 200, response.data)

    def test_comuna_sin_cobertura_devuelve_error_y_no_guarda_origen(self):
        with patch(COUNTY, side_effect=DireccionFueraDeCoberturaException('x')):
            response = self._save(origen_region='Metropolitana de Santiago', origen_comuna='Pudahuel')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error']['codigo'], 'ERROR_VALIDACION')

    def test_region_sin_comuna_se_rechaza(self):
        response = self._save(origen_region='Metropolitana de Santiago', origen_comuna='')
        self.assertEqual(response.status_code, 400)

    def test_origen_manual_sigue_funcionando(self):
        response = self._save(origen='SANT')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['chilexpress']['credenciales']['origen'], 'SANT')
