"""Historial de ventas y de pedidos: acceso, contrato, cálculos, validaciones y hora de Chile."""
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda

VENTAS = '/api/tienda/ventas/historial/'
PEDIDOS = '/api/tienda/pedidos/historial/'
DASHBOARD = '/api/tienda/dashboard/'
ZONA = ZoneInfo('America/Santiago')


class HistorialTests(TestCase):
    def setUp(self):
        self.dueno = get_user_model().objects.create_user(username='historial-owner')
        self.comprador = get_user_model().objects.create_user(username='historial-buyer')
        self.tienda = Tienda.objects.create(nombre='Historial', id_usuario_propietario=self.dueno)
        self.api = APIClient()
        self.api.force_authenticate(self.dueno)

    def crear(self, fecha, monto='1000.00', estado='pagado', propia=True):
        pedido = Pedido.objects.create(tienda=self.tienda if propia else None, estado=estado,
                                       monto_total=Decimal(monto), correo_contacto='test@example.com')
        Pedido.objects.filter(pk=pedido.pk).update(fecha_creacion=datetime.fromisoformat(fecha))
        return pedido

    def get(self, url, parametros=None, estado=200):
        response = self.api.get(url, parametros or {})
        self.assertEqual(response.status_code, estado, response.content)
        return response

    def codigo_de_error(self, url, parametros):
        response = self.get(url, parametros, 400)
        return response.json()['error']['codigo']

    # --- acceso ---

    def test_sin_sesion_y_con_comprador(self):
        for url in (VENTAS, PEDIDOS):
            self.assertEqual(APIClient().get(url).status_code, 401)
            self.api.force_authenticate(self.comprador)
            self.assertEqual(self.api.get(url).status_code, 403)
            self.api.force_authenticate(self.dueno)

    # --- historial de ventas: contrato y cálculos ---

    def test_contrato_y_resumen_de_ventas(self):
        self.crear('2026-10-10T12:00:00-03:00', '18990.00')
        self.crear('2026-10-11T12:00:00-03:00', '1010.00', estado='entregado')
        self.crear('2026-10-12T12:00:00-03:00', '500.00', estado='pendiente')   # no es venta
        self.crear('2026-10-12T13:00:00-03:00', '700.00', estado='cancelado')   # no es venta
        self.crear('2026-10-12T14:00:00-03:00', '9999.00', propia=False)        # sin tienda
        response = self.get(VENTAS)
        data = response.json()['data']
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(data['resumen'], {'cantidad_ventas': 2, 'total_vendido': '20000.00', 'ticket_promedio': '10000.00'})
        self.assertEqual(data['agrupacion'], 'mes')
        self.assertEqual(data['serie'], [{'periodo': '2026-10', 'cantidad_ventas': 2, 'total_vendido': '20000.00'}])
        self.assertEqual([fila['monto_total'] for fila in data['ventas']], ['1010.00', '18990.00'])   # la más reciente primero
        self.assertEqual(response.json()['paginacion'], {'pagina': 1, 'tamano': 20, 'total': 2, 'total_paginas': 1})
        suma = Pedido.objects.filter(tienda=self.tienda, estado__in=Pedido.ESTADOS_PAGADOS).aggregate(t=Sum('monto_total'))['t']
        self.assertEqual(format(suma, '.2f'), data['resumen']['total_vendido'])

    def test_sin_ventas_devuelve_resumen_en_cero(self):
        data = self.get(VENTAS).json()['data']
        self.assertEqual(data['resumen'], {'cantidad_ventas': 0, 'total_vendido': '0.00', 'ticket_promedio': '0.00'})
        self.assertEqual((data['serie'], data['ventas']), ([], []))

    def test_agrupacion_por_dia_y_por_mes(self):
        self.crear('2026-09-30T12:00:00-03:00', '1000.00')
        self.crear('2026-10-01T12:00:00-03:00', '2000.00')
        self.crear('2026-10-01T15:00:00-03:00', '3000.00')
        rango = {'fecha_desde': '2026-09-01', 'fecha_hasta': '2026-10-31'}
        por_dia = self.get(VENTAS, {**rango, 'agrupacion': 'dia'}).json()['data']['serie']
        self.assertEqual([(f['periodo'], f['cantidad_ventas'], f['total_vendido']) for f in por_dia],
                         [('2026-09-30', 1, '1000.00'), ('2026-10-01', 2, '5000.00')])
        por_mes = self.get(VENTAS, {**rango, 'agrupacion': 'mes'}).json()['data']['serie']
        self.assertEqual([(f['periodo'], f['total_vendido']) for f in por_mes],
                         [('2026-09', '1000.00'), ('2026-10', '5000.00')])

    def test_paginacion(self):
        for dia in range(1, 6):
            self.crear(f'2026-10-0{dia}T12:00:00-03:00')
        response = self.get(VENTAS, {'tamano': 2, 'pagina': 2})
        self.assertEqual(len(response.json()['data']['ventas']), 2)
        self.assertEqual(response.json()['paginacion'], {'pagina': 2, 'tamano': 2, 'total': 5, 'total_paginas': 3})

    # --- validaciones ---

    def test_validaciones_de_la_consulta(self):
        self.assertEqual(self.codigo_de_error(VENTAS, {'tamano': 101}), 'TAMANO_INVALIDO')
        self.assertEqual(self.codigo_de_error(VENTAS, {'tamano': 0}), 'TAMANO_INVALIDO')
        self.assertEqual(self.codigo_de_error(VENTAS, {'pagina': 0}), 'PAGINA_INVALIDA')
        self.assertEqual(self.codigo_de_error(VENTAS, {'agrupacion': 'semana'}), 'AGRUPACION_INVALIDA')
        self.assertEqual(self.codigo_de_error(VENTAS, {'agrupacion': 'dia'}), 'RANGO_DEMASIADO_AMPLIO')
        self.assertEqual(self.codigo_de_error(VENTAS, {'agrupacion': 'dia', 'fecha_desde': '2025-01-01', 'fecha_hasta': '2026-10-31'}),
                         'RANGO_DEMASIADO_AMPLIO')
        self.assertEqual(self.codigo_de_error(VENTAS, {'fecha_desde': '2026-10-31', 'fecha_hasta': '2026-10-01'}),
                         'RANGO_FECHAS_INVALIDO')
        self.assertEqual(self.codigo_de_error(VENTAS, {'fecha_desde': '31-10-2026'}), 'FECHA_INVALIDA')
        self.assertEqual(self.codigo_de_error(VENTAS, {'fecha_desde': '2026-02-30'}), 'FECHA_INVALIDA')
        self.get(VENTAS, {'agrupacion': 'dia', 'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-31'})

    # --- hora de Chile ---

    def test_la_venta_nocturna_cuenta_en_su_dia_y_mes_en_hora_de_chile(self):
        # 31/08 22:30 en Chile = 01/09 02:30 UTC
        self.crear('2026-08-31T22:30:00-04:00', '18990.00')
        dia = {'fecha_desde': '2026-08-31', 'fecha_hasta': '2026-08-31'}
        historial = self.get(VENTAS, dia).json()['data']
        dashboard = self.get(DASHBOARD, dia).json()['data']
        self.assertEqual(historial['resumen']['cantidad_ventas'], dashboard['total_pedidos'])
        self.assertEqual(historial['resumen']['total_vendido'], dashboard['total_ventas'])
        self.assertEqual(historial['resumen']['total_vendido'], '18990.00')
        mensual = self.get(VENTAS, {'fecha_desde': '2026-08-01', 'fecha_hasta': '2026-09-30', 'agrupacion': 'mes'}).json()['data']['serie']
        self.assertEqual([(f['periodo'], f['total_vendido']) for f in mensual], [('2026-08', '18990.00')])
        diaria = self.get(VENTAS, {'fecha_desde': '2026-08-31', 'fecha_hasta': '2026-09-01', 'agrupacion': 'dia'}).json()['data']['serie']
        self.assertEqual([f['periodo'] for f in diaria], ['2026-08-31'])

    def test_el_historial_de_pedidos_usa_la_hora_de_chile(self):
        self.crear('2026-08-31T22:30:00-04:00')
        self.crear('2026-09-01T00:05:00-04:00')
        dia = {'fecha_desde': '2026-08-31', 'fecha_hasta': '2026-08-31'}
        self.assertEqual(self.get(PEDIDOS, dia).json()['paginacion']['total'], 1)

    # --- historial de pedidos ---

    def test_historial_de_pedidos_filtros_y_orden(self):
        self.crear('2026-10-10T12:00:00-03:00', '3000.00', estado='pendiente')
        self.crear('2026-10-11T12:00:00-03:00', '1000.00', estado='pagado')
        self.crear('2026-10-12T12:00:00-03:00', '2000.00', estado='cancelado')
        todos = self.get(PEDIDOS).json()
        self.assertEqual([p['monto_total'] for p in todos['data']], ['2000.00', '1000.00', '3000.00'])
        self.assertEqual(todos['paginacion']['total'], 3)
        pagados = self.get(PEDIDOS, {'estado': 'pagado'}).json()
        self.assertEqual([p['monto_total'] for p in pagados['data']], ['1000.00'])
        por_monto = self.get(PEDIDOS, {'orden': 'monto_asc'}).json()['data']
        self.assertEqual([p['monto_total'] for p in por_monto], ['1000.00', '2000.00', '3000.00'])
        self.assertEqual(self.codigo_de_error(PEDIDOS, {'estado': 'inexistente'}), 'ESTADO_INVALIDO')
        self.assertEqual(self.codigo_de_error(PEDIDOS, {'orden': 'azar'}), 'ORDEN_INVALIDO')

    def test_historial_de_pedidos_con_serie_por_dia_y_mes(self):
        self.crear('2026-08-31T22:30:00-04:00', estado='pendiente')   # 01/09 UTC, 31/08 en Chile
        self.crear('2026-09-01T10:00:00-04:00', estado='cancelado')
        self.crear('2026-09-01T12:00:00-04:00', estado='pagado')
        self.crear('2026-09-01T12:00:00-04:00', estado='pagado', propia=False)   # sin tienda
        rango = {'fecha_desde': '2026-08-01', 'fecha_hasta': '2026-09-30'}
        sin_serie = self.get(PEDIDOS, rango).json()
        self.assertNotIn('serie', sin_serie)
        por_dia = self.get(PEDIDOS, {**rango, 'agrupacion': 'dia'}).json()
        self.assertEqual(por_dia['agrupacion'], 'dia')
        self.assertEqual(por_dia['serie'], [{'periodo': '2026-08-31', 'cantidad_pedidos': 1},
                                            {'periodo': '2026-09-01', 'cantidad_pedidos': 2}])
        self.assertEqual(len(por_dia['data']), 3)
        por_mes = self.get(PEDIDOS, {**rango, 'agrupacion': 'mes'}).json()['serie']
        self.assertEqual(por_mes, [{'periodo': '2026-08', 'cantidad_pedidos': 1}, {'periodo': '2026-09', 'cantidad_pedidos': 2}])
        con_estado = self.get(PEDIDOS, {**rango, 'agrupacion': 'dia', 'estado': 'pagado'}).json()['serie']
        self.assertEqual(con_estado, [{'periodo': '2026-09-01', 'cantidad_pedidos': 1}])
        self.assertEqual(self.codigo_de_error(PEDIDOS, {'agrupacion': 'dia'}), 'RANGO_DEMASIADO_AMPLIO')
        self.assertEqual(self.codigo_de_error(PEDIDOS, {'agrupacion': 'semana'}), 'AGRUPACION_INVALIDA')
