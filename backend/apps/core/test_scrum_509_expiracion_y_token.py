"""SCRUM-509: token de Webpay vencido, expiracion de pedidos pendientes y doble clic / dos pestañas."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import ConfiguracionTransbank, ItemPedido, Pedido, Tienda

ADAPTADOR = 'apps.catalog.application.use_cases.TransbankWebpayAdapter'
REPOSITORIO = 'apps.catalog.infrastructure.repositories.ProductRepository'
URL = '/api/pagos/pedido/pagar/'
RETORNO = 'http://localhost:5173/plantilla/1/pedido-confirmado'


def _transaccion(n):
    return {'token': f'token-{n}', 'url': f'https://webpay.test/{n}'}


class ExpiracionYTokenTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        propietario = get_user_model().objects.create_user(username='exp-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=propietario)
        ConfiguracionTransbank.objects.create(
            id_tienda=self.tienda, codigo_comercio='597055555532', api_key='clave-qa', ambiente='INTEGRACION')
        self.pedido = Pedido.objects.create(
            tienda=self.tienda, monto_total=Decimal('10000'), estado='pendiente', nombre_contacto='Ana',
            correo_contacto='ana@example.com', medio_pago='Transbank', entrega={'metodo': 'Starken'})
        ItemPedido.objects.create(id_pedido=self.pedido, producto_mongo_id='a' * 24, sku='SKU-1', cantidad=2,
                                  precio_unitario=Decimal('5000'), nombre_producto='Polera')
        self.api = APIClient()

    def envejecer(self, **campos):
        """Mueve las fechas del pedido al pasado (fecha_creacion es auto_now_add: se usa update)."""
        Pedido.objects.filter(pk=self.pedido.pk).update(**campos)

    def pagar(self):
        return self.api.post(URL, {'order_number': self.pedido.identificador, 'email': 'ana@example.com',
                                   'return_url': RETORNO}, format='json')

    def token_guardado(self):
        return Pedido.objects.get(pk=self.pedido.pk).webpay_token

    # --- Manejo del token anterior ---
    @patch(ADAPTADOR)
    def test_dos_pestañas_a_la_vez_reciben_el_mismo_token_y_webpay_se_llama_una_vez(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = _transaccion(1)
        a, b = self.pagar(), self.pagar()
        self.assertEqual((a.status_code, b.status_code), (200, 200))
        self.assertEqual(a.data['data']['token'], b.data['data']['token'])
        adaptador.return_value.iniciar_transaccion.assert_called_once()

    @patch(ADAPTADOR)
    def test_un_token_vencido_se_reemplaza_por_una_transaccion_nueva_del_mismo_pedido(self, adaptador):
        adaptador.return_value.iniciar_transaccion.side_effect = [_transaccion(1), _transaccion(2)]
        self.assertEqual(self.pagar().data['data']['token'], 'token-1')
        self.envejecer(webpay_iniciado_en=timezone.now() - timedelta(minutes=31))
        r = self.pagar()
        self.assertEqual(r.data['data']['token'], 'token-2')
        self.assertEqual(self.token_guardado(), 'token-2')
        llamadas = adaptador.return_value.iniciar_transaccion.call_args_list
        self.assertEqual(llamadas[0].kwargs['orden_compra'], llamadas[1].kwargs['orden_compra'])  # mismo pedido
        self.assertEqual(Pedido.objects.count(), 1)

    @patch(ADAPTADOR)
    def test_un_token_dentro_de_su_vigencia_se_reutiliza(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = _transaccion(1)
        self.pagar()
        self.envejecer(webpay_iniciado_en=timezone.now() - timedelta(minutes=10))
        self.assertEqual(self.pagar().data['data']['token'], 'token-1')
        adaptador.return_value.iniciar_transaccion.assert_called_once()

    @patch(ADAPTADOR)
    def test_un_pedido_con_token_anterior_a_este_cambio_sin_marca_de_inicio_tambien_se_renueva(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = _transaccion(2)
        self.envejecer(webpay_token='token-viejo', webpay_url='https://webpay.test/viejo',
                       fecha_creacion=timezone.now() - timedelta(minutes=90))
        self.assertEqual(self.pagar().data['data']['token'], 'token-2')

    # --- Expiracion y stock ---
    @patch(ADAPTADOR)
    def test_un_pedido_vencido_no_se_envia_a_webpay_y_se_cancela_devolviendo_el_stock(self, adaptador):
        self.envejecer(fecha_creacion=timezone.now() - timedelta(hours=3))
        repositorio = MagicMock()
        repositorio.restore_stock.return_value = True
        repositorio.get_by_id.return_value = {'variantes': [{'stock': 7}]}
        with patch(REPOSITORIO, return_value=repositorio), self.captureOnCommitCallbacks(execute=True):
            r = self.pagar()
        self.assertEqual((r.status_code, r.data['error']['codigo']), (409, 'PEDIDO_EXPIRADO'))
        adaptador.return_value.iniciar_transaccion.assert_not_called()
        self.assertEqual(Pedido.objects.get(pk=self.pedido.pk).estado, 'cancelado')
        repositorio.restore_stock.assert_called_once_with(str(self.tienda.pk), 'a' * 24, 'SKU-1', 2)
        with patch(REPOSITORIO, return_value=repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.pagar().status_code, 409)
        repositorio.restore_stock.assert_called_once()

    @patch(ADAPTADOR)
    def test_el_endpoint_de_inicio_de_webpay_tambien_rechaza_un_pedido_vencido(self, adaptador):
        self.envejecer(fecha_creacion=timezone.now() - timedelta(hours=3))
        r = self.api.post('/api/catalog/pagos/transbank/iniciar/', {
            'id_tienda': self.tienda.pk, 'orden_compra': self.pedido.identificador, 'email': 'ana@example.com',
            'monto': 10000, 'session_id': 'SES-1', 'return_url': RETORNO}, format='json')
        self.assertEqual(r.status_code, 400)
        adaptador.return_value.iniciar_transaccion.assert_not_called()

    def test_la_tarea_programada_cancela_cada_pedido_segun_su_plazo(self):
        repositorio = MagicMock()
        repositorio.restore_stock.return_value = True
        repositorio.get_by_id.return_value = {'variantes': []}

        def nuevo(correo, medio, estado='pendiente', **extra):
            return Pedido.objects.create(tienda=self.tienda, monto_total=Decimal('5000'), estado=estado,
                                         correo_contacto=correo, medio_pago=medio, **extra)

        reciente = nuevo('b@example.com', 'Transbank')
        en_curso = nuevo('c@example.com', 'Transbank', webpay_token='t', webpay_url='https://webpay.test/t',
                         webpay_iniciado_en=timezone.now() - timedelta(minutes=5))
        pagado = nuevo('e@example.com', 'Transbank', estado='pagado')
        transf_3h = nuevo('d@example.com', 'Transferencia')       # manual: aun dentro de sus 48 h
        transf_50h = nuevo('f@example.com', 'Transferencia')
        linkify_50h = nuevo('g@example.com', 'Linkify')
        paypal_viejo = nuevo('h@example.com', 'PayPal')           # sin orden en PayPal: nada que cobrar
        hace = lambda horas: timezone.now() - timedelta(hours=horas)
        Pedido.objects.filter(pk__in=[self.pedido.pk, en_curso.pk, pagado.pk, transf_3h.pk]).update(fecha_creacion=hace(3))
        Pedido.objects.filter(pk__in=[transf_50h.pk, linkify_50h.pk, paypal_viejo.pk]).update(fecha_creacion=hace(50))
        with patch(REPOSITORIO, return_value=repositorio), self.captureOnCommitCallbacks(execute=True):
            call_command('expirar_pedidos_pendientes', stdout=MagicMock())
        estados = {p.pk: p.estado for p in Pedido.objects.all()}
        self.assertEqual(estados[self.pedido.pk], 'cancelado')    # en linea, 3 h > 2 h
        self.assertEqual(estados[transf_50h.pk], 'cancelado')     # manual, 50 h > 48 h
        self.assertEqual(estados[linkify_50h.pk], 'cancelado')
        self.assertEqual(estados[reciente.pk], 'pendiente')
        self.assertEqual(estados[en_curso.pk], 'pendiente')       # pago de Webpay en curso: no se toca
        self.assertEqual(estados[transf_3h.pk], 'pendiente')      # la transferencia todavia tiene plazo
        self.assertEqual(estados[pagado.pk], 'pagado')
        self.assertEqual(estados[paypal_viejo.pk], 'cancelado')   # nunca se creo la orden de PayPal

    @patch(ADAPTADOR)
    def test_el_plazo_lo_define_cada_tienda(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = _transaccion(1)
        self.envejecer(fecha_creacion=timezone.now() - timedelta(hours=3))
        Tienda.objects.filter(pk=self.tienda.pk).update(horas_expiracion_pedido_en_linea=6)
        self.assertEqual(self.pagar().status_code, 200)  # con 6 h, un pedido de 3 h sigue vigente
        Tienda.objects.filter(pk=self.tienda.pk).update(horas_expiracion_pedido_en_linea=2)
        Pedido.objects.filter(pk=self.pedido.pk).update(webpay_token='', webpay_url='')
        with patch(REPOSITORIO, return_value=MagicMock()):
            self.assertEqual(self.pagar().status_code, 409)

    def test_los_plazos_por_defecto_son_2_horas_en_linea_y_48_manual(self):
        self.assertEqual((self.tienda.horas_expiracion_pedido_en_linea, self.tienda.horas_expiracion_pedido_manual), (2, 48))

    def test_el_propietario_edita_los_plazos_y_el_publico_no_los_ve(self):
        from rest_framework.authtoken.models import Token
        duenio = self.tienda.id_usuario_propietario
        admin = APIClient()
        admin.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.get_or_create(user=duenio)[0].key)
        r = admin.put('/api/tienda/configuracion/', {'nombre': 'Tienda Demo', 'horas_expiracion_pedido_en_linea': 4,
                                                   'horas_expiracion_pedido_manual': 72}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.tienda.refresh_from_db()
        self.assertEqual((self.tienda.horas_expiracion_pedido_en_linea, self.tienda.horas_expiracion_pedido_manual), (4, 72))
        malo = admin.put('/api/tienda/configuracion/', {'nombre': 'Tienda Demo', 'horas_expiracion_pedido_en_linea': 0}, format='json')
        self.assertEqual(malo.status_code, 400)
        publico = self.api.get(f'/api/tienda/configuracion/?tienda={self.tienda.pk}')
        self.assertNotIn('horas_expiracion_pedido_en_linea', publico.data['data'])


class PlazoManualSinVencimientoYStockTests(TestCase):
    """0 horas = nunca expira; el stock vuelve una sola vez y sin depender del comando programado."""

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.duenio = get_user_model().objects.create_user(username='plazo-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Cursos', id_usuario_propietario=self.duenio)
        self.repositorio = MagicMock()
        self.repositorio.restore_stock.return_value = True
        self.repositorio.get_by_id.return_value = {'variantes': [{'stock': 5}]}

    def pedido(self, medio='Transferencia', horas=60, estado='pendiente'):
        pedido = Pedido.objects.create(
            tienda=self.tienda, monto_total=Decimal('9990'), estado=estado, nombre_contacto='Ana',
            correo_contacto='ana@example.com', medio_pago=medio, entrega={'metodo': 'Retiro'})
        ItemPedido.objects.create(id_pedido=pedido, producto_mongo_id='b' * 24, sku='CURSO-1', cantidad=3,
                                  precio_unitario=Decimal('3330'), nombre_producto='Curso')
        Pedido.objects.filter(pk=pedido.pk).update(fecha_creacion=timezone.now() - timedelta(hours=horas))
        pedido.refresh_from_db()
        return pedido

    def expirar(self):
        from apps.core.infrastructure.expiracion_pedidos import expirar_pedidos_pendientes
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            return expirar_pedidos_pendientes()

    def test_con_cero_horas_el_pedido_manual_nunca_vence(self):
        from apps.core.infrastructure.expiracion_pedidos import pedido_expirado, vence_en
        Tienda.objects.filter(pk=self.tienda.pk).update(horas_expiracion_pedido_manual=0)
        pedido = self.pedido(horas=24 * 400)
        self.assertFalse(pedido_expirado(pedido))
        self.assertIsNone(vence_en(pedido))
        self.assertEqual(self.expirar(), 0)
        self.assertEqual(Pedido.objects.get(pk=pedido.pk).estado, 'pendiente')
        self.repositorio.restore_stock.assert_not_called()

    def test_cero_en_pagos_manuales_no_afecta_el_plazo_en_linea(self):
        Tienda.objects.filter(pk=self.tienda.pk).update(horas_expiracion_pedido_manual=0)
        pedido = self.pedido(medio='Transbank', horas=3)
        self.assertEqual(self.expirar(), 1)
        self.assertEqual(Pedido.objects.get(pk=pedido.pk).estado, 'cancelado')

    def test_una_semana_de_plazo_manual(self):
        Tienda.objects.filter(pk=self.tienda.pk).update(horas_expiracion_pedido_manual=168)
        dentro, fuera = self.pedido(horas=100), self.pedido(horas=200)
        self.assertEqual(self.expirar(), 1)
        self.assertEqual(Pedido.objects.get(pk=dentro.pk).estado, 'pendiente')
        self.assertEqual(Pedido.objects.get(pk=fuera.pk).estado, 'cancelado')

    def test_el_stock_se_devuelve_una_sola_vez(self):
        from apps.core.infrastructure.expiracion_pedidos import devolver_stock_de_pedido_cancelado
        pedido = self.pedido(horas=60)
        self.assertEqual(self.expirar(), 1)
        self.repositorio.restore_stock.assert_called_once_with(str(self.tienda.pk), 'b' * 24, 'CURSO-1', 3)
        pedido.refresh_from_db()
        self.assertTrue(pedido.stock_devuelto)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertFalse(devolver_stock_de_pedido_cancelado(pedido))
        self.repositorio.restore_stock.assert_called_once()

    def test_no_devuelve_stock_de_un_pedido_que_no_esta_cancelado(self):
        from apps.core.infrastructure.expiracion_pedidos import devolver_stock_de_pedido_cancelado
        pedido = self.pedido(horas=1)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertFalse(devolver_stock_de_pedido_cancelado(pedido))
        self.repositorio.restore_stock.assert_not_called()

    def test_rechazar_una_transferencia_devuelve_el_stock(self):
        pedido = self.pedido(horas=1)
        api = APIClient()
        api.force_authenticate(self.duenio)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            r = api.post(f'/api/pagos/transferencias/{pedido.pk}/rechazar/')
        self.assertEqual(r.status_code, 200, r.data)
        self.repositorio.restore_stock.assert_called_once_with(str(self.tienda.pk), 'b' * 24, 'CURSO-1', 3)

    def test_cancelar_a_mano_un_pedido_pagado_devuelve_stock_pero_uno_despachado_no(self):
        api = APIClient()
        api.force_authenticate(self.duenio)
        pagado, despachado = self.pedido(horas=1, estado='pagado'), self.pedido(horas=1, estado='en_camino')
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            for pedido in (pagado, despachado):
                r = api.patch(f'/api/tienda/pedidos/{pedido.pk}/estado/', {'estado': 'cancelado'}, format='json')
                self.assertEqual(r.status_code, 200, r.data)
        self.repositorio.restore_stock.assert_called_once()
        self.assertTrue(Pedido.objects.get(pk=pagado.pk).stock_devuelto)
        self.assertFalse(Pedido.objects.get(pk=despachado.pk).stock_devuelto)

    def test_las_consultas_liberan_los_pedidos_vencidos_sin_el_comando_programado(self):
        from apps.core.infrastructure.expiracion_pedidos import liberar_vencidos_de_tienda
        vencido, vigente = self.pedido(horas=60), self.pedido(horas=5)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(liberar_vencidos_de_tienda(self.tienda.pk), 1)
        self.assertEqual(Pedido.objects.get(pk=vencido.pk).estado, 'cancelado')
        self.assertEqual(Pedido.objects.get(pk=vigente.pk).estado, 'pendiente')
        otro = self.pedido(horas=60)
        api = APIClient()
        api.force_authenticate(self.duenio)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            r = api.get('/api/pagos/transferencias/pendientes/')
        ids = [fila['id_pedido'] for fila in r.data['data']]
        self.assertCountEqual(ids, [vigente.pk, otro.pk])
        self.assertEqual(Pedido.objects.get(pk=otro.pk).estado, 'pendiente')
        self.assertFalse(Pedido.objects.get(pk=otro.pk).stock_devuelto)
        self.repositorio.restore_stock.assert_called_once()  # solo la llamada directa de arriba
        self.assertTrue(all(fila['vence_en'] for fila in r.data['data']))
        from apps.core.infrastructure.expiracion_pedidos import expirar_pedidos_pendientes
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(expirar_pedidos_pendientes(), 1)
        self.assertEqual(Pedido.objects.get(pk=otro.pk).estado, 'cancelado')

    def test_el_propietario_guarda_solo_los_plazos_con_patch(self):
        api = APIClient()
        api.force_authenticate(self.duenio)
        r = api.patch('/api/tienda/configuracion/', {'horas_expiracion_pedido_manual': 0}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.tienda.refresh_from_db()
        self.assertEqual((self.tienda.nombre, self.tienda.horas_expiracion_pedido_manual), ('Tienda Cursos', 0))
        for invalido in ({'horas_expiracion_pedido_manual': 721}, {'horas_expiracion_pedido_manual': -1},
                         {'horas_expiracion_pedido_en_linea': 0}):
            self.assertEqual(api.patch('/api/tienda/configuracion/', invalido, format='json').status_code, 400)
        extraño = get_user_model().objects.create_user(username='plazo-otro')
        api.force_authenticate(extraño)
        self.assertEqual(api.patch('/api/tienda/configuracion/', {'horas_expiracion_pedido_manual': 1}, format='json').status_code, 403)

    def test_el_correo_de_recepcion_informa_el_plazo_y_el_de_cancelacion_el_motivo(self):
        from apps.core.domain.plantillas_correo import construir_correo
        pedido = self.pedido(horas=0)
        self.assertIn('Tienes hasta el', construir_correo('order_received', pedido).cuerpo)
        Tienda.objects.filter(pk=self.tienda.pk).update(horas_expiracion_pedido_manual=0)
        pedido = Pedido.objects.get(pk=pedido.pk)
        self.assertNotIn('Tienes hasta el', construir_correo('order_received', pedido).cuerpo)
        Tienda.objects.filter(pk=self.tienda.pk).update(horas_expiracion_pedido_manual=1)
        Pedido.objects.filter(pk=pedido.pk).update(fecha_creacion=timezone.now() - timedelta(hours=5))
        self.expirar()
        cancelado = Pedido.objects.get(pk=pedido.pk)
        self.assertEqual(cancelado.estado, 'cancelado')
        self.assertIn('venció el plazo', construir_correo('order_cancelled', cancelado).cuerpo)
