"""SCRUM-509: Mercado Pago y PayPal se cobran y confirman en el servidor."""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.catalog.domain.exceptions import PagoGatewayException
from apps.catalog.domain.ports.payment_gateway import EstadoPago, PagoIniciado, ResultadoPago
from apps.core.models import ConfiguracionMercadoPago, ConfiguracionPayPal, Pedido, Tienda

RETORNO = 'http://localhost:5173/plantilla/1/pedido-confirmado?orderNumber=ORD-X'
MP = 'apps.core.presentation.pagos_externos.MercadoPagoAdapter'
PP = 'apps.core.presentation.pagos_externos.PayPalAdapter'
DESCARGA = 'apps.core.infrastructure.tipo_cambio._descargar'


class BaseTienda(TestCase):
    medio = 'MercadoPago'

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        owner = get_user_model().objects.create_user(username=f'owner-{self.medio}')
        self.tienda = Tienda.objects.create(nombre='Tienda', id_usuario_propietario=owner)
        ConfiguracionMercadoPago.objects.create(id_tienda=self.tienda, activo=True, public_key='pk', access_token='tok')
        ConfiguracionPayPal.objects.create(id_tienda=self.tienda, activo=True, client_id='cid', client_secret='sec')
        self.pedido = Pedido.objects.create(tienda=self.tienda, monto_total=Decimal('19000'), medio_pago=self.medio,
                                            correo_contacto='a@b.cl', identificador='ORD-X')
        self.api = APIClient()

    def post(self, url, **datos):
        return self.api.post(url, {'tienda_id': self.tienda.pk, 'order_number': 'ORD-X', **datos}, format='json')


class MercadoPagoTests(BaseTienda):
    def test_se_ofrece_en_el_checkout(self):
        self.assertEqual(self.api.get('/api/pagos/activos/', {'tienda_id': self.tienda.pk}).data['data']['mercadopago'],
                         {'enabled': True})

    @patch(MP)
    def test_inicia_con_el_monto_del_pedido(self, adaptador):
        adaptador.return_value.iniciar_pago.return_value = PagoIniciado(referencia='pref', url_pago='https://mp.test/pay')
        r = self.post('/api/pagos/mercadopago/iniciar/', return_url=RETORNO, amount=1)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['data']['url'], 'https://mp.test/pay')
        self.assertEqual(adaptador.return_value.iniciar_pago.call_args.args[1], Decimal('19000'))

    def test_rechaza_retorno_a_otro_dominio(self):
        self.assertEqual(self.post('/api/pagos/mercadopago/iniciar/', return_url='https://attacker.example/x').status_code, 400)

    @patch(MP)
    def test_falla_de_la_pasarela_no_altera_el_pedido(self, adaptador):
        adaptador.return_value.iniciar_pago.side_effect = PagoGatewayException('x')
        self.assertEqual(self.post('/api/pagos/mercadopago/iniciar/', return_url=RETORNO).status_code, 503)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def confirmar(self, estado, monto='19000', orden='ORD-X'):
        with patch(MP) as adaptador:
            adaptador.return_value.consultar_pago.return_value = ResultadoPago(
                id_transaccion='123', orden_compra=orden, monto=Decimal(monto), estado=estado, detalle_estado='')
            return self.post('/api/pagos/mercadopago/confirmar/', payment_id='123')

    def test_pago_aprobado_marca_pagado(self):
        self.assertEqual(self.confirmar(EstadoPago.APROBADO).status_code, 200)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pagado')
        self.assertEqual(self.confirmar(EstadoPago.APROBADO).status_code, 200)  # recarga: idempotente

    def test_rechazado_o_pendiente_no_confirman(self):
        self.assertEqual(self.confirmar(EstadoPago.RECHAZADO).status_code, 402)
        self.assertEqual(self.confirmar(EstadoPago.PENDIENTE).status_code, 202)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_monto_u_orden_distinta_no_confirman(self):
        self.assertEqual(self.confirmar(EstadoPago.APROBADO, monto='1').status_code, 409)
        self.assertEqual(self.confirmar(EstadoPago.APROBADO, orden='OTRA').status_code, 409)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')


def dolar(valor='900', dias_atras=0):
    return (Decimal(valor), date.today() - timedelta(days=dias_atras), 'test')


@override_settings(PAYPAL_FX_MARGEN_PCT='2', PAYPAL_FX_MAX_EDAD_HORAS=96, PAYPAL_FX_REFRESCO_HORAS=6)
class PayPalTests(BaseTienda):
    """900 CLP/USD observado + 2 % de margen = 918 CLP/USD aplicado; 19.000 CLP = US$ 20,70."""
    medio = 'PayPal'

    def setUp(self):
        super().setUp()
        self.descarga = patch(DESCARGA, return_value=dolar())
        self.descarga.start()
        self.addCleanup(self.descarga.stop)

    def metodos(self):
        return self.api.get('/api/pagos/activos/', {'tienda_id': self.tienda.pk}).data['data']['paypal']

    def test_se_ofrece_con_el_tipo_de_cambio_informado_al_comprador(self):
        paypal = self.metodos()
        self.assertTrue(paypal['enabled'])
        self.assertEqual(paypal['fx']['tipo_cambio'], '918.0000')
        self.assertEqual(paypal['fx']['observado'], '900')
        self.assertEqual(paypal['fx']['margen_pct'], '2')
        self.assertEqual(paypal['fx']['moneda'], 'USD')

    def test_se_oculta_sin_dato_o_con_dato_desactualizado(self):
        self.descarga.stop()
        for resultado in (None, dolar(dias_atras=10)):
            cache.clear()
            with patch(DESCARGA, return_value=resultado):
                paypal = self.metodos()
            self.assertFalse(paypal['enabled'])
            self.assertTrue(paypal['reason'])
        self.descarga.start()

    def test_sin_tipo_de_cambio_no_inicia_el_cobro(self):
        with patch(DESCARGA, return_value=None):
            cache.clear()
            r = self.post('/api/pagos/paypal/iniciar/', return_url=RETORNO)
        self.assertEqual(r.status_code, 409)

    def iniciar(self, order_id='OID'):
        with patch(PP) as adaptador:
            adaptador.return_value.create_order.return_value = {
                'id': order_id, 'approve_url': 'https://paypal.test/approve'}
            r = self.post('/api/pagos/paypal/iniciar/', return_url=RETORNO, amount=1)
            return r, adaptador.return_value.create_order.call_args

    def test_inicia_en_usd_y_guarda_la_conversion_en_el_pedido(self):
        r, llamada = self.iniciar()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(llamada.kwargs['currency'], 'USD')
        self.assertEqual(llamada.kwargs['amount'], 20.7)  # 19000 / 918, el monto del cliente se ignora
        self.assertEqual(llamada.kwargs['reference_id'], 'ORD-X')
        self.assertEqual(r.data['data']['fx']['monto_usd'], '20.70')
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.pago_fx['monto_usd'], '20.70')
        self.assertEqual(self.pedido.pago_fx['tipo_cambio_aplicado'], '918.0000')
        self.assertEqual(self.pedido.pago_fx['tipo_cambio_observado'], '900')
        self.assertEqual(self.pedido.pago_fx['margen_pct'], '2')
        self.assertEqual(self.pedido.pago_fx['fecha_dato'], date.today().isoformat())
        self.assertEqual(self.pedido.pago_fx['paypal_order_id'], 'OID')

    def captura(self, valor='20.70', referencia='ORD-X', moneda='USD', order_id='OID'):
        datos = {'status': 'COMPLETED', 'purchase_units': [{'reference_id': referencia, 'payments': {'captures': [
            {'amount': {'value': valor, 'currency_code': moneda}}]}}]}
        with patch(PP) as adaptador:
            adaptador.return_value.capture_order.return_value = {'exito': True, 'data': datos}
            r = self.post('/api/pagos/paypal/capturar/', order_id=order_id)
            return r, adaptador.return_value.capture_order

    def test_captura_completa_marca_pagado_y_no_recaptura(self):
        self.iniciar()
        r, _ = self.captura()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['data']['monto_usd'], '20.70')
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pagado')
        with patch(PP) as adaptador:
            self.assertEqual(self.post('/api/pagos/paypal/capturar/', order_id='OID').status_code, 200)
            adaptador.return_value.capture_order.assert_not_called()

    def test_la_captura_se_valida_contra_el_monto_guardado_aunque_cambie_el_dolar(self):
        self.iniciar()
        cache.clear()
        with patch(DESCARGA, return_value=dolar('1000')):
            r, _ = self.captura()  # con 1.000 CLP/USD el calculo nuevo seria otro; vale lo guardado
        self.assertEqual(r.status_code, 200, r.data)

    def test_captura_fallida_no_confirma(self):
        self.iniciar()
        with patch(PP) as adaptador:
            adaptador.return_value.capture_order.return_value = {'exito': False, 'mensaje': 'x'}
            self.assertEqual(self.post('/api/pagos/paypal/capturar/', order_id='OID').status_code, 402)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_referencia_moneda_o_monto_distintos_no_confirman(self):
        self.iniciar()
        for cambios in ({'referencia': 'OTRA'}, {'moneda': 'CLP'}, {'valor': '1.00'}, {'valor': '20.69'}):
            self.assertEqual(self.captura(**cambios)[0].status_code, 409, cambios)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_no_captura_una_orden_que_el_servidor_no_creo_para_el_pedido(self):
        self.iniciar()
        r, capture = self.captura(order_id='AJENA')
        self.assertEqual(r.status_code, 409)
        capture.assert_not_called()
        Pedido.objects.filter(pk=self.pedido.pk).update(pago_fx={})  # sin conversion guardada
        r, capture = self.captura()
        self.assertEqual(r.status_code, 409)
        capture.assert_not_called()
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_se_puede_reintentar_y_solo_vale_la_ultima_orden_de_paypal(self):
        self.iniciar('OID-1')
        r, _ = self.iniciar('OID-2')  # el comprador reintenta el mismo pedido
        self.assertEqual(r.status_code, 200, r.data)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.pago_fx['paypal_order_id'], 'OID-2')
        r, capture = self.captura(order_id='OID-1')
        self.assertEqual(r.status_code, 409)
        capture.assert_not_called()
        self.assertEqual(self.captura(order_id='OID-2')[0].status_code, 200)
