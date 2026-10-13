"""Últimas órdenes registradas (SCRUM-371 y SCRUM-376): listado liviano del dashboard."""
import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda

URL = '/api/tienda/pedidos/ultimos/'
CAMPOS = {'id_pedido', 'identificador', 'nombre_contacto', 'estado', 'estado_etiqueta', 'monto_total', 'fecha_creacion'}


class UltimasOrdenesTests(TestCase):
    def setUp(self):
        self.propietario = get_user_model().objects.create_user(username='dueno-ultimas')
        self.cliente = get_user_model().objects.create_user(username='cliente-ultimas')
        self.tienda = Tienda.objects.create(nombre='Tienda ultimas', id_usuario_propietario=self.propietario)
        self.api = APIClient()
        self.api.force_authenticate(self.propietario)
        self.ahora = timezone.now()

    def crear(self, numero, *, minutos=None, estado='pendiente', propia=True):
        """Crea una orden; `minutos` = hace cuánto se registró (mayor = más antigua)."""
        pedido = Pedido.objects.create(
            tienda=self.tienda if propia else None, monto_total=Decimal(1000 + numero), estado=estado,
            nombre_contacto=f'Cliente {numero}', correo_contacto=f'cliente{numero}@example.com',
            telefono_contacto='+56911112222', medio_pago='Linkify',
        )
        Pedido.objects.filter(pk=pedido.pk).update(
            fecha_creacion=self.ahora - timedelta(minutes=numero if minutos is None else minutos))
        return pedido

    def ids(self, respuesta):
        return [fila['id_pedido'] for fila in respuesta.json()['data']]

    # ------------------------------------------------------------------ qué devuelve
    def test_devuelve_las_cinco_mas_recientes_de_la_mas_nueva_a_la_mas_antigua(self):
        pedidos = [self.crear(numero) for numero in range(1, 9)]   # el 1 es el más reciente
        respuesta = self.api.get(URL)
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        cuerpo = respuesta.json()
        self.assertEqual((cuerpo['exito'], cuerpo['mensaje']), (True, 'Últimas órdenes obtenidas correctamente.'))
        self.assertEqual(self.ids(respuesta), [pedido.id_pedido for pedido in pedidos[:5]])

    def test_sin_ordenes_devuelve_una_lista_vacia(self):
        respuesta = self.api.get(URL)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()['data'], [])

    def test_incluye_ordenes_en_cualquier_estado_con_su_etiqueta(self):
        for numero, (estado, _) in enumerate(Pedido.ESTADO_CHOICES, start=1):
            self.crear(numero, estado=estado)
        filas = self.api.get(URL + '?limite=20').json()['data']
        self.assertEqual({fila['estado'] for fila in filas}, {valor for valor, _ in Pedido.ESTADO_CHOICES})
        etiquetas = dict(Pedido.ESTADO_CHOICES)
        for fila in filas:
            self.assertEqual(fila['estado_etiqueta'], etiquetas[fila['estado']])

    def test_la_misma_fecha_se_desempata_por_el_numero_de_pedido(self):
        primero = self.crear(1, minutos=10)
        segundo = self.crear(2, minutos=10)
        self.assertEqual(self.ids(self.api.get(URL)), [segundo.id_pedido, primero.id_pedido])

    def test_solo_trae_los_campos_que_necesita_la_tabla(self):
        self.crear(1)
        respuesta = self.api.get(URL)
        fila = respuesta.json()['data'][0]
        self.assertEqual(set(fila), CAMPOS)
        texto = json.dumps(respuesta.json())
        for privado in ('example.com', '+569', 'correo', 'telefono', 'entrega', 'items', '"contacto"'):
            self.assertNotIn(privado, texto, privado)
        self.assertEqual(fila['monto_total'], '1001.00')
        self.assertTrue(fila['identificador'].startswith('ORD-'))

    def test_no_muestra_ordenes_que_no_son_de_la_tienda(self):
        propia = self.crear(1)
        self.crear(2, propia=False)
        self.assertEqual(self.ids(self.api.get(URL)), [propia.id_pedido])

    # ------------------------------------------------------------------ el límite
    def test_respeta_el_limite_pedido(self):
        for numero in range(1, 9):
            self.crear(numero)
        for limite, esperado in (('1', 1), ('3', 3), ('8', 8), ('20', 8), ('05', 5)):
            self.assertEqual(len(self.ids(self.api.get(URL + f'?limite={limite}'))), esperado, limite)

    def test_un_limite_invalido_se_rechaza_sin_consultar_ordenes(self):
        self.crear(1)
        for limite in ('0', '21', '-1', 'abc', '2.5', '', '%205', '5%20', '1e1', '99999', '٣', '²'):
            respuesta = self.api.get(URL + f'?limite={limite}')
            self.assertEqual(respuesta.status_code, 400, repr(limite))
            error = respuesta.json()
            self.assertEqual(error['error']['codigo'], 'LIMITE_INVALIDO', repr(limite))
            self.assertEqual(error['mensaje'], 'El límite debe ser un número entero entre 1 y 20.')
            self.assertFalse(error['exito'])

    # ------------------------------------------------------------------ quién puede verlo
    def test_solo_el_propietario_puede_consultarlo(self):
        self.crear(1)
        anonimo = APIClient()
        respuesta = anonimo.get(URL)
        self.assertEqual(respuesta.status_code, 401)
        self.assertNotIn('Cliente', respuesta.content.decode())
        self.api.force_authenticate(self.cliente)
        respuesta = self.api.get(URL)
        self.assertEqual(respuesta.status_code, 403)
        self.assertNotIn('Cliente', respuesta.content.decode())
        self.api.force_authenticate(self.propietario)
        self.assertEqual(self.api.get(URL).status_code, 200)

    def test_si_no_es_propietario_ni_se_revisa_el_limite(self):
        self.api.force_authenticate(self.cliente)
        self.assertEqual(self.api.get(URL + '?limite=abc').status_code, 403)

    def test_una_tienda_enviada_que_no_es_la_local_se_rechaza(self):
        self.assertEqual(self.api.get(URL + '?tienda_id=999').status_code, 400)

    def test_es_de_solo_lectura(self):
        for metodo in ('post', 'put', 'patch', 'delete'):
            self.assertEqual(getattr(self.api, metodo)(URL, {}, format='json').status_code, 405, metodo)

    def test_no_se_guarda_en_cache(self):
        self.assertEqual(self.api.get(URL)['Cache-Control'], 'no-store')

    # ------------------------------------------------------------------ costo y compatibilidad
    def test_la_cantidad_de_consultas_no_crece_con_la_cantidad_de_ordenes(self):
        for numero in range(1, 4):
            self.crear(numero)
        with CaptureQueriesContext(connection) as pocas:
            self.api.get(URL + '?limite=20')
        for numero in range(4, 40):
            self.crear(numero)
        with CaptureQueriesContext(connection) as muchas:
            respuesta = self.api.get(URL + '?limite=20')
        self.assertEqual(len(respuesta.json()['data']), 20)
        self.assertEqual(len(muchas), len(pocas))
        self.assertLessEqual(len(muchas), 4)

    def test_la_lista_completa_de_pedidos_no_cambia(self):
        pedido = self.crear(1)
        respuesta = self.api.get('/api/tienda/pedidos/')
        self.assertEqual(respuesta.status_code, 200)
        self.assertIsInstance(respuesta.data, list)
        self.assertEqual(respuesta.data[0]['identificador'], pedido.identificador)
