from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from apps.core.shipping import ErrorCotizacion, configured_quote
from apps.shipping.domain.dtos import DireccionDespachoDTO, PaqueteDTO
from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException, NumeroSeguimientoNoEncontradoException,
    ProveedorLogisticoError, TiempoEsperaLogisticoException,
)
from apps.shipping.infrastructure import live
from apps.shipping.infrastructure.adapters import ChilexpressAdapter, StarkenAdapter

CHILEX_CFG = dict(CHILEXPRESS_API_KEY='k', CHILEXPRESS_BASE_URL='https://c.test', CHILEXPRESS_ORIGIN_COUNTY='STGO')
STARKEN_CFG = dict(STARKEN_API_KEY='k', STARKEN_BASE_URL='https://s.test', STARKEN_ORIGIN_CITY='Santiago')


def _dir(region='Metropolitana', comuna='Providencia'):
    return DireccionDespachoDTO(calle='Av. X', numero='123', comuna=comuna, region=region)


def _paquete():
    return PaqueteDTO(peso_kg=Decimal('2'), alto_cm=Decimal('10'), ancho_cm=Decimal('20'),
                      largo_cm=Decimal('30'), valor_declarado=Decimal('15000'))


class GetClientTests(SimpleTestCase):
    def test_sin_tienda_no_hay_cliente(self):
        self.assertIsNone(live.get_client('Chilexpress'))
        self.assertIsNone(live.get_client('Starken'))
        self.assertIsNone(live.live_quote('Chilexpress', 'Metropolitana', 'Providencia'))

    @override_settings(**CHILEX_CFG, **STARKEN_CFG)
    def test_variables_de_entorno_ya_no_activan_clientes(self):
        self.assertIsNone(live.get_client('Chilexpress'))
        self.assertIsNone(live.get_client('Starken'))
        self.assertIsNone(live.get_client('Retiro'))


class CotizacionEnVivoTests(SimpleTestCase):
    @override_settings(**CHILEX_CFG)
    def test_chilexpress_usa_la_respuesta_de_la_api(self):
        cliente = MagicMock()
        cliente.cotizar.return_value = {'data': {'courierServiceOptions': [{'serviceValue': 4990}]}}
        with patch.object(live, 'get_client', return_value=cliente):
            out = ChilexpressAdapter().cotizar_envio(_dir(), _dir(), [_paquete()])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].proveedor, 'CHILEXPRESS')
        self.assertEqual(out[0].costo, Decimal('4990'))
        cliente.cotizar.assert_called_once()

    @override_settings(**STARKEN_CFG)
    def test_starken_usa_la_respuesta_de_la_api(self):
        cliente = MagicMock()
        cliente.cotizar.return_value = {'valor': 5200, 'plazo_entrega': 3}
        with patch.object(live, 'get_client', return_value=cliente):
            out = StarkenAdapter().cotizar_envio(_dir('Biobío', 'Concepción'), _dir('Biobío', 'Concepción'), [_paquete()])
        self.assertEqual((out[0].proveedor, out[0].costo, out[0].dias_habiles_entrega), ('STARKEN', Decimal('5200'), 3))

    def test_respuesta_invalida_se_traduce_a_error_de_dominio(self):
        cliente = MagicMock()
        cliente.cotizar.return_value = {'basura': True}
        with patch.object(live, 'get_client', return_value=cliente):
            with self.assertRaises(ProveedorLogisticoError):
                StarkenAdapter().cotizar_envio(_dir(), _dir(), [_paquete()])


class ModoSimuladoTests(SimpleTestCase):
    @override_settings(CHILEXPRESS_API_KEY='', CHILEXPRESS_ENVIOS_API_KEY='', STARKEN_API_KEY='', SHIPPING_ALLOW_SIMULATED=False)
    def test_produccion_sin_credenciales_no_inventa_nada(self):
        for adapter, codigo in ((ChilexpressAdapter(), 'CHILEX-ABC12345'), (StarkenAdapter(), 'STK-ABC12345')):
            with self.assertRaises(ProveedorLogisticoError):
                adapter.cotizar_envio(_dir(), _dir(), [_paquete()])
            with self.assertRaises(ProveedorLogisticoError):
                adapter.consultar_seguimiento(codigo)
            with self.assertRaises(ProveedorLogisticoError):
                adapter.generar_despacho('1', _dir(), _dir(), [_paquete()])

    @override_settings(CHILEXPRESS_API_KEY='', CHILEXPRESS_ENVIOS_API_KEY='', STARKEN_API_KEY='', SHIPPING_ALLOW_SIMULATED=True)
    def test_desarrollo_conserva_los_codigos_de_prueba(self):
        with self.assertRaises(NumeroSeguimientoNoEncontradoException):
            ChilexpressAdapter().consultar_seguimiento('CHILEX-NOTFOUND')
        with self.assertRaises(TiempoEsperaLogisticoException):
            StarkenAdapter().consultar_seguimiento('STK-TIMEOUT1')


class SeguimientoEnVivoTests(SimpleTestCase):
    @override_settings(**CHILEX_CFG)
    def test_chilexpress_numero_real_terminado_en_0000_no_se_rechaza_ni_se_inventa_fecha(self):
        cliente = MagicMock()
        cliente.seguimiento.return_value = {'statusCode': 0, 'data': {
            'transportOrderData': {'status': 'EN REPARTO', 'locationStatus': 'Santiago'},
            'trackingEvents': [{'eventDate': '10/11/2026', 'eventHour': '10:00', 'description': 'Salió a reparto',
                                'location': 'Santiago', 'code': {'clientEventDescription': 'En reparto'}}]}}
        with patch.object(live, 'get_shipping_client', return_value=cliente):
            detalle = ChilexpressAdapter().consultar_seguimiento('250010000')
        self.assertEqual(detalle.estado_actual, 'EN REPARTO')
        self.assertEqual(detalle.fecha_estimada_entrega, '')
        self.assertEqual(detalle.historial_eventos[0].descripcion, 'Salió a reparto')
        cliente.seguimiento.assert_called_once_with('250010000')

    @override_settings(**STARKEN_CFG)
    def test_starken_numero_real_terminado_en_0000(self):
        cliente = MagicMock()
        cliente.seguimiento.return_value = {'eventos': [
            {'fecha': '2026-11-10T10:00:00Z', 'estado': 'EN_AGENCIA', 'descripcion': 'En agencia', 'ciudad': 'Temuco'}]}
        with patch.object(live, 'get_client', return_value=cliente):
            detalle = StarkenAdapter().consultar_seguimiento('120000000')
        self.assertEqual((detalle.estado_actual, detalle.fecha_estimada_entrega), ('EN_AGENCIA', ''))

    @override_settings(**CHILEX_CFG)
    def test_error_de_la_api_se_propaga_como_dominio(self):
        cliente = MagicMock()
        cliente.seguimiento.side_effect = NumeroSeguimientoNoEncontradoException('x')
        with patch.object(live, 'get_shipping_client', return_value=cliente):
            with self.assertRaises(NumeroSeguimientoNoEncontradoException):
                ChilexpressAdapter().consultar_seguimiento('99999999')


class CheckoutCotizacionTests(SimpleTestCase):
    TIENDA = SimpleNamespace(pk=7)
    CONFIG = {'chilexpress': {'enabled': True, 'tarifas': [
        {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': 4500, 'plazo_dias': 2}]}}

    def _quote(self, live_result=None, live_error=None):
        patches = [patch('apps.core.shipping.delivery_for_store', return_value=self.CONFIG)]
        if live_error is not None:
            patches.append(patch('apps.core.shipping.live_quote', side_effect=live_error))
        else:
            patches.append(patch('apps.core.shipping.live_quote', return_value=live_result))
        with patches[0], patches[1]:
            return configured_quote(self.TIENDA, 'Chilexpress', 'Metropolitana', 'Providencia')

    def test_api_disponible_gana_sobre_la_tarifa_manual(self):
        out = self._quote({'operador': 'Chilexpress', 'monto': Decimal('5990'), 'moneda': 'CLP', 'plazo_dias': 1})
        self.assertEqual((out['monto'], out['origen']), ('5990', 'api_transportista'))

    def test_sin_credenciales_se_usa_la_tarifa_manual(self):
        out = self._quote(None)
        self.assertEqual((out['monto'], out['origen']), ('4500', 'configuracion_tienda'))

    def test_api_caida_cae_a_la_tarifa_manual(self):
        out = self._quote(live_error=TiempoEsperaLogisticoException('t'))
        self.assertEqual(out['origen'], 'configuracion_tienda')

    def test_comuna_sin_cobertura_usa_la_tarifa_manual(self):
        out = self._quote(live_error=DireccionFueraDeCoberturaException('x'))
        self.assertEqual(out['origen'], 'configuracion_tienda')

    def test_api_caida_sin_tarifa_manual_es_error_reintentable(self):
        sin_tarifas = {'chilexpress': {'enabled': True, 'tarifas': []}}
        with patch('apps.core.shipping.delivery_for_store', return_value=sin_tarifas), \
                patch('apps.core.shipping.live_quote', side_effect=ProveedorLogisticoError('x')):
            with self.assertRaises(ErrorCotizacion) as ctx:
                configured_quote(self.TIENDA, 'Chilexpress', 'Metropolitana', 'Providencia')
        self.assertEqual(ctx.exception.codigo_error, 'ERROR_COTIZACION')
