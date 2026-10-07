
import base64
import hashlib
import hmac
import json
from decimal import Decimal
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.core.infrastructure.linkify_client import LinkifyAdapter
from apps.core.models import ConfiguracionPago, Pedido, Tienda

CLAVE = 'clave-privada-qa'
URL = '/api/pagos/linkify/notificacion/'


def firmar(cuerpo, clave=CLAVE, base64_=False):
    digest = hmac.new(clave.encode(), cuerpo, hashlib.sha256).digest()
    return base64.b64encode(digest).decode() if base64_ else digest.hex()


class LinkifyAdapterFirmaTests(TestCase):
    def test_acepta_firma_hex_y_base64(self):
        adaptador = LinkifyAdapter('CUENTA', CLAVE)
        self.assertTrue(adaptador.firma_valida(b'{"a":1}', firmar(b'{"a":1}')))
        self.assertTrue(adaptador.firma_valida(b'{"a":1}', firmar(b'{"a":1}', base64_=True)))

    def test_rechaza_firma_incorrecta_o_cuerpo_alterado(self):
        adaptador = LinkifyAdapter('CUENTA', CLAVE)
        self.assertFalse(adaptador.firma_valida(b'{"a":1}', 'no-es-la-firma'))
        self.assertFalse(adaptador.firma_valida(b'{"a":2}', firmar(b'{"a":1}')))

    def test_clave_vacia_nunca_valida(self):
        # Con clave vacia cualquiera podria calcular la firma: debe rechazarse siempre.
        adaptador = LinkifyAdapter('CUENTA', '')
        self.assertFalse(adaptador.firma_valida(b'x', firmar(b'x', clave='')))
        self.assertFalse(LinkifyAdapter('CUENTA', CLAVE).firma_valida(b'x', ''))


class LinkifyNotificacionTests(TestCase):
    def setUp(self):
        propietario = get_user_model().objects.create_user(username='linkify-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Linkify', id_usuario_propietario=propietario)
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={
            'linkify': {'enabled': True, 'fields': {'idCuenta': 'CUENTA-QA', 'clavePrivada': CLAVE}}})
        self.pedido = self.crear_pedido()

    def crear_pedido(self, **extra):
        datos = dict(tienda=self.tienda, monto_total=Decimal('18990'), medio_pago='Linkify',
                     correo_contacto='comprador@example.com', estado='pendiente')
        datos.update(extra)
        return Pedido.objects.create(**datos)

    def avisar(self, payload, firma='auto', pedido=None, formulario=False):
        payload = {'id_pago': (pedido or self.pedido).pk, **payload}
        if formulario:
            cuerpo, tipo = urlencode(payload).encode(), 'application/x-www-form-urlencoded'
        else:
            cuerpo, tipo = json.dumps(payload).encode(), 'application/json'
        cabeceras = {} if firma is None else {'HTTP_X_LINKIFY_CONFIRMATION': firmar(cuerpo) if firma == 'auto' else firma}
        return self.client.post(URL, data=cuerpo, content_type=tipo, **cabeceras)

    def estado(self, pedido=None):
        return Pedido.objects.get(pk=(pedido or self.pedido).pk).estado

    # ---------------------------------------------------------- notificacion
    def test_notificacion_firmada_marca_el_pedido_como_pagado(self):
        respuesta = self.avisar({'action': 'notification', 'monto': 18990})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()['estado'], 'pagado')
        self.assertEqual(self.estado(), 'pagado')

    def test_acepta_formulario_y_firma_en_base64(self):
        cuerpo = urlencode({'id_pago': self.pedido.pk, 'action': 'notification'}).encode()
        respuesta = self.client.post(URL, data=cuerpo, content_type='application/x-www-form-urlencoded',
                                     HTTP_X_LINKIFY_CONFIRMATION=firmar(cuerpo, base64_=True))
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(self.estado(), 'pagado')

    def test_sin_firma_se_rechaza_y_no_cambia_nada(self):
        respuesta = self.avisar({'action': 'notification'}, firma=None)
        self.assertEqual(respuesta.status_code, 401)
        self.assertEqual(respuesta.json()['error']['codigo'], 'FIRMA_INVALIDA')
        self.assertEqual(self.estado(), 'pendiente')

    def test_firma_de_otra_clave_se_rechaza(self):
        cuerpo = json.dumps({'id_pago': self.pedido.pk, 'action': 'notification'}).encode()
        respuesta = self.client.post(URL, data=cuerpo, content_type='application/json',
                                     HTTP_X_LINKIFY_CONFIRMATION=firmar(cuerpo, clave='otra-clave'))
        self.assertEqual(respuesta.status_code, 401)
        self.assertEqual(self.estado(), 'pendiente')

    def test_notificacion_repetida_es_idempotente(self):
        self.avisar({'action': 'notification'})
        respuesta = self.avisar({'action': 'notification'})
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(self.estado(), 'pagado')

    def test_monto_distinto_no_marca_el_pedido(self):
        respuesta = self.avisar({'action': 'notification', 'monto': 1000})
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.json()['error']['codigo'], 'MONTO_NO_COINCIDE')
        self.assertEqual(self.estado(), 'pendiente')

    def test_monto_no_numerico_se_rechaza(self):
        respuesta = self.avisar({'action': 'notification', 'monto': 'abc'})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json()['error']['codigo'], 'MONTO_INVALIDO')

    def test_pedido_inexistente(self):
        cuerpo = json.dumps({'id_pago': 999999, 'action': 'notification'}).encode()
        respuesta = self.client.post(URL, data=cuerpo, content_type='application/json',
                                     HTTP_X_LINKIFY_CONFIRMATION=firmar(cuerpo))
        self.assertEqual(respuesta.status_code, 404)
        self.assertEqual(respuesta.json()['error']['codigo'], 'PEDIDO_NO_ENCONTRADO')

    def test_pedido_de_otro_medio_de_pago_no_se_paga_por_linkify(self):
        otro = self.crear_pedido(medio_pago='Transferencia')
        respuesta = self.avisar({'action': 'notification'}, pedido=otro)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.json()['error']['codigo'], 'PEDIDO_NO_LINKIFY')
        self.assertEqual(self.estado(otro), 'pendiente')

    def test_pedido_cancelado_no_se_reactiva(self):
        cancelado = self.crear_pedido(estado='cancelado')
        respuesta = self.avisar({'action': 'notification'}, pedido=cancelado)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(self.estado(cancelado), 'cancelado')

    def test_tienda_sin_credenciales(self):
        ConfiguracionPago.objects.filter(tienda=self.tienda).update(datos={})
        respuesta = self.avisar({'action': 'notification'})
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.json()['error']['codigo'], 'LINKIFY_NO_CONFIGURADO')

    def test_funciona_aunque_linkify_se_haya_desactivado(self):
        datos = {'linkify': {'enabled': False, 'fields': {'idCuenta': 'CUENTA-QA', 'clavePrivada': CLAVE}}}
        ConfiguracionPago.objects.filter(tienda=self.tienda).update(datos=datos)
        self.assertEqual(self.avisar({'action': 'notification'}).status_code, 200)

    def test_accion_desconocida(self):
        respuesta = self.avisar({'action': 'otra-cosa'})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json()['error']['codigo'], 'ACCION_DESCONOCIDA')

    # ------------------------------------------------------------ anulacion
    def test_anulacion_devuelve_el_pedido_a_pendiente(self):
        pagado = self.crear_pedido(estado='pagado')
        respuesta = self.avisar({'action': 'cancellation'}, pedido=pagado)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(self.estado(pagado), 'pendiente')

    def test_anulacion_de_pedido_enviado_requiere_revision_manual(self):
        enviado = self.crear_pedido(estado='enviado')
        respuesta = self.avisar({'action': 'cancellation'}, pedido=enviado)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.json()['error']['codigo'], 'PEDIDO_YA_ENVIADO')
        self.assertEqual(self.estado(enviado), 'enviado')

    def test_anulacion_de_pedido_pendiente_no_cambia_nada(self):
        self.assertEqual(self.avisar({'action': 'cancellation'}).status_code, 200)
        self.assertEqual(self.estado(), 'pendiente')

    # ------------------------------------------------------------------ GET
    def test_get_firmado_entrega_monto_y_detalle(self):
        consulta = f'id_pago={self.pedido.pk}'
        respuesta = self.client.get(f'{URL}?{consulta}', HTTP_X_LINKIFY_CONFIRMATION=firmar(b''))
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()['monto'], 18990)

    def test_get_acepta_firma_de_la_query_string(self):
        consulta = f'id_pago={self.pedido.pk}'
        respuesta = self.client.get(f'{URL}?{consulta}', HTTP_X_LINKIFY_CONFIRMATION=firmar(consulta.encode()))
        self.assertEqual(respuesta.status_code, 200)

    def test_get_sin_firma_no_revela_datos(self):
        respuesta = self.client.get(f'{URL}?id_pago={self.pedido.pk}')
        self.assertEqual(respuesta.status_code, 401)
        self.assertNotIn('monto', respuesta.json())
