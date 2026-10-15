"""Contrato, cálculos, fechas, autorización y regresión del dashboard."""
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.core.models import ItemPedido, Pedido, Tienda

URL = '/api/tienda/dashboard/'
ZONA = ZoneInfo('America/Santiago')


class DashboardTests(TestCase):
    def setUp(self):
        self.dueno = get_user_model().objects.create_user(username='dashboard-owner')
        self.otro = get_user_model().objects.create_user(username='dashboard-other')
        self.tienda = Tienda.objects.create(nombre='Dashboard', id_usuario_propietario=self.dueno)
        self.api = APIClient()
        self.api.force_authenticate(self.dueno)
        reloj = patch('apps.core.presentation.dashboard.timezone.now', return_value=datetime(2026, 10, 14, 12, tzinfo=ZONA))
        reloj.start()
        self.addCleanup(reloj.stop)

    def crear(self, estado='pagado', monto='1000.00', fecha='2026-10-14T12:00:00-03:00', propia=True):
        pedido = Pedido.objects.create(tienda=self.tienda if propia else None, estado=estado,
                                       monto_total=Decimal(monto), correo_contacto='test@example.com')
        Pedido.objects.filter(pk=pedido.pk).update(fecha_creacion=datetime.fromisoformat(fecha))
        return pedido

    def datos(self, parametros=None):
        response = self.api.get(URL, parametros or {})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response['Cache-Control'], 'no-store')
        return response.json()['data']

    def test_ventas_solo_estados_confirmados_y_conteo_todos_los_registros(self):
        for estado, _ in Pedido.ESTADO_CHOICES:
            self.crear(estado)
        data = self.datos()
        self.assertEqual(data['total_ventas'], '6000.00')
        self.assertEqual(data['total_pedidos'], 8)
        self.assertEqual(data['por_despachar'], 4)
        self.assertEqual(sum(Decimal(row['ventas']) for row in data['historico']), Decimal(data['total_ventas']))
        self.assertEqual(sum(row['pedidos'] for row in data['historico']), data['total_pedidos'])

    def test_pendientes_rechazados_y_cancelados_no_generan_ingresos(self):
        # El rechazo de transferencia se persiste como cancelado en el sistema.
        self.crear('pendiente')
        self.crear('cancelado')
        self.assertEqual(self.datos()['total_ventas'], '0.00')
        self.assertEqual(self.datos()['total_pedidos'], 2)

    def test_precision_decimal_y_no_duplicacion_por_identificador(self):
        a = self.crear(monto='0.10')
        b = self.crear(monto='0.20')
        for _ in range(2):
            ItemPedido.objects.create(id_pedido=a, cantidad=1, precio_unitario=Decimal('0.05'))
        Pedido.objects.filter(pk=b.pk).update(identificador=a.identificador)
        self.assertEqual(self.datos()['total_ventas'], '0.30')
        self.assertEqual(self.datos()['total_pedidos'], 2)

    def test_periodos_reales_no_se_anclan_al_ultimo_pedido(self):
        self.crear(fecha='2025-01-01T12:00:00-03:00')
        for periodo, inicio, dias in [('7', '2026-10-08', 7), ('30', '2026-09-15', 30), ('year', '2026-01-01', 287)]:
            data = self.datos({'periodo': periodo})
            self.assertEqual((data['fecha_desde'], data['fecha_hasta']), (inicio, '2026-10-14'))
            self.assertEqual(len(data['historico']), dias)
            self.assertEqual(data['total_pedidos'], 0)

    def test_limites_dia_chileno_inclusivos_y_dia_siguiente_excluido(self):
        self.crear(fecha='2026-10-08T02:59:59+00:00')
        self.crear(fecha='2026-10-08T03:00:00+00:00')
        self.crear(fecha='2026-10-15T02:59:59+00:00')
        self.crear(fecha='2026-10-15T03:00:00+00:00')
        data = self.datos({'periodo': '7'})
        self.assertEqual(data['total_pedidos'], 2)
        self.assertEqual(data['historico'][0]['pedidos'], 1)
        self.assertEqual(data['historico'][-1]['pedidos'], 1)

    def test_rango_personalizado_y_dias_sin_datos(self):
        self.crear(fecha='2026-10-10T12:00:00-03:00')
        data = self.datos({'fecha_desde': '2026-10-09', 'fecha_hasta': '2026-10-11'})
        self.assertEqual([row['pedidos'] for row in data['historico']], [0, 1, 0])

    def test_cambio_horario_agrupa_por_dia_chileno(self):
        self.crear(fecha='2026-09-06T03:30:00+00:00')  # 5 de septiembre, antes del salto.
        self.crear(fecha='2026-09-06T04:30:00+00:00')  # 6 de septiembre, después del salto.
        data = self.datos({'fecha_desde': '2026-09-05', 'fecha_hasta': '2026-09-06'})
        self.assertEqual([row['pedidos'] for row in data['historico']], [1, 1])

    def test_vacio_devuelve_ceros_y_historico_diario(self):
        data = self.datos({'periodo': '7'})
        self.assertEqual((data['total_ventas'], data['total_pedidos'], data['por_despachar']), ('0.00', 0, 0))
        self.assertTrue(all(row['ventas'] == '0.00' and row['pedidos'] == 0 for row in data['historico']))

    def test_parametros_invalidos(self):
        for parametros in [
            {'periodo': ''}, {'periodo': '365'}, {'fecha_desde': '2026-10-01'},
            {'fecha_desde': '2026-02-30', 'fecha_hasta': '2026-10-14'},
            {'fecha_desde': '2026-10-15', 'fecha_hasta': '2026-10-14'},
            {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-15'},
            {'fecha_desde': '2025-01-01', 'fecha_hasta': '2026-10-14'},
            {'fecha_desde': '2026-1-01', 'fecha_hasta': '2026-10-14'},
            {'periodo': '7', 'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-14'},
        ]:
            response = self.api.get(URL, parametros)
            self.assertEqual(response.status_code, 400, parametros)
            self.assertEqual(response.json()['error']['codigo'], 'PERIODO_INVALIDO')
        self.assertEqual(self.api.get(URL + '?periodo=7&periodo=30').status_code, 400)

    def test_acceso_anonimo_ajeno_e_inactivo(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.api.force_authenticate(self.otro)
        self.assertEqual(self.api.get(URL).status_code, 403)
        self.dueno.is_active = False
        self.dueno.save()
        self.api.force_authenticate(self.dueno)
        self.assertEqual(self.api.get(URL).status_code, 403)

    def test_no_incluye_pedidos_sin_tienda_y_no_admite_suplantacion(self):
        self.crear()
        self.crear(monto='99999', propia=False)
        self.assertEqual(self.datos()['total_ventas'], '1000.00')
        self.assertEqual(self.api.get(URL, {'tienda_id': 999}).status_code, 400)
        self.assertEqual(self.api.get(URL, HTTP_X_TIENDA_ID='999').status_code, 400)

    def test_instalacion_con_dos_tiendas_no_expone_datos(self):
        otra = Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.otro)
        Pedido.objects.create(tienda=otra, monto_total=99999, estado='pagado', correo_contacto='other@example.com')
        response = self.api.get(URL, {'tienda_id': otra.pk})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('99999', response.content.decode())

    def test_sin_tienda_rechaza_consulta(self):
        self.tienda.delete()
        self.assertEqual(self.api.get(URL).status_code, 503)

    def test_solo_lectura_y_consultas_acotadas(self):
        self.crear()
        with CaptureQueriesContext(connection) as queries:
            self.datos()
        self.assertLessEqual(len(queries), 3)
        for metodo in ('post', 'put', 'patch', 'delete'):
            self.assertEqual(getattr(self.api, metodo)(URL).status_code, 405)

    def test_ultimas_ordenes_siguen_funcionando(self):
        pedido = self.crear()
        self.datos({'periodo': '7'})
        response = self.api.get('/api/tienda/pedidos/ultimos/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data'][0]['id_pedido'], pedido.pk)

    def test_comparacion_equivalente_ticket_y_distribucion_solo_de_la_tienda(self):
        self.crear(monto='1500.00', fecha='2026-10-08T00:00:00-03:00')
        self.crear(monto='3000.00')
        self.crear('pendiente', '999.00')
        self.crear('cancelado', '888.00')
        self.crear(monto='1000.00', fecha='2026-10-01T00:00:00-03:00')
        self.crear('pendiente', '9000.00', fecha='2026-10-07T23:59:59-03:00')
        self.crear(monto='999999.00', fecha='2026-09-30T23:59:59-03:00')
        self.crear(monto='999999.00', fecha='2026-10-01T12:00:00-03:00', propia=False)
        data = self.datos({'periodo': '7'})
        self.assertEqual((data['total_ventas'], data['total_pedidos'], data['pedidos_pagados']), ('4500.00', 4, 2))
        self.assertEqual(data['ticket_promedio'], '2250.00')
        self.assertEqual(data['comparacion'], {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-07',
            'total_ventas': '1000.00', 'total_pedidos': 2, 'variacion_ventas': '350.00', 'variacion_pedidos': '100.00'})
        distribution = {row['estado']: row['pedidos'] for row in data['distribucion_estados']}
        self.assertEqual(sum(distribution.values()), 4)
        self.assertEqual(distribution['pagado'], 2)
        self.assertEqual(distribution['pendiente'], 1)
        self.assertEqual(distribution['cancelado'], 1)
        self.assertEqual(set(distribution), {value for value, _ in Pedido.ESTADO_CHOICES})

    def test_sin_base_previa_no_inventa_porcentajes_y_ticket_sin_pagos_es_nulo(self):
        self.crear('pendiente')
        data = self.datos({'periodo': '7'})
        self.assertIsNone(data['ticket_promedio'])
        self.assertEqual(data['pedidos_pagados'], 0)
        self.assertIsNone(data['comparacion']['variacion_ventas'])
        self.assertIsNone(data['comparacion']['variacion_pedidos'])

    def test_disminucion_y_redondeo_del_ticket(self):
        self.crear(monto='0.01')
        self.crear(monto='0.00')
        self.crear(monto='1000.00', fecha='2026-10-01T12:00:00-03:00')
        data = self.datos({'periodo': '7'})
        self.assertEqual(data['ticket_promedio'], '0.01')
        self.assertEqual(data['comparacion']['variacion_pedidos'], '100.00')
        self.assertEqual(data['comparacion']['variacion_ventas'], '-100.00')

    def test_periodo_vacio_despues_de_ventas_muestra_menos_cien(self):
        self.crear(monto='1000.00', fecha='2026-10-01T12:00:00-03:00')
        data = self.datos({'periodo': '7'})
        self.assertEqual(data['comparacion']['variacion_ventas'], '-100.00')
        self.assertEqual(data['comparacion']['variacion_pedidos'], '-100.00')
        self.assertTrue(all(row['pedidos'] == 0 for row in data['distribucion_estados']))

    def test_comparacion_anual_tiene_igual_cantidad_de_dias_calendario(self):
        from datetime import date
        data = self.datos({'periodo': 'year'})
        comparison = data['comparacion']
        self.assertEqual((date.fromisoformat(comparison['fecha_hasta']) - date.fromisoformat(comparison['fecha_desde'])).days + 1, len(data['historico']))
