from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.models import ConfiguracionPago
import hashlib
import hmac
import json
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.infrastructure.linkify_client import LinkifyAdapter
from apps.core.models import ConfiguracionPago, ConfiguracionEntrega, ItemPedido, Pedido, Tienda
from apps.core.presentation.linkify_notificacion import LinkifyNotificacionView

CLAVE = 'clave-privada-qa'
LINKIFY = {'linkify': {'enabled': True, 'fields': {'idCuenta': 'CUENTA-QA', 'clavePrivada': CLAVE}}}


def tienda_de_prueba(nombre):
    propietario = get_user_model().objects.create_user(username=f'owner-{nombre}')
    return Tienda.objects.create(nombre=nombre, id_usuario_propietario=propietario)


class LinkifyAdapterUrlTests(TestCase):
    def test_url_de_pago_normal(self):
        self.assertEqual(LinkifyAdapter('CUENTA-QA', CLAVE).url_de_pago('13'),
                         'https://app.linkify.cl/pay/CUENTA-QA/remote/13')

    def test_url_de_pago_codifica_caracteres_peligrosos(self):
        url = LinkifyAdapter('A/../B ?x=1', CLAVE).url_de_pago('5')
        self.assertTrue(url.startswith('https://app.linkify.cl/pay/'))
        self.assertNotIn('/../', url)
        self.assertNotIn(' ', url)
        self.assertNotIn('?', url)


class LinkifyAvisoErroresTests(TestCase):
    URL = '/api/pagos/linkify/notificacion/'

    def setUp(self):
        self.tienda = tienda_de_prueba('Tienda errores aviso')
        ConfiguracionPago.objects.create(tienda=self.tienda, datos=LINKIFY)
        self.pedido = Pedido.objects.create(tienda=self.tienda, monto_total=Decimal('18990'), medio_pago='Linkify',
                                            correo_contacto='comprador@example.com')

    def firmar(self, cuerpo):
        return hmac.new(CLAVE.encode(), cuerpo, hashlib.sha256).hexdigest()

    def test_cuerpo_json_mal_formado(self):
        cuerpo = b'{esto no es json'
        respuesta = self.client.post(self.URL, data=cuerpo, content_type='application/json',
                                     HTTP_X_LINKIFY_CONFIRMATION=self.firmar(cuerpo))
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json()['error']['codigo'], 'CUERPO_INVALIDO')

    def test_error_inesperado_responde_500_y_no_cambia_el_pedido(self):
        cuerpo = json.dumps({'id_pago': self.pedido.pk, 'action': 'notification'}).encode()
        with patch.object(LinkifyNotificacionView, '_pago_recibido', side_effect=RuntimeError('falla simulada')):
            with self.assertLogs('apps.core.presentation.linkify_notificacion', level='ERROR'):
                respuesta = self.client.post(self.URL, data=cuerpo, content_type='application/json',
                                             HTTP_X_LINKIFY_CONFIRMATION=self.firmar(cuerpo))
        self.assertEqual(respuesta.status_code, 500)
        self.assertEqual(respuesta.json()['error']['codigo'], 'ERROR_INTERNO')
        self.assertNotIn('falla simulada', respuesta.content.decode())  # no se filtra el detalle interno
        self.assertEqual(Pedido.objects.get(pk=self.pedido.pk).estado, 'pendiente')

    def test_los_rechazos_quedan_registrados_con_codigo_y_pedido(self):
        cuerpo = json.dumps({'id_pago': self.pedido.pk, 'action': 'notification'}).encode()
        with self.assertLogs('apps.core.presentation.linkify_notificacion', level='WARNING') as registro:
            self.client.post(self.URL, data=cuerpo, content_type='application/json',
                             HTTP_X_LINKIFY_CONFIRMATION='firma-falsa')
        texto = ' '.join(registro.output)
        self.assertIn('FIRMA_INVALIDA', texto)
        self.assertIn(f'pedido={self.pedido.pk}', texto)


class RepositorioFalso:
    """Reemplaza a MongoDB: un producto con una variante y registro de los descuentos de stock."""

    def __init__(self):
        self.descuentos = []

    def get_by_id(self, tienda_id, producto_id):
        if producto_id != 'prod-1':
            return None
        return {'_id': 'prod-1', 'nombre': 'Pantalon QA', 'activo': True,
                'variantes': [{'sku': 'QA-M', 'precio': 10000, 'stock': 7, 'atributos_variante': []}]}

    def get_by_slug(self, tienda_id, slug):
        return None

    def decrease_stock(self, tienda_id, sku, cantidad):
        self.descuentos.append((sku, cantidad))
        return True


class LinkifyCheckoutTests(TestCase):
    URL = '/api/checkout/pedidos/'

    def setUp(self):
        self.tienda = tienda_de_prueba('Tienda checkout linkify')
        ConfiguracionEntrega.objects.create(tienda=self.tienda, datos={'pickup': {'enabled': True}})
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.repositorio = RepositorioFalso()
        parche = patch('apps.core.presentation.checkout.ProductRepository', return_value=self.repositorio)
        parche.start()
        self.addCleanup(parche.stop)
        self.api = APIClient()

    def payload(self, medio_pago='Linkify', clave=None):
        return {'clave_checkout': clave or str(uuid4()),
                'items': [{'producto_id': 'prod-1', 'sku': 'QA-M', 'cantidad': 2}],
                'contacto': {'nombre': 'Comprador', 'email': 'comprador@example.com', 'telefono': ''},
                'medio_pago': medio_pago, 'metodo_entrega': 'Retiro'}

    def configurar_linkify(self, datos=LINKIFY):
        ConfiguracionPago.objects.update_or_create(tienda=self.tienda, defaults={'datos': datos})

    def comprar(self, datos):
        return self.api.post(self.URL, datos, format='json')

    def test_compra_con_linkify_entrega_el_link_de_pago(self):
        self.configurar_linkify()
        respuesta = self.comprar(self.payload())
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        datos = respuesta.json()['data']
        self.assertEqual(datos['estado'], 'pendiente')
        self.assertEqual(datos['url_pago'], f"https://app.linkify.cl/pay/CUENTA-QA/remote/{datos['id_pedido']}")
        self.assertEqual(self.repositorio.descuentos, [('QA-M', 2)])

    def test_el_reintento_tambien_entrega_el_link_y_no_descuenta_otra_vez(self):
        self.configurar_linkify()
        clave = str(uuid4())
        primera = self.comprar(self.payload(clave=clave)).json()['data']
        segunda = self.comprar(self.payload(clave=clave))
        self.assertEqual(segunda.status_code, 200, segunda.content)
        self.assertEqual(segunda.json()['data']['id_pedido'], primera['id_pedido'])
        self.assertEqual(segunda.json()['data']['url_pago'], primera['url_pago'])
        self.assertEqual(len(self.repositorio.descuentos), 1)
        self.assertEqual(Pedido.objects.count(), 1)

    def test_sin_configurar_linkify_se_rechaza_antes_de_crear_el_pedido(self):
        respuesta = self.comprar(self.payload())
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn('Linkify no está disponible', str(respuesta.json()))
        self.assertEqual(Pedido.objects.count(), 0)
        self.assertEqual(ItemPedido.objects.count(), 0)
        self.assertEqual(self.repositorio.descuentos, [])

    def test_linkify_desactivado_se_rechaza_aunque_tenga_credenciales(self):
        self.configurar_linkify({'linkify': {'enabled': False, 'fields': {'idCuenta': 'X', 'clavePrivada': 'Y'}}})
        respuesta = self.comprar(self.payload())
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(Pedido.objects.count(), 0)
        self.assertEqual(self.repositorio.descuentos, [])

    def test_linkify_sin_clave_privada_se_rechaza(self):
        self.configurar_linkify({'linkify': {'enabled': True, 'fields': {'idCuenta': 'X'}}})
        self.assertEqual(self.comprar(self.payload()).status_code, 400)
        self.assertEqual(Pedido.objects.count(), 0)

    def test_otros_medios_de_pago_no_dependen_de_linkify(self):
        respuesta = self.comprar(self.payload(medio_pago='Transferencia'))
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        self.assertNotIn('url_pago', respuesta.json()['data'])
