"""SCRUM-509: integración TUU Pago Online (adaptador independiente de Transbank)."""
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from apps.catalog.infrastructure.adapters.tuu_adapter import (
    TuuPagoOnlineAdapter, TuuServicioNoDisponibleException, TuuTransaccionException, firma_valida, firmar,
)
from apps.core.models import ConfiguracionPago, Pedido, Tienda
from apps.core.payments import payment_methods_for_store

CLAVE = 'clave-secreta-de-prueba'
CALLBACK = '/api/pagos/tuu/callback/?tienda='


class FirmaTuuTests(SimpleTestCase):
    def test_firma_ignora_campos_no_x_y_el_orden_de_entrada(self):
        a = {'x_amount': '1000', 'x_account_id': '1', 'otro': 'zzz'}
        b = {'x_account_id': '1', 'x_amount': '1000'}
        self.assertEqual(firmar(a, CLAVE), firmar(b, CLAVE))
        self.assertEqual(len(firmar(a, CLAVE)), 64)

    def test_firma_valida_detecta_alteraciones(self):
        datos = {'x_account_id': '1', 'x_amount': '1000'}
        datos['x_signature'] = firmar(datos, CLAVE)
        self.assertTrue(firma_valida(datos, CLAVE))
        self.assertFalse(firma_valida({**datos, 'x_amount': '1'}, CLAVE))
        self.assertFalse(firma_valida({'x_amount': '1000'}, CLAVE))


class AdaptadorTuuTests(SimpleTestCase):
    def crear(self):
        return TuuPagoOnlineAdapter('62224230', CLAVE).crear_intento(
            referencia='ORD-1', monto=19990, email='a@b.cl', nombre='Ana', apellido='Paz', telefono='+56911111111',
            descripcion='Pedido', tienda='Tienda', url_callback='https://x.cl/cb', url_complete='https://x.cl/ok',
            url_cancel='https://x.cl/no')

    @patch('apps.catalog.infrastructure.adapters.tuu_adapter.requests.post')
    def test_envia_firma_y_devuelve_la_url(self, post):
        post.return_value = Mock(status_code=200, json=lambda: {'url': 'https://pago.tuu.cl/abc'})
        self.assertEqual(self.crear(), 'https://pago.tuu.cl/abc')
        self.assertIn('x_signature', post.call_args.kwargs['data'])
        self.assertEqual(post.call_args.kwargs['headers']['X-REDIRECT'], 'false')
        self.assertEqual(post.call_args.kwargs['timeout'], 15)

    @patch('apps.catalog.infrastructure.adapters.tuu_adapter.requests.post')
    def test_sin_conexion_o_5xx_es_no_disponible(self, post):
        post.side_effect = requests.Timeout('detalle sensible')
        with self.assertRaises(TuuServicioNoDisponibleException) as error:
            self.crear()
        self.assertNotIn('detalle sensible', str(error.exception))
        post.side_effect = None
        post.return_value = Mock(status_code=503)
        with self.assertRaises(TuuServicioNoDisponibleException):
            self.crear()

    @patch('apps.catalog.infrastructure.adapters.tuu_adapter.requests.post')
    def test_respuesta_sin_url_falla(self, post):
        post.return_value = Mock(status_code=200, json=lambda: {})
        with self.assertRaises(TuuTransaccionException):
            self.crear()


class CallbackTuuTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='tuu-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda TUU', id_usuario_propietario=owner)
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={'tuu': {
            'enabled': True, 'fields': {'accountId': '62224230', 'secretKey': CLAVE}}})
        self.pedido = Pedido.objects.create(tienda=self.tienda, monto_total=Decimal('19990'), medio_pago='TUU',
                                            correo_contacto='a@b.cl', identificador='ORD-TUU-1')
        self.api = APIClient()

    def enviar(self, **cambios):
        datos = {'x_account_id': '62224230', 'x_reference': 'ORD-TUU-1', 'x_amount': '19990',
                 'x_currency': 'CLP', 'x_result': 'completed', **cambios}
        datos.setdefault('x_signature', firmar(datos, CLAVE))
        return self.api.post(CALLBACK + str(self.tienda.pk), datos)

    def test_el_checkout_lista_tuu_si_esta_configurado(self):
        self.assertEqual(payment_methods_for_store(self.tienda)['tuu'], {'enabled': True})

    def test_pago_completado_marca_pagado_y_es_idempotente(self):
        self.assertEqual(self.enviar().status_code, 200)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pagado')
        self.assertEqual(self.enviar().status_code, 200)

    def test_pago_fallido_no_confirma_la_compra(self):
        self.assertEqual(self.enviar(x_result='failed').status_code, 200)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_firma_invalida_se_rechaza(self):
        self.assertEqual(self.enviar(x_signature='0' * 64).status_code, 400)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_monto_distinto_se_rechaza(self):
        datos = {'x_account_id': '62224230', 'x_reference': 'ORD-TUU-1', 'x_amount': '1', 'x_result': 'completed'}
        datos['x_signature'] = firmar(datos, CLAVE)
        self.assertEqual(self.api.post(CALLBACK + str(self.tienda.pk), datos).status_code, 400)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_tienda_inexistente_se_rechaza(self):
        self.assertEqual(self.api.post(CALLBACK + '99999', {'x_result': 'completed'}).status_code, 400)
