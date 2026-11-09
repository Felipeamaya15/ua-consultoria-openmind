"""SCRUM-509: pagar de nuevo un pedido pendiente desde Seguimiento o Mis pedidos."""
from decimal import Decimal
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import ConfiguracionTransbank, Pedido, Tienda

ADAPTADOR = 'apps.catalog.application.use_cases.TransbankWebpayAdapter'
URL = '/api/pagos/pedido/pagar/'
RETORNO = 'http://localhost:5173/plantilla/1/pedido-confirmado'
WEBPAY = {'token': 'token-nuevo', 'url': 'https://webpay.test/pagar'}


class PagarPedidoPendienteTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        User = get_user_model()
        self.owner = User.objects.create_user(username='pp-owner')
        self.cliente = User.objects.create_user(username='pp-cliente', email='ana@example.com')
        self.otro = User.objects.create_user(username='pp-otro')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=self.owner)
        ConfiguracionTransbank.objects.create(
            id_tienda=self.tienda, codigo_comercio='597055555532', api_key='clave-qa', ambiente='INTEGRACION')
        self.pedido = Pedido.objects.create(
            tienda=self.tienda, comprador=self.cliente, monto_total=Decimal('10000'), estado='pendiente',
            nombre_contacto='Ana', correo_contacto='ana@example.com', medio_pago='Transbank',
            entrega={'metodo': 'Starken'})
        self.api = APIClient()

    def como(self, usuario):
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.get_or_create(user=usuario)[0].key)
        return cliente

    def pagar(self, cliente=None, **datos):
        cuerpo = {'order_number': self.pedido.identificador, 'return_url': RETORNO, 'email': 'ana@example.com'}
        cuerpo.update(datos)
        cuerpo = {k: v for k, v in cuerpo.items() if v is not None}
        return (cliente or self.api).post(URL, cuerpo, format='json')

    @patch(ADAPTADOR)
    def test_invitado_con_numero_y_correo_recibe_el_formulario_de_webpay(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = WEBPAY
        r = self.pagar()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['data'], {'metodo': 'Transbank', 'accion': 'formulario', **WEBPAY})
        llamada = adaptador.return_value.iniciar_transaccion.call_args.kwargs
        self.assertEqual(llamada['monto'], Decimal('10000'))  # el monto sale del pedido
        self.assertEqual(llamada['orden_compra'], self.pedido.identificador)
        destino = parse_qs(urlsplit(llamada['return_url']).query)['destino'][0]
        consulta = parse_qs(urlsplit(destino).query)
        self.assertEqual(consulta['orderNumber'], [self.pedido.identificador])
        self.assertEqual(consulta['tienda'], [str(self.tienda.pk)])  # lo fija el servidor, no el cliente
        self.assertEqual(r['Cache-Control'], 'no-store')

    @patch(ADAPTADOR)
    def test_el_correo_debe_coincidir_con_el_del_pedido_sin_importar_mayusculas(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = WEBPAY
        self.assertEqual(self.pagar(email='otra@example.com').status_code, 404)
        adaptador.return_value.iniciar_transaccion.assert_not_called()
        self.assertEqual(self.pagar(email='ANA@Example.com').status_code, 200)

    @patch(ADAPTADOR)
    def test_sin_sesion_el_correo_es_obligatorio(self, adaptador):
        self.assertEqual(self.pagar(email=None).status_code, 400)
        adaptador.return_value.iniciar_transaccion.assert_not_called()

    @patch(ADAPTADOR)
    def test_tras_varios_intentos_fallidos_se_bloquea(self, adaptador):
        codigos = [self.pagar(email='otra@example.com').status_code for _ in range(12)]
        self.assertEqual(codigos[0], 404)
        self.assertIn(429, codigos)
        adaptador.return_value.iniciar_transaccion.assert_not_called()

    @patch(ADAPTADOR)
    def test_cliente_con_sesion_paga_su_pedido_sin_indicar_el_correo(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = WEBPAY
        r = self.pagar(self.como(self.cliente), email=None)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['data']['token'], 'token-nuevo')

    @patch(ADAPTADOR)
    def test_un_cliente_no_puede_pagar_el_pedido_de_otro(self, adaptador):
        r = self.pagar(self.como(self.otro), email=None)
        self.assertEqual(r.status_code, 404)
        adaptador.return_value.iniciar_transaccion.assert_not_called()

    @patch(ADAPTADOR)
    def test_solo_los_pedidos_pendientes_con_medio_en_linea_se_pagan(self, adaptador):
        for cambios, esperado in (({'estado': 'pagado'}, 409), ({'estado': 'cancelado'}, 409),
                                  ({'estado': 'pendiente', 'medio_pago': 'Transferencia'}, 409)):
            Pedido.objects.filter(pk=self.pedido.pk).update(**cambios)
            self.assertEqual(self.pagar().status_code, esperado, cambios)
        adaptador.return_value.iniciar_transaccion.assert_not_called()

    @patch(ADAPTADOR)
    def test_solo_se_vuelve_a_la_tienda_configurada(self, adaptador):
        r = self.pagar(return_url='https://sitio-malicioso.example/pedido-confirmado')
        self.assertEqual(r.status_code, 400)
        adaptador.return_value.iniciar_transaccion.assert_not_called()

    @patch(ADAPTADOR)
    def test_si_webpay_no_responde_se_informa_y_se_puede_reintentar(self, adaptador):
        from apps.catalog.domain.exceptions import TransbankServicioNoDisponibleException
        adaptador.return_value.iniciar_transaccion.side_effect = [
            TransbankServicioNoDisponibleException('Webpay no disponible'), WEBPAY]
        self.assertEqual(self.pagar().status_code, 503)
        self.assertEqual(self.pagar().status_code, 200)

    @patch(ADAPTADOR)
    def test_despues_de_un_pago_rechazado_se_puede_pagar_con_una_transaccion_nueva(self, adaptador):
        adaptador.return_value.iniciar_transaccion.side_effect = [
            {'token': 'token-uno', 'url': 'https://webpay.test/uno'}, WEBPAY]
        self.assertEqual(self.pagar().data['data']['token'], 'token-uno')
        self.api.post('/api/catalog/pagos/transbank/abortado/',
                      {'id_tienda': self.tienda.pk, 'tbk_token': 'token-uno'}, format='json')
        self.assertEqual(self.pagar().data['data']['token'], 'token-nuevo')
        self.assertEqual(Pedido.objects.count(), 1)
