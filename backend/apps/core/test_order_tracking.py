from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import ItemPedido, Pedido, Tienda


class OrderTrackingTests(TestCase):
    url = '/api/pedidos/seguimiento/'

    def setUp(self):
        cache.clear()
        owner = get_user_model().objects.create_user(username='tracking-owner')
        self.store = Tienda.objects.create(nombre='Tracking store', id_usuario_propietario=owner)
        self.order = Pedido.objects.create(
            tienda=self.store, identificador='ORD-20261008-YOXM',
            nombre_contacto='Comprador', correo_contacto='buyer@example.com',
            telefono_contacto='private-phone', monto_total='15000.00',
            medio_pago='Transferencia',
            entrega={'metodo': 'Retiro', 'direccion': {'street': 'private-address'}},
        )
        ItemPedido.objects.create(
            id_pedido=self.order, nombre_producto='Producto real', sku='REAL-M',
            cantidad=2, precio_unitario='7500.00', producto_mongo_id='507f1f77bcf86cd799439011',
            atributos_variante=[{'clave': 'talla', 'etiqueta': 'Talla', 'valor': 'M'}],
        )
        self.api = APIClient()
        self.payload = {'identificador': self.order.identificador, 'email': self.order.correo_contacto}

    def lookup(self, **changes):
        return self.api.post(self.url, {**self.payload, **changes}, format='json')

    def test_guest_gets_real_order_and_items_without_mutation_or_private_data(self):
        before = (Pedido.objects.count(), ItemPedido.objects.count())
        response = self.lookup()
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data['data']
        self.assertEqual(data['identificador'], self.order.identificador)
        self.assertEqual(data['items'][0]['nombre'], 'Producto real')
        self.assertEqual(data['items'][0]['sku'], 'REAL-M')
        self.assertEqual(data['monto_total'], '15000.00')
        self.assertEqual(data['entrega'], {'metodo': 'Retiro'})
        self.assertNotIn('private-phone', str(data))
        self.assertNotIn('private-address', str(data))
        self.assertNotIn('correo_contacto', data)
        self.assertNotIn('clave_checkout', data)
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual((Pedido.objects.count(), ItemPedido.objects.count()), before)

    def test_lookup_normalizes_whitespace_and_case_and_reads_current_status(self):
        self.order.estado = 'enviado'
        self.order.save(update_fields=['estado'])
        response = self.lookup(identificador=' ord-20261008-yoxm ', email=' BUYER@example.com ')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['estado'], 'enviado')

    def test_wrong_email_or_identifier_returns_same_not_found(self):
        wrong_email = self.lookup(email='other@example.com')
        wrong_identifier = self.lookup(identificador='ORD-20261008-NONE')
        self.assertEqual(wrong_email.status_code, 404)
        self.assertEqual(wrong_identifier.status_code, 404)
        self.assertEqual(wrong_email.data, wrong_identifier.data)

    def test_both_credentials_required_and_unknown_fields_rejected(self):
        for payload in ({}, {'identificador': self.order.identificador},
                        {'email': self.order.correo_contacto},
                        {**self.payload, 'id_pedido': self.order.pk},
                        {**self.payload, 'email': 'invalid'}):
            with self.subTest(payload=payload):
                self.assertEqual(self.api.post(self.url, payload, format='json').status_code, 400)

    def test_orders_outside_installation_are_not_returned(self):
        self.order.tienda = None
        self.order.save(update_fields=['tienda'])
        self.assertEqual(self.lookup().status_code, 404)

    def test_multiple_stores_do_not_select_arbitrary_tenant(self):
        owner = get_user_model().objects.create_user(username='other-tracking-owner')
        Tienda.objects.create(nombre='Other store', id_usuario_propietario=owner)
        self.assertEqual(self.lookup().status_code, 503)

    def test_ambiguous_identifier_does_not_select_arbitrary_order(self):
        Pedido.objects.create(tienda=self.store, identificador=self.order.identificador,
                              correo_contacto=self.order.correo_contacto, monto_total='1.00')
        self.assertEqual(self.lookup().status_code, 404)

    def test_repeated_lookups_are_throttled(self):
        for _ in range(20):
            self.assertEqual(self.lookup(email='wrong@example.com').status_code, 404)
        self.assertEqual(self.lookup().status_code, 429)

    def test_get_does_not_accept_credentials_in_url(self):
        self.assertEqual(self.api.get(self.url, self.payload).status_code, 405)
