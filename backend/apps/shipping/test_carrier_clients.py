import unittest
from unittest.mock import MagicMock

import requests
from django.core.cache import cache

from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException, NumeroSeguimientoNoEncontradoException,
    ProveedorLogisticoError, RespuestaLogisticaInvalidaException, TiempoEsperaLogisticoException,
)
from apps.shipping.infrastructure.carrier_clients import ChilexpressClient, StarkenClient

PKG = dict(peso_kg=1, alto_cm=15, ancho_cm=20, largo_cm=30, valor_declarado=20000)


def respuesta(status=200, body=None, json_error=False):
    r = MagicMock(status_code=status)
    if json_error:
        r.json.side_effect = ValueError('no json')
    else:
        r.json.return_value = body
    return r


def chilex(session):
    return ChilexpressClient(api_key='SECRETA', base_url='https://api.test', origin_county_code='SANT',
                             tracking_path='tracking/prueba', rut='96756430', session=session)


class ChilexpressClientTests(unittest.TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_not_configured_without_credentials_or_origin(self):
        self.assertFalse(ChilexpressClient(api_key='', base_url='https://x', origin_county_code='A').configurado)
        self.assertFalse(ChilexpressClient(api_key='k', base_url='https://x').configurado)

    def test_quote_resolves_county_and_sends_key(self):
        session = MagicMock()
        session.request.side_effect = [
            respuesta(body={'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}}),
            respuesta(body={'data': {'courierServiceOptions': [{'serviceValue': 4990}]}}),
        ]
        out = chilex(session).cotizar('Metropolitana de Santiago', 'Providencia', **PKG)
        self.assertEqual(out['data']['courierServiceOptions'][0]['serviceValue'], 4990)
        cover, rates = session.request.call_args_list
        self.assertEqual(cover.kwargs['params']['RegionCode'], 'RM')
        self.assertEqual(rates.kwargs['json']['destinationCountyCode'], 'PROV')
        self.assertEqual(rates.kwargs['headers']['Ocp-Apim-Subscription-Key'], 'SECRETA')

    def test_county_match_ignores_accents_and_case(self):
        session = MagicMock()
        session.request.return_value = respuesta(
            body={'data': {'coverageAreas': [{'countyName': 'ÑUÑOA', 'countyCode': 'NUN'}]}})
        self.assertEqual(chilex(session).county_code('Metropolitana', 'Ñuñoa'), 'NUN')

    def test_uncovered_commune_and_region(self):
        session = MagicMock()
        session.request.return_value = respuesta(body={'data': {'coverageAreas': []}})
        with self.assertRaises(DireccionFueraDeCoberturaException):
            chilex(session).county_code('Metropolitana', 'Isla Inventada')
        with self.assertRaises(DireccionFueraDeCoberturaException):
            chilex(session).county_code('Narnia', 'X')

    def test_timeout_and_connection_errors_become_domain_errors(self):
        session = MagicMock()
        session.request.side_effect = requests.exceptions.Timeout()
        with self.assertRaises(TiempoEsperaLogisticoException):
            chilex(session).seguimiento('123')
        session.request.side_effect = requests.exceptions.ConnectionError('secreto-interno')
        with self.assertRaises(ProveedorLogisticoError) as ctx:
            chilex(session).seguimiento('123')
        self.assertNotIn('secreto', str(ctx.exception))

    def test_http_errors_do_not_leak_credentials(self):
        session = MagicMock()
        session.request.return_value = respuesta(status=401)
        with self.assertRaises(ProveedorLogisticoError) as ctx:
            chilex(session).seguimiento('123')
        self.assertNotIn('SECRETA', str(ctx.exception))
        session.request.return_value = respuesta(status=500)
        with self.assertRaises(ProveedorLogisticoError):
            chilex(session).seguimiento('123')
        session.request.return_value = respuesta(status=404)
        with self.assertRaises(NumeroSeguimientoNoEncontradoException):
            chilex(session).seguimiento('123')

    def test_invalid_json_and_non_object_bodies(self):
        session = MagicMock()
        session.request.return_value = respuesta(json_error=True)
        with self.assertRaises(RespuestaLogisticaInvalidaException):
            chilex(session).seguimiento('123')
        session.request.return_value = respuesta(body=['x'])
        with self.assertRaises(RespuestaLogisticaInvalidaException):
            chilex(session).seguimiento('123')


class StarkenClientTests(unittest.TestCase):
    def client(self, session):
        return StarkenClient(api_key='tok', base_url='https://starken.test', origin_city='Santiago', session=session)

    def test_quote_uses_bearer_and_returns_raw_body(self):
        session = MagicMock()
        session.request.return_value = respuesta(body={'valor': 5200, 'plazo_entrega': 3})
        out = self.client(session).cotizar('Biobío', 'Concepción', **PKG)
        self.assertEqual(out, {'valor': 5200, 'plazo_entrega': 3})
        call = session.request.call_args
        self.assertEqual(call.args, ('POST', 'https://starken.test/quote'))
        self.assertEqual(call.kwargs['headers']['Authorization'], 'Bearer tok')

    def test_tracking_path_and_not_configured(self):
        session = MagicMock()
        session.request.return_value = respuesta(body={'eventos': []})
        self.client(session).seguimiento('STK-1')
        self.assertEqual(session.request.call_args.args, ('GET', 'https://starken.test/tracking/STK-1'))
        self.assertFalse(StarkenClient(api_key='tok', base_url='https://x').configurado)
        with self.assertRaises(ProveedorLogisticoError):
            StarkenClient(api_key='', base_url='').seguimiento('X')


if __name__ == '__main__':
    unittest.main()


class ChilexpressDocumentedContractTests(unittest.TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)


    def client(self, session, ambiente='SANDBOX'):
        return ChilexpressClient(
            api_keys={'cotizador': 'K-COT', 'coberturas': 'K-COB', 'envios': 'K-ENV'}, ambiente=ambiente,
            origin_county_code='SANT', tracking_path='tracking/prueba', rut='96756430', tcc='18578680',
            session=session)

    def test_rates_use_rating_route_and_one_key_per_product(self):
        session = MagicMock()
        session.request.side_effect = [
            respuesta(body={'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}}),
            respuesta(body={'data': {'courierServiceOptions': [{'serviceValue': 4990}]}}),
            respuesta(body={'statusCode': 0, 'data': {}}),
        ]
        client = self.client(session)
        client.cotizar('Metropolitana de Santiago', 'Providencia', **PKG)
        client.seguimiento('123')
        cover, rates, tracking = session.request.call_args_list
        self.assertEqual(rates.args[1], 'https://testservices.wschilexpress.com/rating/api/v1.0/rates/courier')
        self.assertNotIn('transport-orders', rates.args[1])
        self.assertEqual(cover.kwargs['headers']['Ocp-Apim-Subscription-Key'], 'K-COB')
        self.assertEqual(rates.kwargs['headers']['Ocp-Apim-Subscription-Key'], 'K-COT')
        self.assertEqual(tracking.kwargs['headers']['Ocp-Apim-Subscription-Key'], 'K-ENV')

    def test_environment_selects_host(self):
        self.assertEqual(self.client(MagicMock(), 'SANDBOX').base_url, 'https://testservices.wschilexpress.com')
        self.assertEqual(self.client(MagicMock(), 'PRODUCCION').base_url, 'https://services.wschilexpress.com')
        with self.assertRaises(ValueError):
            self.client(MagicMock(), 'OTRO')

    def test_needs_quote_and_coverage_keys_plus_origin(self):
        solo_cotizador = ChilexpressClient(api_keys={'cotizador': 'x'}, origin_county_code='SANT')
        self.assertFalse(solo_cotizador.configurado)
        self.assertTrue(self.client(MagicMock()).configurado)

    def test_tracking_usa_la_ruta_oficial_por_defecto_y_exige_clave_envios_y_rut(self):
        sin_clave = ChilexpressClient(api_keys={'cotizador': 'a', 'coberturas': 'b'}, origin_county_code='SANT',
                                      rut='96756430', session=MagicMock())
        with self.assertRaises(ProveedorLogisticoError):
            sin_clave.seguimiento('99726299584')
        sin_rut = ChilexpressClient(api_keys={'envios': 'c'}, session=MagicMock())
        with self.assertRaises(ProveedorLogisticoError):
            sin_rut.seguimiento('99726299584')
        self.assertEqual(ChilexpressClient(api_keys={'envios': 'c'}).tracking_path,
                         'transport-orders/api/v1.0/tracking')
