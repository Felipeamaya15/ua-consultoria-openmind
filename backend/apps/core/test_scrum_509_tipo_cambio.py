"""SCRUM-509: tipo de cambio CLP -> USD para PayPal (fuente, margen, vigencia y respaldo)."""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from apps.core.infrastructure import tipo_cambio as fx

DESCARGA = 'apps.core.infrastructure.tipo_cambio._descargar'


def dato(valor='900', dias_atras=0):
    return (Decimal(valor), date.today() - timedelta(days=dias_atras), 'test')


class TipoCambioTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    @override_settings(PAYPAL_FX_MARGEN_PCT='2')
    def test_el_margen_encarece_el_dolar_y_abarata_los_usd(self):
        with patch(DESCARGA, return_value=dato('900')):
            tipo = fx.tipo_cambio_vigente()
        self.assertEqual(tipo.aplicado, Decimal('918.0000'))
        self.assertEqual(tipo.clp_a_usd(Decimal('19000')), Decimal('20.70'))
        self.assertEqual(tipo.clp_a_usd(Decimal('1')), Decimal('0.01'))  # minimo cobrable

    def test_margen_invalido_vuelve_al_valor_por_defecto(self):
        for valor in ('abc', '-1', '50', 'nan'):
            with override_settings(PAYPAL_FX_MARGEN_PCT=valor):
                self.assertEqual(fx.margen_pct(), Decimal('2'), valor)
        with override_settings(PAYPAL_FX_MARGEN_PCT='0'):
            self.assertEqual(fx.margen_pct(), Decimal('0'))

    @override_settings(PAYPAL_FX_MAX_EDAD_HORAS=96)
    def test_dato_mas_antiguo_que_la_vigencia_no_se_usa(self):
        with patch(DESCARGA, return_value=dato(dias_atras=2)):
            self.assertIsNotNone(fx.tipo_cambio_vigente())  # fin de semana: sigue vigente
        cache.clear()
        with patch(DESCARGA, return_value=dato(dias_atras=6)):
            self.assertIsNone(fx.tipo_cambio_vigente())

    @override_settings(PAYPAL_FX_REFRESCO_HORAS=0)
    def test_si_falla_la_descarga_se_usa_el_ultimo_dato_vigente(self):
        with patch(DESCARGA, return_value=dato('900')):
            fx.tipo_cambio_vigente()
        with patch(DESCARGA, return_value=None):
            self.assertEqual(fx.tipo_cambio_vigente().observado, Decimal('900'))

    def test_sin_dato_nunca_hay_tipo_de_cambio(self):
        with patch(DESCARGA, return_value=None):
            self.assertIsNone(fx.tipo_cambio_vigente())

    def test_usa_la_fuente_de_respaldo_si_la_principal_falla(self):
        respaldo = (Decimal('905.5'), date.today(), 'mindicador.cl')
        with patch.object(fx, '_desde_bcch', side_effect=OSError('sin red')), \
                patch.object(fx, '_desde_mindicador', return_value=respaldo):
            self.assertEqual(fx._descargar(), respaldo)
        with patch.object(fx, '_desde_bcch', side_effect=OSError), \
                patch.object(fx, '_desde_mindicador', side_effect=OSError):
            self.assertIsNone(fx._descargar())

    def test_lee_la_respuesta_de_mindicador_y_descarta_valores_invalidos(self):
        respuesta = {'serie': [{'fecha': '2026-11-05T03:00:00.000Z', 'valor': 0},
                               {'fecha': '2026-11-04T03:00:00.000Z', 'valor': 951.2}]}
        with patch.object(fx, '_leer_json', return_value=respuesta):
            self.assertEqual(fx._desde_mindicador(), (Decimal('951.2'), date(2026, 11, 4), 'mindicador.cl'))

    @override_settings(BCCH_USUARIO='', BCCH_CLAVE='')
    def test_banco_central_solo_se_consulta_con_credenciales(self):
        with patch.object(fx, '_leer_json') as leer:
            self.assertIsNone(fx._desde_bcch())
            leer.assert_not_called()

    @override_settings(BCCH_USUARIO='u', BCCH_CLAVE='c')
    def test_lee_la_respuesta_del_banco_central(self):
        respuesta = {'Series': {'Obs': [{'indexDateString': '04-11-2026', 'value': '948.10', 'statusCode': 'OK'},
                                        {'indexDateString': '05-11-2026', 'value': '950.00', 'statusCode': 'OK'}]}}
        with patch.object(fx, '_leer_json', return_value=respuesta):
            self.assertEqual(fx._desde_bcch(), (Decimal('950.00'), date(2026, 11, 5), 'Banco Central de Chile'))
