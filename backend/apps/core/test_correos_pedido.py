"""Correos de recepción, pago exitoso y pago rechazado del pedido ."""
import hashlib
import hmac
import json
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.infrastructure import notificaciones_pedido
from apps.core.infrastructure.email_service import ResultadoEnvio
from apps.core.models import ConfiguracionCorreo, ConfiguracionEntrega, ConfiguracionPago, Pedido, Tienda
from apps.core.payments import TRANSFER_PUBLIC_FIELDS


class CorreosPedidoBase(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        usuarios = get_user_model().objects
        self.propietario = usuarios.create_user(username='correos-pedido-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=self.propietario)
        self.api = APIClient()
        self.api.force_authenticate(self.propietario)

    def pedido(self, estado='pendiente', **extra):
        datos = dict(
            tienda=self.tienda, monto_total=Decimal('15990'), estado=estado, nombre_contacto='Ana',
            correo_contacto='ana@example.com', entrega={'metodo': 'Starken'}, medio_pago='Transferencia',
        )
        datos.update(extra)
        return Pedido.objects.create(**datos)

    def refrescar(self, pedido):
        return Pedido.objects.get(pk=pedido.pk)

    def marca(self, pedido, tipo):
        return (self.refrescar(pedido).entrega.get('notificaciones') or {}).get(tipo)


class RepositorioFalso:
    """Reemplaza a MongoDB: un producto con una variante y control de stock en memoria."""

    def __init__(self, stock=5):
        self.producto = {'_id': 'prod-1', 'nombre': 'Polera', 'activo': True,
                         'variantes': [{'sku': 'POL-M', 'precio': 10000, 'stock': stock, 'atributos_variante': []}]}

    def get_by_id(self, tienda_id, producto_id):
        return self.producto if producto_id == 'prod-1' else None

    def get_by_slug(self, tienda_id, slug):
        return None

    def decrease_stock(self, tienda_id, sku, cantidad):
        variante = self.producto['variantes'][0]
        if variante['stock'] < cantidad:
            return False
        variante['stock'] -= cantidad
        return True

    def restore_stock(self, tienda_id, producto_id, sku, cantidad):
        self.producto['variantes'][0]['stock'] += cantidad
        return True


class CorreoRecepcionTests(CorreosPedidoBase):
    URL = '/api/checkout/pedidos/'

    def setUp(self):
        super().setUp()
        ConfiguracionEntrega.objects.create(tienda=self.tienda, datos={
            'pickup': {'enabled': True, 'address': 'Local de prueba', 'schedule': 'Lun–Vie 09:00 a 18:00'},
        })
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={'transfer': {
            'enabled': True, 'fields': {campo: 'qa' for campo in TRANSFER_PUBLIC_FIELDS}}})
        self.repo = RepositorioFalso()
        parche = patch('apps.core.presentation.checkout.ProductRepository', return_value=self.repo)
        parche.start()
        self.addCleanup(parche.stop)
        self.comprador = APIClient()
        self.payload = {
            'clave_checkout': str(uuid4()),
            'items': [{'producto_id': 'prod-1', 'sku': 'POL-M', 'cantidad': 2}],
            'contacto': {'nombre': 'Comprador', 'email': 'comprador@example.com', 'telefono': ''},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Retiro',
        }

    def crear(self, payload=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.comprador.post(self.URL, payload or self.payload, format='json', HTTP_X_TIENDA_ID=str(self.tienda.pk))

    def test_al_crear_el_pedido_se_envia_el_correo_de_recepcion_al_comprador(self):
        respuesta = self.crear()
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        pedido = Pedido.objects.get()
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['comprador@example.com'])
        self.assertEqual(correo.subject, f'Recibimos tu pedido {pedido.identificador}')
        self.assertIn('Hola Comprador', correo.body)
        self.assertIn('Resumen de compra:', correo.body)
        self.assertIn('Polera x 2: $20.000 ($10.000 c/u)', correo.body)
        self.assertEqual(self.marca(pedido, 'order_received')['codigo'], 'enviado')

    def test_repetir_la_solicitud_no_envia_otro_correo(self):
        self.crear()
        respuesta = self.crear()
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(len(mail.outbox), 1)

    def test_si_el_pedido_no_se_crea_no_se_envia_correo(self):
        self.repo.producto['variantes'][0]['stock'] = 1
        respuesta = self.crear()
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(Pedido.objects.count(), 0)
        self.assertEqual(mail.outbox, [])

    def test_si_el_correo_falla_el_pedido_se_crea_igual(self):
        with patch.object(notificaciones_pedido, 'enviar_correo', return_value=ResultadoEnvio(False, 'error_de_envio')):
            respuesta = self.crear()
        self.assertEqual(respuesta.status_code, 201)
        marca = self.marca(Pedido.objects.get(), 'order_received')
        self.assertEqual((marca['enviado'], marca['codigo']), (False, 'error_de_envio'))

    def test_respeta_la_plantilla_propia_y_si_esta_desactivada_no_envia(self):
        ConfiguracionCorreo.objects.create(tienda=self.tienda, plantillas={'order_received': {
            'enabled': False, 'subject': 'Hola', 'preheader': '', 'body': 'Texto'}})
        self.assertEqual(self.crear().status_code, 201)
        self.assertEqual(mail.outbox, [])
        self.assertIsNone(self.marca(Pedido.objects.get(), 'order_received'))


class CorreoPagoExitosoTests(CorreosPedidoBase):
    def aprobar(self, pedido):
        return self.api.post(f'/api/pagos/transferencias/{pedido.pk}/aprobar/', {}, format='json')

    def test_al_aprobar_la_transferencia_se_envia_el_correo_de_pago_exitoso(self):
        pedido = self.pedido()
        self.assertEqual(self.aprobar(pedido).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['ana@example.com'])
        self.assertEqual(correo.subject, f'Tu pago fue confirmado · {pedido.identificador}')
        self.assertIn('$15.990', correo.body)
        self.assertEqual(self.marca(pedido, 'payment_success')['codigo'], 'enviado')

    def test_al_aprobar_transferencia_correo_contiene_resumen_de_compra(self):
        from apps.core.models import ItemPedido
        pedido = self.pedido(monto_total=Decimal('20000'))
        ItemPedido.objects.create(
            id_pedido=pedido, nombre_producto='Zapatos de cuero', cantidad=1,
            precio_unitario=Decimal('20000'), sku='ZAP-42'
        )
        self.assertEqual(self.aprobar(pedido).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertIn('Resumen de compra:', correo.body)
        self.assertIn('- Zapatos de cuero x 1: $20.000', correo.body)
        self.assertIn('$20.000', correo.body)

    def test_aprobar_dos_veces_envia_un_solo_correo(self):
        pedido = self.pedido()
        self.aprobar(pedido)
        self.aprobar(pedido)
        self.assertEqual(len(mail.outbox), 1)

    def test_al_marcar_manualmente_como_pagado_tambien_se_envia(self):
        pedido = self.pedido()
        respuesta = self.api.patch(f'/api/tienda/pedidos/{pedido.pk}/estado/', {'estado': 'pagado'}, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': True, 'codigo': 'enviado'})
        self.assertEqual(len(mail.outbox), 1)

    def test_si_el_correo_falla_el_pedido_queda_pagado(self):
        pedido = self.pedido()
        with patch.object(notificaciones_pedido, 'enviar_correo', return_value=ResultadoEnvio(False, 'error_de_envio')):
            self.assertEqual(self.aprobar(pedido).status_code, 200)
        self.assertEqual(self.refrescar(pedido).estado, 'pagado')
        self.assertFalse(self.marca(pedido, 'payment_success')['enviado'])

    def test_si_la_tienda_desactivo_el_correo_no_se_envia(self):
        ConfiguracionCorreo.objects.create(tienda=self.tienda, plantillas={'payment_success': {
            'enabled': False, 'subject': 'Pago', 'preheader': '', 'body': 'Texto'}})
        self.assertEqual(self.aprobar(self.pedido()).status_code, 200)
        self.assertEqual(mail.outbox, [])

    def test_no_se_envia_si_la_transferencia_no_se_pudo_aprobar(self):
        pedido = self.pedido(estado='cancelado')
        self.assertEqual(self.aprobar(pedido).status_code, 409)
        self.assertEqual(mail.outbox, [])


class CorreoPagoExitosoLinkifyTests(CorreosPedidoBase):
    CLAVE = 'clave-privada-qa'
    URL = '/api/pagos/linkify/notificacion/'

    def setUp(self):
        super().setUp()
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={
            'linkify': {'enabled': True, 'fields': {'idCuenta': 'CUENTA-QA', 'clavePrivada': self.CLAVE}}})
        self.pedido_linkify = self.pedido(medio_pago='Linkify')

    def avisar(self, accion):
        cuerpo = json.dumps({'id_pago': self.pedido_linkify.pk, 'action': accion}).encode()
        firma = hmac.new(self.CLAVE.encode(), cuerpo, hashlib.sha256).hexdigest()
        return self.client.post(self.URL, data=cuerpo, content_type='application/json', HTTP_X_LINKIFY_CONFIRMATION=firma)

    def test_el_pago_recibido_por_linkify_envia_el_correo_una_sola_vez(self):
        self.assertEqual(self.avisar('notification').status_code, 200)
        self.assertEqual(self.avisar('notification').status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['ana@example.com'])

    def test_si_el_pago_se_anula_y_se_vuelve_a_pagar_no_se_repite_el_correo(self):
        self.avisar('notification')
        self.avisar('cancellation')
        self.avisar('notification')
        self.assertEqual(len(mail.outbox), 1)

class CorreoPagoRechazadoTests(CorreosPedidoBase):
    def rechazar(self, pedido):
        return self.api.post(f'/api/pagos/transferencias/{pedido.pk}/rechazar/', {}, format='json')

    def test_al_rechazar_la_transferencia_se_envia_el_correo_de_pago_rechazado(self):
        pedido = self.pedido()
        self.assertEqual(self.rechazar(pedido).status_code, 200)
        self.assertEqual(self.refrescar(pedido).estado, 'cancelado')
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['ana@example.com'])
        self.assertEqual(correo.subject, f'No pudimos confirmar tu pago · {pedido.identificador}')
        self.assertIn('No se realizó ningún cobro', correo.body)
        self.assertEqual(self.marca(pedido, 'payment_rejected')['codigo'], 'enviado')

    def test_rechazar_dos_veces_envia_un_solo_correo(self):
        pedido = self.pedido()
        self.rechazar(pedido)
        self.assertEqual(self.rechazar(pedido).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_si_el_correo_falla_el_pedido_queda_cancelado(self):
        pedido = self.pedido()
        with patch.object(notificaciones_pedido, 'enviar_correo', return_value=ResultadoEnvio(False, 'error_de_envio')):
            self.assertEqual(self.rechazar(pedido).status_code, 200)
        self.assertEqual(self.refrescar(pedido).estado, 'cancelado')
        self.assertFalse(self.marca(pedido, 'payment_rejected')['enviado'])

    def test_si_la_tienda_desactivo_el_correo_no_se_envia(self):
        ConfiguracionCorreo.objects.create(tienda=self.tienda, plantillas={'payment_rejected': {
            'enabled': False, 'subject': 'Pago', 'preheader': '', 'body': 'Texto'}})
        self.assertEqual(self.rechazar(self.pedido()).status_code, 200)
        self.assertEqual(mail.outbox, [])

    def test_no_se_envia_si_el_pedido_ya_estaba_pagado(self):
        pedido = self.pedido(estado='pagado')
        self.assertEqual(self.rechazar(pedido).status_code, 409)
        self.assertEqual(mail.outbox, [])

    def test_cancelar_el_pedido_por_otro_motivo_no_avisa_de_pago_rechazado(self):
        pedido = self.pedido()
        respuesta = self.api.patch(f'/api/tienda/pedidos/{pedido.pk}/estado/', {'estado': 'cancelado'}, format='json')
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(mail.outbox, [])

class CorreoDelCompradorTests(CorreosPedidoBase):
    def aprobar(self, pedido):
        return self.api.post(f'/api/pagos/transferencias/{pedido.pk}/aprobar/', {}, format='json')

    def test_el_aviso_va_al_correo_de_contacto_del_pedido(self):
        comprador = get_user_model().objects.create_user(username='correos-comprador', email='cuenta@example.com')
        pedido = self.pedido(comprador=comprador, correo_contacto='contacto@example.com')
        self.aprobar(pedido)
        self.assertEqual(mail.outbox[0].to, ['contacto@example.com'])

    def test_si_el_correo_de_contacto_no_sirve_se_usa_el_de_la_cuenta_del_comprador(self):
        comprador = get_user_model().objects.create_user(username='correos-comprador', email='cuenta@example.com')
        pedido = self.pedido(comprador=comprador, correo_contacto='no-es-un-correo')
        self.aprobar(pedido)
        self.assertEqual(mail.outbox[0].to, ['cuenta@example.com'])

    def test_la_plantilla_muestra_el_mismo_correo_al_que_se_envia(self):
        ConfiguracionCorreo.objects.create(tienda=self.tienda, plantillas={'payment_success': {
            'enabled': True, 'subject': 'Pago {{orderNumber}}', 'preheader': '', 'body': 'Enviado a {{customerEmail}}'}})
        comprador = get_user_model().objects.create_user(username='correos-comprador', email='cuenta@example.com')
        self.aprobar(self.pedido(comprador=comprador, correo_contacto=''))
        self.assertEqual(mail.outbox[0].to, ['cuenta@example.com'])
        self.assertEqual(mail.outbox[0].body, 'Enviado a cuenta@example.com')

    def test_sin_ningun_correo_valido_no_se_envia_y_queda_registrado(self):
        pedido = self.pedido(correo_contacto='correo-roto')
        self.assertEqual(self.aprobar(pedido).status_code, 200)
        self.assertEqual(self.refrescar(pedido).estado, 'pagado')
        self.assertEqual(mail.outbox, [])
        marca = self.marca(pedido, 'payment_success')
        self.assertEqual((marca['enviado'], marca['codigo'], marca['destinatario']), (False, 'destinatario_invalido', '***'))

    def test_la_marca_guarda_el_destinatario_enmascarado_y_nunca_el_correo_completo(self):
        pedido = self.pedido()
        self.aprobar(pedido)
        marca = self.marca(pedido, 'payment_success')
        self.assertEqual(marca['destinatario'], 'a***@example.com')
        self.assertNotIn('ana@example.com', json.dumps(self.refrescar(pedido).entrega))

    def test_cada_aviso_del_pedido_queda_asociado_al_mismo_comprador(self):
        pedido = self.pedido()
        notificaciones_pedido.notificar_recepcion(pedido)
        self.aprobar(self.refrescar(pedido))
        notificaciones = self.refrescar(pedido).entrega['notificaciones']
        self.assertEqual({tipo: m['destinatario'] for tipo, m in notificaciones.items()},
                         {'order_received': 'a***@example.com', 'payment_success': 'a***@example.com'})
        self.assertEqual([c.to for c in mail.outbox], [['ana@example.com'], ['ana@example.com']])
