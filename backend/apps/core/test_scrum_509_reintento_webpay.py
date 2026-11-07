"""SCRUM-509: tras un pago Webpay rechazado o anulado se puede reintentar el mismo pedido."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.application.use_cases import ConfirmarPagoTransbankUseCase
from apps.catalog.domain.exceptions import TransbankRechazoException
from apps.core.models import ConfiguracionTransbank, Pedido, Tienda

ADAPTADOR = 'apps.catalog.application.use_cases.TransbankWebpayAdapter'


class ReintentoWebpayTests(TestCase):
    def setUp(self):
        cache.clear()
        propietario = get_user_model().objects.create_user(username='reintento-webpay-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=propietario)
        ConfiguracionTransbank.objects.create(
            id_tienda=self.tienda, codigo_comercio='597055555532', api_key='clave-qa', ambiente='INTEGRACION')
        self.pedido = Pedido.objects.create(
            tienda=self.tienda, monto_total=Decimal('10000'), estado='pendiente', nombre_contacto='Ana',
            correo_contacto='ana@example.com', medio_pago='Transbank', entrega={'metodo': 'Starken'})
        self.api = APIClient()

    def iniciar(self):
        return self.api.post('/api/catalog/pagos/transbank/iniciar/', {
            'id_tienda': self.tienda.pk, 'orden_compra': self.pedido.identificador, 'email': 'ana@example.com',
            'monto': 10000, 'session_id': 'SES-1', 'return_url': 'http://localhost:5173/plantilla/1/pedido-confirmado',
        }, format='json')

    def estado_token(self):
        pedido = Pedido.objects.get(pk=self.pedido.pk)
        return pedido.estado, pedido.webpay_token

    def rechazado(self):
        adaptador = MagicMock()
        adaptador.confirmar_transaccion.side_effect = TransbankRechazoException('Rechazada por la entidad emisora.')
        return adaptador

    @patch(ADAPTADOR)
    def test_tras_un_rechazo_se_puede_pagar_de_nuevo_con_una_transaccion_nueva(self, adaptador):
        adaptador.return_value.iniciar_transaccion.side_effect = [
            {'token': 'token-uno', 'url': 'https://webpay.test/uno'},
            {'token': 'token-dos', 'url': 'https://webpay.test/dos'},
        ]
        self.assertEqual(self.iniciar().data['data']['token'], 'token-uno')
        with patch(ADAPTADOR, return_value=self.rechazado()):
            with self.assertRaises(TransbankRechazoException):
                ConfirmarPagoTransbankUseCase().execute(id_tienda=self.tienda.pk, token_ws='token-uno')
        self.assertEqual(self.estado_token(), ('pendiente', ''))
        segundo = self.iniciar()
        self.assertEqual(segundo.status_code, 200, segundo.data)
        self.assertEqual(segundo.data['data'], {'token': 'token-dos', 'url': 'https://webpay.test/dos'})
        self.assertEqual(Pedido.objects.count(), 1)  # mismo pedido, sin duplicar

    @patch(ADAPTADOR)
    def test_tras_anular_el_pago_en_webpay_se_puede_pagar_de_nuevo(self, adaptador):
        adaptador.return_value.iniciar_transaccion.side_effect = [
            {'token': 'token-uno', 'url': 'https://webpay.test/uno'},
            {'token': 'token-dos', 'url': 'https://webpay.test/dos'},
        ]
        self.iniciar()
        r = self.api.post('/api/catalog/pagos/transbank/abortado/',
                          {'id_tienda': self.tienda.pk, 'tbk_token': 'token-uno'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.estado_token(), ('pendiente', ''))
        self.assertEqual(self.iniciar().data['data']['token'], 'token-dos')

    @patch(ADAPTADOR)
    def test_un_intento_en_curso_sigue_reutilizando_su_token(self, adaptador):
        adaptador.return_value.iniciar_transaccion.return_value = {'token': 'token-uno', 'url': 'https://webpay.test/uno'}
        self.iniciar()
        self.iniciar()
        adaptador.return_value.iniciar_transaccion.assert_called_once()

    def test_un_token_ajeno_o_de_un_pedido_pagado_no_se_descarta(self):
        Pedido.objects.filter(pk=self.pedido.pk).update(webpay_token='token-uno', webpay_url='https://webpay.test/uno')
        self.api.post('/api/catalog/pagos/transbank/abortado/',
                      {'id_tienda': self.tienda.pk, 'tbk_token': 'otro-token'}, format='json')
        self.assertEqual(self.estado_token(), ('pendiente', 'token-uno'))
        Pedido.objects.filter(pk=self.pedido.pk).update(estado='pagado')
        self.api.post('/api/catalog/pagos/transbank/abortado/',
                      {'id_tienda': self.tienda.pk, 'tbk_token': 'token-uno'}, format='json')
        self.assertEqual(self.estado_token(), ('pagado', 'token-uno'))
