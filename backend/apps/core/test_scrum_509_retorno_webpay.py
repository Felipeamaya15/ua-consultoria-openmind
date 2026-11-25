"""SCRUM-509: el retorno de Webpay (POST) llega a la tienda sin HTTP 404."""
from django.test import TestCase
from rest_framework.test import APIClient

RETORNO = '/api/catalog/pagos/transbank/retorno/'
DESTINO = 'http://localhost:5173/plantilla/1/pedido-confirmado?orderNumber=ORD-1&tienda=1'


class RetornoWebpayTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def test_post_con_token_redirige_a_la_tienda(self):
        r = self.api.post(RETORNO + '?destino=' + DESTINO.replace('&', '%26').replace('?', '%3F'),
                          {'token_ws': 'abc123'})
        self.assertEqual(r.status_code, 303)
        self.assertTrue(r['Location'].startswith('http://localhost:5173/plantilla/1/pedido-confirmado?'))
        self.assertIn('token_ws=abc123', r['Location'])
        self.assertIn('orderNumber=ORD-1', r['Location'])

    def test_post_de_pago_abortado_conserva_tbk(self):
        r = self.api.post(RETORNO + '?destino=' + DESTINO.replace('&', '%26').replace('?', '%3F'),
                          {'TBK_TOKEN': 't', 'TBK_ORDEN_COMPRA': 'ORD-1', 'TBK_ID_SESION': 's'})
        self.assertEqual(r.status_code, 303)
        self.assertIn('TBK_TOKEN=t', r['Location'])
        self.assertIn('TBK_ORDEN_COMPRA=ORD-1', r['Location'])

    def test_get_tambien_redirige(self):
        r = self.api.get(RETORNO, {'destino': DESTINO, 'token_ws': 'x'})
        self.assertEqual(r.status_code, 303)
        self.assertIn('token_ws=x', r['Location'])

    def test_rechaza_destino_de_otro_dominio(self):
        r = self.api.post(RETORNO + '?destino=https://attacker.example/return', {'token_ws': 'x'})
        self.assertEqual(r.status_code, 400)
        self.assertNotIn('Location', r)
