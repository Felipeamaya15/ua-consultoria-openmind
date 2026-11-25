import sys
from unittest.mock import MagicMock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from apps.shipping.domain.exceptions import DireccionFueraDeCoberturaException
from apps.shipping.infrastructure.carrier_clients import ChilexpressClient

AREAS = [
    {'countyCode': 'TILT', 'countyName': 'TIL TIL', 'regionCode': 'RM', 'queryMode': 1, 'coverageName': 'TIL TIL'},
    {'countyCode': 'POLP', 'countyName': 'TIL TIL', 'regionCode': 'RM', 'queryMode': 2,
     'coverageName': 'TIL TIL - POLPAICO'},
    {'countyCode': 'STGO', 'countyName': 'SANTIAGO CENTRO', 'regionCode': 'RM', 'queryMode': 1,
     'coverageName': 'SANTIAGO CENTRO'},
    {'countyCode': 'SJOS', 'countyName': 'SAN JOSE DE MAIPO', 'regionCode': 'RM', 'queryMode': 1,
     'coverageName': 'SAN JOSE DE MAIPO'},
    {'countyCode': 'SMIG', 'countyName': 'SAN MIGUEL', 'regionCode': 'RM', 'queryMode': 1,
     'coverageName': 'SAN MIGUEL'},
    {'countyCode': 'ACHA', 'countyName': 'QUINCHAO', 'regionCode': 'R10', 'queryMode': 1, 'coverageName': 'ACHAO'},
]


def _client():
    session = MagicMock()
    response = MagicMock(status_code=200)
    response.json.return_value = {'data': {'coverageAreas': AREAS}}
    session.request.return_value = response
    client = ChilexpressClient(api_keys={'coberturas': 'COB-KEY'}, origin_county_code='STGO', session=session)
    return client, session


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class CoberturasChilexpressTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_normaliza_tildes_espacios_y_guiones(self):
        client, _ = _client()
        self.assertEqual(client.county_code('Metropolitana de Santiago', 'Tiltil'), 'TILT')
        self.assertEqual(client.county_code('Región Metropolitana', 'san jose de maipo'), 'SJOS')

    def test_sector_se_resuelve_por_nombre_de_cobertura_y_por_codigo(self):
        client, _ = _client()
        self.assertEqual(client.county_code('RM', 'Til Til - Polpaico'), 'POLP')
        self.assertEqual(client.county_code('RM', 'POLP'), 'POLP')

    def test_comuna_con_sectores_prefiere_la_cobertura_principal(self):
        client, _ = _client()
        self.assertEqual(client.county_code('RM', 'Til Til'), 'TILT')

    def test_nombre_corto_unico_se_acepta_y_el_ambiguo_no(self):
        client, _ = _client()
        self.assertEqual(client.county_code('RM', 'Santiago'), 'STGO')
        with self.assertRaises(DireccionFueraDeCoberturaException):
            client.county_code('RM', 'San')

    def test_comuna_inexistente_no_tiene_cobertura(self):
        client, _ = _client()
        with self.assertRaises(DireccionFueraDeCoberturaException):
            client.county_code('RM', 'Narnia')

    def test_acepta_codigo_de_region(self):
        client, _ = _client()
        self.assertEqual(client.county_code('R10', 'Achao'), 'ACHA')

    def test_la_cobertura_se_cachea_por_region(self):
        client, session = _client()
        client.coberturas('RM')
        client.coberturas('Metropolitana de Santiago')
        client.county_code('RM', 'Til Til')
        self.assertEqual(session.request.call_count, 1)

    def test_coberturas_devuelve_comuna_cobertura_y_codigo(self):
        client, _ = _client()
        item = next(c for c in client.coberturas('RM') if c['codigo'] == 'POLP')
        self.assertEqual((item['comuna'], item['cobertura'], item['modo']), ('TIL TIL', 'TIL TIL - POLPAICO', 2))


from unittest.mock import patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.shipping.domain.exceptions import ProveedorLogisticoError
from apps.shipping.presentation.views import CoberturasChilexpressAdminView

COBERTURAS = 'apps.shipping.infrastructure.carrier_clients.ChilexpressClient.coberturas'


def TIENDA():
    tenant = MagicMock()
    return patch.dict(sys.modules, {'apps.core.infrastructure.tenant': tenant})


class CoberturasAdminViewTests(SimpleTestCase):
    def _post(self, body):
        request = APIRequestFactory().post('/api/logistica/chilexpress/coberturas/admin/', body, format='json')
        force_authenticate(request, user=MagicMock(is_authenticated=True))
        return CoberturasChilexpressAdminView.as_view()(request)

    def test_usa_la_clave_escrita_sin_haberla_guardado(self):
        lista = [{'codigo': 'STGO', 'comuna': 'SANTIAGO CENTRO', 'cobertura': 'SANTIAGO CENTRO', 'modo': 1, 'region': 'RM'}]
        with TIENDA(), patch(COBERTURAS, return_value=lista) as cobertura:
            response = self._post({'region': 'Metropolitana de Santiago', 'coberturas': 'CLAVE-NUEVA', 'ambiente': 'SANDBOX'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['region'], 'RM')
        self.assertEqual(response.data['data']['comunas'], lista)
        cobertura.assert_called_once_with('Metropolitana de Santiago')

    def test_region_es_obligatoria(self):
        with TIENDA():
            response = self._post({'coberturas': 'CLAVE-NUEVA'})
        self.assertEqual(response.status_code, 400)

    def test_clave_invalida_responde_503(self):
        with TIENDA(), patch(COBERTURAS, side_effect=ProveedorLogisticoError('x')):
            response = self._post({'region': 'RM', 'coberturas': 'MALA'})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['error']['codigo'], 'COBERTURAS_NO_DISPONIBLES')

    def test_ambiente_invalido_responde_400(self):
        with TIENDA():
            response = self._post({'region': 'RM', 'coberturas': 'K', 'ambiente': 'OTRO'})
        self.assertEqual(response.status_code, 400)
