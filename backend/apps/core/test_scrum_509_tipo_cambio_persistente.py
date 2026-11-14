"""el ultimo tipo de cambio bueno se guarda en la base de datos y sobrevive a la cache."""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from apps.core.infrastructure import tipo_cambio as fx
from apps.core.models import TipoCambioGuardado

DESCARGA = 'apps.core.infrastructure.tipo_cambio._descargar'


class TipoCambioPersistenteTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_un_dato_descargado_se_guarda_en_la_base_de_datos(self):
        with patch(DESCARGA, return_value=(Decimal('950.5'), date.today(), 'Banco Central de Chile')):
            fx.tipo_cambio_vigente()
        fila = TipoCambioGuardado.objects.get(pk=1)
        self.assertEqual(fila.observado, Decimal('950.5000'))
        self.assertEqual(fila.fuente, 'Banco Central de Chile')

    def test_sin_cache_ni_fuentes_se_usa_el_dato_guardado(self):
        with patch(DESCARGA, return_value=(Decimal('950.5'), date.today(), 'test')):
            fx.tipo_cambio_vigente()
        cache.clear()  # simula un reinicio del servidor
        with patch(DESCARGA, return_value=None):
            self.assertEqual(fx.tipo_cambio_vigente().observado, Decimal('950.5'))

    @override_settings(PAYPAL_FX_MAX_EDAD_HORAS=96)
    def test_el_dato_guardado_muy_antiguo_no_se_usa(self):
        with patch(DESCARGA, return_value=(Decimal('950.5'), date(2020, 1, 1), 'test')):
            self.assertIsNone(fx.tipo_cambio_vigente())

    def test_un_dato_guardado_reciente_evita_descargar_de_nuevo(self):
        with patch(DESCARGA, return_value=(Decimal('950.5'), date.today(), 'test')):
            fx.tipo_cambio_vigente()
        cache.clear()
        with patch(DESCARGA) as descarga:
            self.assertEqual(fx.tipo_cambio_vigente().observado, Decimal('950.5'))
            descarga.assert_not_called()
