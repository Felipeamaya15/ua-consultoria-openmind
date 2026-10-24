"""Correos de recepción, pago exitoso y pago rechazado del pedido ."""
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
