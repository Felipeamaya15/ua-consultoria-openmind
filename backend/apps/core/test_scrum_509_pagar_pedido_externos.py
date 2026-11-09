"""SCRUM-509: 'Pagar ahora' de un pedido pendiente con PayPal y Mercado Pago."""
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.core.cache import cache
from django.test import override_settings

from apps.catalog.domain.exceptions import PagoGatewayException
from apps.catalog.domain.ports.payment_gateway import PagoIniciado
from apps.core.models import Pedido
from apps.core.test_scrum_509_paypal_mercadopago import BaseTienda, DESCARGA, MP, PP

URL = '/api/pagos/pedido/pagar/'
RETORNO = 'http://localhost:5173/plantilla/1/pedido-confirmado'


def consulta(url):
    return parse_qs(urlsplit(url).query)


class PagarPedidoExternosTests(BaseTienda):
    medio = 'PayPal'

    def pagar(self, **datos):
        cuerpo = {'order_number': 'ORD-X', 'email': 'a@b.cl', 'return_url': RETORNO, **datos}
        return self.api.post(URL, cuerpo, format='json')

    @override_settings(PAYPAL_FX_MARGEN_PCT='2')
    @patch(DESCARGA, return_value=(Decimal('900'), date.today(), 'test'))
    @patch(PP)
    def test_paypal_crea_una_orden_nueva_en_usd_y_guarda_la_conversion(self, adaptador, _descarga):
        adaptador.return_value.create_order.return_value = {'id': 'OID-2', 'approve_url': 'https://paypal.test/ok'}
        r = self.pagar()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['data'], {'metodo': 'PayPal', 'accion': 'redirigir', 'url': 'https://paypal.test/ok'})
        llamada = adaptador.return_value.create_order.call_args.kwargs
        self.assertEqual((llamada['amount'], llamada['currency']), (20.7, 'USD'))
        retorno, cancelacion = consulta(llamada['return_url']), consulta(llamada['cancel_url'])
        self.assertEqual(retorno['gateway'], ['paypal'])
        self.assertEqual(retorno['orderNumber'], ['ORD-X'])
        self.assertEqual(retorno['tienda'], [str(self.tienda.pk)])
        self.assertEqual(cancelacion['cancelado'], ['1'])
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.pago_fx['paypal_order_id'], 'OID-2')
        self.assertEqual(self.pedido.pago_fx['monto_usd'], '20.70')

    @patch(DESCARGA, return_value=None)
    @patch(PP)
    def test_paypal_sin_tipo_de_cambio_no_inicia_el_cobro(self, adaptador, _descarga):
        cache.clear()
        self.assertEqual(self.pagar().status_code, 409)
        adaptador.return_value.create_order.assert_not_called()

    @patch(PP)
    @patch(DESCARGA, return_value=(Decimal('900'), date.today(), 'test'))
    def test_el_correo_sigue_siendo_obligatorio(self, _descarga, adaptador):
        self.assertEqual(self.pagar(email='otra@b.cl').status_code, 404)
        adaptador.return_value.create_order.assert_not_called()


class PagarPedidoMercadoPagoTests(BaseTienda):
    medio = 'MercadoPago'

    @patch(MP)
    def test_mercado_pago_crea_una_preferencia_nueva_con_el_monto_del_pedido(self, adaptador):
        adaptador.return_value.iniciar_pago.return_value = PagoIniciado(referencia='pref', url_pago='https://mp.test/pay')
        r = self.api.post(URL, {'order_number': 'ORD-X', 'email': 'a@b.cl', 'return_url': RETORNO}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['data'], {'metodo': 'MercadoPago', 'accion': 'redirigir', 'url': 'https://mp.test/pay'})
        args = adaptador.return_value.iniciar_pago.call_args.args
        self.assertEqual(args[1], Decimal('19000'))
        self.assertEqual(consulta(args[3])['gateway'], ['mercadopago'])
        self.assertEqual(consulta(args[3])['orderNumber'], ['ORD-X'])

    @patch(MP)
    def test_si_mercado_pago_no_responde_se_informa(self, adaptador):
        adaptador.return_value.iniciar_pago.side_effect = PagoGatewayException('caido')
        r = self.api.post(URL, {'order_number': 'ORD-X', 'email': 'a@b.cl', 'return_url': RETORNO}, format='json')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(Pedido.objects.get(pk=self.pedido.pk).estado, 'pendiente')
