"""Enlace de seguimiento dentro del correo de despacho (SCRUM-434): variable {{trackingLink}}."""
import re
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.domain.plantillas_correo import VARIABLES_PERMITIDAS, construir_correo
from apps.core.domain.plantillas_correo.base import contexto_pedido, enlace_seguimiento
from apps.core.models import Pedido, Tienda

URL_CORREOS = '/api/tienda/correos/'
BASE = 'https://tienda.test/plantilla/2'
ENTREGA = {'metodo': 'Chilexpress', 'codigo_seguimiento': 'CHILEX-12345'}


class EnlaceBase(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        self.propietario = get_user_model().objects.create_user(username='enlace-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=self.propietario)
        self.api = APIClient()
        self.api.force_authenticate(self.propietario)

    def pedido(self, estado='enviado', **extra):
        datos = dict(tienda=self.tienda, monto_total=Decimal('15990'), estado=estado, nombre_contacto='Ana',
                     correo_contacto='ana@example.com', telefono_contacto='+56911112222', entrega=dict(ENTREGA))
        datos.update(extra)
        return Pedido.objects.create(**datos)


@override_settings(STOREFRONT_PUBLIC_URL=BASE)
class ConstruccionDelEnlaceTests(EnlaceBase):
    def test_la_variable_esta_permitida_para_las_plantillas(self):
        self.assertIn('trackingLink', VARIABLES_PERMITIDAS)

    def test_el_enlace_lleva_al_portal_de_seguimiento_con_el_numero_de_orden(self):
        pedido = self.pedido()
        self.assertEqual(enlace_seguimiento(pedido), f'{BASE}/seguimiento?orden={pedido.identificador}')
        self.assertEqual(contexto_pedido(pedido)['trackingLink'], enlace_seguimiento(pedido))

    @override_settings(STOREFRONT_PUBLIC_URL='https://tienda.test/plantilla/2///')
    def test_las_barras_finales_de_la_direccion_no_duplican_la_ruta(self):
        pedido = self.pedido()
        self.assertEqual(enlace_seguimiento(pedido), f'{BASE}/seguimiento?orden={pedido.identificador}')

    def test_el_correo_del_comprador_y_otros_datos_nunca_van_en_el_enlace(self):
        pedido = self.pedido(contacto={'nombre': 'Ana Pérez'})
        enlace = enlace_seguimiento(pedido)
        partes = urlparse(enlace)
        self.assertEqual(list(parse_qs(partes.query)), ['orden'])
        for privado in ('@', 'ana', 'example', 'email', 'correo', '56911112222', '15990', 'CHILEX'):
            self.assertNotIn(privado, enlace, privado)

    def test_el_numero_de_orden_se_codifica_para_no_alterar_la_direccion(self):
        pedido = self.pedido()
        Pedido.objects.filter(pk=pedido.pk).update(identificador='ORD 1/2?x=y&z#frag')
        pedido.refresh_from_db()
        enlace = enlace_seguimiento(pedido)
        self.assertEqual(enlace, f'{BASE}/seguimiento?orden=ORD%201%2F2%3Fx%3Dy%26z%23frag')
        self.assertEqual(parse_qs(urlparse(enlace).query), {'orden': ['ORD 1/2?x=y&z#frag']})

    def test_el_enlace_sirve_para_consultar_el_pedido(self):
        pedido = self.pedido()
        orden = parse_qs(urlparse(enlace_seguimiento(pedido)).query)['orden'][0]
        respuesta = APIClient().post('/api/pedidos/seguimiento/', {'identificador': orden, 'email': 'ana@example.com'}, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()['data']['identificador'], pedido.identificador)

    def test_sin_direccion_publica_valida_no_hay_enlace(self):
        pedido = self.pedido()
        for base in ('', '   ', None, 'tienda.test', '//tienda.test', 'ftp://tienda.test', 'javascript:alert(1)', 'data:text/html,hola', '/plantilla/1'):
            with override_settings(STOREFRONT_PUBLIC_URL=base):
                self.assertEqual(enlace_seguimiento(pedido), '', repr(base))
                self.assertEqual(contexto_pedido(pedido)['trackingLink'], '', repr(base))

    @override_settings(STOREFRONT_PUBLIC_URL='http://localhost:5173/plantilla/1')
    def test_funciona_tambien_con_http_en_desarrollo(self):
        pedido = self.pedido()
        self.assertEqual(enlace_seguimiento(pedido), f'http://localhost:5173/plantilla/1/seguimiento?orden={pedido.identificador}')

    def test_un_pedido_sin_numero_no_tiene_enlace(self):
        pedido = self.pedido()
        pedido.identificador = ''
        self.assertEqual(enlace_seguimiento(pedido), '')


class ConfiguracionDeLaDireccionTests(TestCase):
    def test_la_configuracion_trae_una_direccion_por_defecto_valida_y_sin_barra_final(self):
        self.assertTrue(settings.STOREFRONT_PUBLIC_URL.startswith(('http://', 'https://')))
        self.assertFalse(settings.STOREFRONT_PUBLIC_URL.endswith('/'))


@override_settings(STOREFRONT_PUBLIC_URL=BASE)
class EnlaceEnElCorreoTests(EnlaceBase):
    def test_el_correo_de_despacho_incluye_el_enlace(self):
        pedido = self.pedido()
        correo = construir_correo('order_shipped', pedido)
        self.assertIn(f'Revisa el estado de tu pedido aquí (te pediremos el correo con el que compraste): {BASE}/seguimiento?orden={pedido.identificador}', correo.cuerpo)
        self.assertTrue(correo.cuerpo.endswith('Gracias por comprar en Tienda Demo.'))

    @override_settings(STOREFRONT_PUBLIC_URL='')
    def test_sin_direccion_publica_la_linea_del_enlace_no_aparece(self):
        correo = construir_correo('order_shipped', self.pedido())
        self.assertNotIn('Revisa el estado', correo.cuerpo)
        self.assertNotIn('seguimiento?orden', correo.cuerpo)
        self.assertNotIn('\n\n\n', correo.cuerpo)
        self.assertIn('Código de seguimiento: CHILEX-12345', correo.cuerpo)

    def test_se_puede_usar_la_variable_en_cualquier_plantilla_de_la_tienda(self):
        pedido = self.pedido(estado='pagado')
        cuerpo = {'enabled': True, 'subject': 'Pago {{orderNumber}}', 'preheader': '', 'body': 'Sigue tu pedido: {{trackingLink}}'}
        respuesta = self.api.put(URL_CORREOS, {'plantillas': {'payment_success': cuerpo}}, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(construir_correo('payment_success', pedido).cuerpo, f'Sigue tu pedido: {BASE}/seguimiento?orden={pedido.identificador}')

    def test_el_panel_sigue_rechazando_variables_desconocidas(self):
        cuerpo = {'enabled': True, 'subject': 'Asunto', 'preheader': '', 'body': 'Hola {{trackingUrl}}'}
        self.assertEqual(self.api.put(URL_CORREOS, {'plantillas': {'order_shipped': cuerpo}}, format='json').status_code, 400)

    def test_el_correo_que_llega_al_comprador_tiene_el_enlace_clickeable_y_sin_su_correo(self):
        pedido = self.pedido(estado='en_origen')
        respuesta = self.api.patch(f'/api/tienda/pedidos/{pedido.id_pedido}/estado/', {'estado': 'enviado'}, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(len(mail.outbox), 1)
        enlace = f'{BASE}/seguimiento?orden={pedido.identificador}'
        correo = mail.outbox[0]
        html = correo.alternatives[0][0]
        self.assertIn(enlace, correo.body)
        self.assertIn(f'<a href="{enlace}" style="color:#2563eb;">{enlace}</a>', html)
        for texto in (correo.body, html):
            self.assertNotIn('ana@example.com', texto)
            self.assertEqual(re.findall(r'orden=[^"<\s]*', texto), [f'orden={pedido.identificador}'] * (1 if texto is correo.body else 2))

    def test_los_textos_por_defecto_solo_usan_variables_permitidas(self):
        from apps.core.domain.plantillas_correo import TIPOS
        from apps.core.domain.plantillas_correo.base import _MARCADOR
        for tipo, (_, plantilla) in TIPOS.items():
            usadas = set(_MARCADOR.findall(f'{plantilla.asunto}\n{plantilla.preheader}\n{plantilla.cuerpo}'))
            self.assertLessEqual(usadas, set(VARIABLES_PERMITIDAS), tipo)
