"""Correos de pago exitoso y pago rechazado cuando el pago se confirma con Webpay ."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.application.use_cases import ConfirmarPagoTransbankUseCase
from apps.catalog.domain.exceptions import TransbankRechazoException
from apps.core.models import ConfiguracionTransbank, Pedido, Tienda


class CorreosWebpayBase(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        propietario = get_user_model().objects.create_user(username='correos-webpay-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=propietario)
        ConfiguracionTransbank.objects.create(
            id_tienda=self.tienda, codigo_comercio='597055555532', api_key='clave-qa', ambiente='INTEGRACION')
        self.pedido = Pedido.objects.create(
            tienda=self.tienda, monto_total=Decimal('18990'), estado='pendiente', nombre_contacto='Ana',
            correo_contacto='ana@example.com', medio_pago='Transbank', entrega={'metodo': 'Starken'},
            webpay_token='token-webpay', webpay_url='https://webpay.example/pagar',
        )

    def confirmar(self, adaptador):
        with patch('apps.catalog.application.use_cases.TransbankWebpayAdapter', return_value=adaptador):
            return ConfirmarPagoTransbankUseCase().execute(id_tienda=self.tienda.pk, token_ws='token-webpay')

    def estado(self):
        return Pedido.objects.get(pk=self.pedido.pk).estado

    def marca(self, tipo):
        return (Pedido.objects.get(pk=self.pedido.pk).entrega.get('notificaciones') or {}).get(tipo)


class CorreoPagoExitosoWebpayTests(CorreosWebpayBase):
    def aprobado(self):
        adaptador = MagicMock()
        adaptador.confirmar_transaccion.return_value = {'orden_compra': self.pedido.identificador, 'monto': 18990}
        return adaptador

    def test_al_aprobarse_el_pago_con_webpay_se_envia_el_correo_de_pago_exitoso(self):
        self.confirmar(self.aprobado())
        self.assertEqual(self.estado(), 'pagado')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['ana@example.com'])
        self.assertEqual(mail.outbox[0].subject, f'Tu pago fue confirmado · {self.pedido.identificador}')
        self.assertEqual(self.marca('payment_success')['codigo'], 'enviado')

    def test_al_aprobarse_webpay_correo_contiene_resumen_de_compra(self):
        from apps.core.models import ItemPedido
        ItemPedido.objects.create(
            id_pedido=self.pedido, nombre_producto='Mochila Outdoor', cantidad=1,
            precio_unitario=Decimal('18990'), sku='MOC-OUT'
        )
        self.confirmar(self.aprobado())
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertIn('Resumen de compra:', correo.body)
        self.assertIn('- Mochila Outdoor x 1: $18.990', correo.body)
        self.assertIn('$18.990', correo.body)

    def test_confirmar_otra_vez_el_mismo_pago_no_repite_el_correo(self):
        self.confirmar(self.aprobado())
        self.confirmar(self.aprobado())
        self.assertEqual(len(mail.outbox), 1)

    def test_si_el_correo_falla_el_pago_queda_registrado_igual(self):
        with patch('apps.core.infrastructure.notificaciones_pedido.enviar_correo', side_effect=RuntimeError('caído')):
            self.confirmar(self.aprobado())
        self.assertEqual(self.estado(), 'pagado')


class CorreoPagoRechazadoWebpayTests(CorreosWebpayBase):
    def rechazado(self):
        adaptador = MagicMock()
        adaptador.confirmar_transaccion.side_effect = TransbankRechazoException('Rechazada por la entidad emisora.')
        return adaptador

    def test_al_rechazarse_el_pago_con_webpay_se_envia_el_correo_de_pago_rechazado(self):
        with self.assertRaises(TransbankRechazoException):
            self.confirmar(self.rechazado())
        self.assertEqual(self.estado(), 'pendiente')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['ana@example.com'])
        self.assertEqual(mail.outbox[0].subject, f'No pudimos confirmar tu pago · {self.pedido.identificador}')
        self.assertEqual(self.marca('payment_rejected')['codigo'], 'enviado')

    def test_un_segundo_rechazo_no_repite_el_correo(self):
        for _ in range(2):
            with self.assertRaises(TransbankRechazoException):
                self.confirmar(self.rechazado())
        self.assertEqual(len(mail.outbox), 1)

    def test_si_el_correo_falla_el_rechazo_se_informa_igual(self):
        with patch('apps.core.infrastructure.notificaciones_pedido.enviar_correo', side_effect=RuntimeError('caído')):
            with self.assertRaises(TransbankRechazoException):
                self.confirmar(self.rechazado())
        self.assertEqual(self.estado(), 'pendiente')

    def test_no_se_envia_si_el_token_no_corresponde_a_un_pedido_pendiente(self):
        Pedido.objects.filter(pk=self.pedido.pk).update(estado='pagado')
        with self.assertRaises(TransbankRechazoException):
            self.confirmar(self.rechazado())
        self.assertEqual(mail.outbox, [])

    def test_otros_errores_de_webpay_no_envian_correo(self):
        from apps.catalog.domain.exceptions import TransbankTransaccionException
        adaptador = MagicMock()
        adaptador.confirmar_transaccion.side_effect = TransbankTransaccionException('Webpay no responde.')
        with self.assertRaises(TransbankTransaccionException):
            self.confirmar(adaptador)
        self.assertEqual(mail.outbox, [])


class CorreoPagoAbortadoWebpayTests(CorreosWebpayBase):
    URL = '/api/catalog/pagos/transbank/abortado/'

    def abortar(self, token='token-webpay', tienda=None):
        return APIClient().post(
            self.URL, {'id_tienda': (tienda or self.tienda).pk, 'tbk_token': token}, format='json')

    def test_si_el_comprador_anula_el_pago_en_webpay_se_le_avisa_por_correo(self):
        self.assertEqual(self.abortar().status_code, 200)
        self.assertEqual(self.estado(), 'pendiente')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['ana@example.com'])
        self.assertEqual(mail.outbox[0].subject, f'No pudimos confirmar tu pago · {self.pedido.identificador}')

    def test_repetir_la_anulacion_no_repite_el_correo(self):
        self.abortar()
        self.assertEqual(self.abortar().status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_un_token_desconocido_no_envia_correo_ni_revela_nada(self):
        respuesta = self.abortar(token='token-inventado')
        self.assertEqual(respuesta.status_code, 200)
        self.assertNotIn('pedido', respuesta.content.decode().lower())
        self.assertEqual(mail.outbox, [])

    def test_no_avisa_si_el_pedido_ya_esta_pagado(self):
        Pedido.objects.filter(pk=self.pedido.pk).update(estado='pagado')
        self.abortar()
        self.assertEqual(mail.outbox, [])

    def test_el_token_no_sirve_con_otra_tienda(self):
        otra = Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.tienda.id_usuario_propietario)
        self.abortar(tienda=otra)
        self.assertEqual(mail.outbox, [])

    def test_exige_el_token(self):
        respuesta = APIClient().post(self.URL, {'id_tienda': self.tienda.pk}, format='json')
        self.assertEqual(respuesta.status_code, 400)
