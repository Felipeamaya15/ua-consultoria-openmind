"""Manejo de fallos en la cotizacion con transportistas (SCRUM-349)."""
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from apps.shipping.domain.dtos import (
    CotizacionEnvioDTO, DireccionDespachoDTO, PaqueteDTO,
)
from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException, LogisticaException, ProveedorLogisticoError,
)
from apps.shipping.domain.ports import LogisticsPort
from apps.shipping.infrastructure.adapters import MultiCarrierLogisticsAdapter

LOGGER_ADAPTADORES = 'apps.shipping.infrastructure.adapters'
LOGGER_VISTA = 'apps.shipping.presentation.views'


class TransportistaFalso(LogisticsPort):
    def __init__(self, resultado):
        self.resultado = resultado

    def cotizar_envio(self, origen, destino, paquetes):
        if isinstance(self.resultado, Exception):
            raise self.resultado
        return self.resultado

    def generar_despacho(self, *args, **kwargs):
        raise NotImplementedError

    def consultar_seguimiento(self, numero_seguimiento):
        raise NotImplementedError


def direccion():
    return DireccionDespachoDTO(calle='Calle', numero='1', comuna='Providencia', region='Metropolitana')


def paquetes():
    return [PaqueteDTO(peso_kg=Decimal('1'), alto_cm=Decimal('10'), ancho_cm=Decimal('10'),
                       largo_cm=Decimal('10'), valor_declarado=Decimal('1000'))]


def tarifa(proveedor='ESTRELLA'):
    return CotizacionEnvioDTO(proveedor=proveedor, servicio='Normal', costo=Decimal('3000'),
                              dias_habiles_entrega=2, es_cobertura_valida=True)


class MultiCarrierFallosTests(SimpleTestCase):
    def cotizar(self, *resultados):
        adaptador = MultiCarrierLogisticsAdapter([TransportistaFalso(r) for r in resultados])
        return adaptador.cotizar_envio(direccion(), direccion(), paquetes())

    def test_un_transportista_caido_no_tumba_a_los_demas(self):
        with self.assertLogs(LOGGER_ADAPTADORES, level='ERROR'):
            cotizaciones = self.cotizar(RuntimeError('timeout'), [tarifa()])
        self.assertEqual(len(cotizaciones), 1)

    def test_si_todos_fallan_es_un_error_de_proveedor_y_no_falta_de_cobertura(self):
        with self.assertLogs(LOGGER_ADAPTADORES, level='ERROR'):
            with self.assertRaises(ProveedorLogisticoError):
                self.cotizar(RuntimeError('timeout'), ConnectionError('sin red'))

    def test_si_ninguno_cubre_el_destino_es_falta_de_cobertura(self):
        with self.assertRaises(DireccionFueraDeCoberturaException):
            self.cotizar(DireccionFueraDeCoberturaException('no'), DireccionFueraDeCoberturaException('no'))

    def test_uno_sin_cobertura_y_otro_caido_se_informa_como_proveedor_caido(self):
        with self.assertLogs(LOGGER_ADAPTADORES, level='ERROR'):
            with self.assertRaises(ProveedorLogisticoError):
                self.cotizar(DireccionFueraDeCoberturaException('no'), RuntimeError('timeout'))


class CotizacionVistaErroresTests(SimpleTestCase):
    url = '/api/logistica/cotizar/'
    payload = {'region': 'Metropolitana', 'comuna': 'Santiago', 'total_carrito': '15000.00',
               'total_items': 1, 'proveedor': 'todos'}

    def setUp(self):
        self.api = APIClient()

    def cotizar_con_falla(self, falla):
        with patch('apps.shipping.presentation.views.ShippingQuotationService') as servicio:
            servicio.return_value.cotizar.side_effect = falla
            return self.api.post(self.url, self.payload, format='json')

    def assert_error(self, respuesta, codigo, estado):
        self.assertEqual(respuesta.status_code, estado, respuesta.content)
        cuerpo = respuesta.json()
        self.assertFalse(cuerpo['exito'])
        self.assertEqual(cuerpo['error']['codigo'], codigo)
        return cuerpo

    def test_sin_cobertura(self):
        respuesta = self.cotizar_con_falla(DireccionFueraDeCoberturaException('No hay cobertura.'))
        self.assert_error(respuesta, 'SIN_COBERTURA', 400)

    def test_transportistas_no_disponibles(self):
        with self.assertLogs(LOGGER_VISTA, level='WARNING'):
            respuesta = self.cotizar_con_falla(ProveedorLogisticoError('timeout interno'))
        cuerpo = self.assert_error(respuesta, 'PROVEEDOR_NO_DISPONIBLE', 502)
        self.assertNotIn('timeout interno', cuerpo['mensaje'])

    def test_otros_errores_de_logistica_mantienen_su_codigo(self):
        self.assert_error(self.cotizar_con_falla(LogisticaException('x')), 'ERROR_LOGISTICA_CALCULO', 400)

    def test_error_inesperado_no_filtra_detalles(self):
        with self.assertLogs(LOGGER_VISTA, level='ERROR'):
            respuesta = self.cotizar_con_falla(RuntimeError('credencial interna'))
        self.assert_error(respuesta, 'ERROR_INTERNO', 500)
        self.assertNotIn('credencial', respuesta.content.decode())