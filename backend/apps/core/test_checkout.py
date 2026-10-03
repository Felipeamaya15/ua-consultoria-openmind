from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.authentication.infrastructure.models import ConfiguracionAutenticacion
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.models import Tienda, Pedido, ItemPedido, Usuario, Producto, Carrito, ItemCarrito


class CheckoutOrderTests(TestCase):
    url = '/api/checkout/pedidos/'

    def setUp(self):
        users = get_user_model()
        self.buyer = users.objects.create_user(username='checkout-buyer', email='buyer@example.com')
        self.owner = users.objects.create_user(username='checkout-owner')
        self.store = Tienda.objects.create(nombre='Checkout store', id_usuario_propietario=self.owner)
        # Colección real y aislada: jamás utiliza ni borra productos de la tienda.
        self.repo = ProductRepository()
        self.repo.collection = self.repo.db.get_collection('test_checkout_' + uuid4().hex)
        self.addCleanup(self.repo.collection.drop)
        self.product_id = self.repo.create(str(self.store.pk), {
            'nombre': 'Pantalón Mongo', 'activo': True, 'variantes': [
                {'sku': 'QA-M', 'precio': 10000, 'precio_oferta': 9000, 'stock': 7,
                 'atributos_variante': [{'clave': 'talla', 'etiqueta': 'Talla', 'valor': 'M'}]},
                {'sku': 'QA-L', 'precio': 12000, 'stock': 8, 'atributos_variante': []}],
        })
        patcher = patch('apps.core.presentation.checkout.ProductRepository', return_value=self.repo)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.buyer).key)
        self.payload = {
            'clave_checkout': str(uuid4()),
            'items': [{'producto_id': self.product_id, 'sku': 'QA-M', 'cantidad': 2},
                      {'producto_id': self.product_id, 'sku': 'QA-L', 'cantidad': 1}],
            'contacto': {'nombre': 'Comprador', 'email': 'buyer@example.com', 'telefono': ''},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Retiro',
        }

    def create(self, data=None):
        return self.api.post(self.url, data or self.payload, format='json')

    def test_authenticated_order_persists_items_totals_and_appears_in_history(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        order = Pedido.objects.get(pk=response.data['data']['id_pedido'])
        self.assertEqual(order.comprador, self.buyer)
        self.assertEqual(order.tienda, self.store)
        self.assertIsNone(order.id_usuario)
        self.assertEqual(order.estado, 'pendiente')
        self.assertEqual(order.monto_total, Decimal(30000))
        self.assertEqual(order.itempedido_set.count(), 2)
        line = order.itempedido_set.get(sku='QA-M')
        self.assertEqual(line.precio_unitario, Decimal(9000))
        self.assertEqual(line.cantidad, 2)
        self.assertEqual(line.producto_mongo_id, self.product_id)
        history = self.api.get('/api/mi-cuenta/pedidos/').data['data']
        self.assertEqual(history[0]['id_pedido'], order.pk)
        detail = self.api.get(f'/api/mi-cuenta/pedidos/{order.pk}/').data['data']
        self.assertEqual(detail['items'][0]['sku'], 'QA-M')
        self.assertEqual(detail['items'][0]['nombre'], 'Pantalón Mongo')
        self.assertEqual(detail['items'][0]['subtotal'], '18000.00')
        self.assertEqual(detail['medio_pago'], 'Transferencia')
        self.assertEqual(self.repo.get_by_id(str(self.store.pk), self.product_id)['variantes'][0]['stock'], 7)

    def test_repeated_confirmation_returns_same_order_even_after_stock_changes(self):
        first = self.create()
        self.repo.collection.update_many({}, {'$set': {'variantes.0.stock': 0}})
        second = self.create()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['data']['id_pedido'], second.data['data']['id_pedido'])
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(ItemPedido.objects.count(), 2)

    def test_key_cannot_be_reused_with_different_data_or_buyer(self):
        self.create()
        modified = deepcopy(self.payload)
        modified['items'][0]['cantidad'] = 1
        self.assertEqual(self.create(modified).status_code, 400)
        other = get_user_model().objects.create_user(username='other-buyer')
        self.api.force_authenticate(other)
        self.assertEqual(self.create().status_code, 400)
        self.assertEqual(Pedido.objects.count(), 1)

    def test_guest_order_does_not_link_any_customer(self):
        self.api.credentials()
        self.assertEqual(self.create().status_code, 201)
        order = Pedido.objects.get()
        self.assertIsNone(order.comprador)
        self.assertIsNone(order.id_usuario)
        self.api.force_authenticate(self.buyer)
        self.assertEqual(self.api.get('/api/mi-cuenta/pedidos/').data['data'], [])

    def test_guest_respects_store_auth_configuration(self):
        self.api.credentials()
        config = ConfiguracionAutenticacion.objects.create(tienda=self.store, guest_checkout=False)
        self.assertEqual(self.create().status_code, 401)
        config.guest_checkout = True
        config.requires_auth = 'required'
        config.save()
        self.assertEqual(self.create().status_code, 401)
        self.assertEqual(Pedido.objects.count(), 0)

    def test_owner_is_denied(self):
        self.api.force_authenticate(self.owner)
        self.assertEqual(self.create().status_code, 403)
        self.assertEqual(Pedido.objects.count(), 0)

    def test_invalid_quantities_and_empty_cart_leave_no_order(self):
        for quantity in (0, -1, 1.5, True, '2', 8):
            data = deepcopy(self.payload)
            data['items'][0]['cantidad'] = quantity
            self.assertEqual(self.create(data).status_code, 400, quantity)
        data['items'] = []
        self.assertEqual(self.create(data).status_code, 400)
        self.assertEqual(Pedido.objects.count(), 0)

    def test_duplicate_lines_cannot_bypass_stock(self):
        data = deepcopy(self.payload)
        data['items'] = [dict(data['items'][0], cantidad=4)] * 2
        self.assertEqual(self.create(data).status_code, 400)
        self.assertEqual(Pedido.objects.count(), 0)

    def test_foreign_product_wrong_sku_and_inactive_product_are_rejected(self):
        foreign = self.repo.create('999', {'nombre': 'Ajeno', 'activo': True, 'variantes': []})
        for field, value in (('producto_id', foreign), ('sku', 'WRONG')):
            data = deepcopy(self.payload)
            data['items'][0][field] = value
            self.assertEqual(self.create(data).status_code, 400)
        self.repo.collection.update_many({}, {'$set': {'activo': False}})
        self.assertEqual(self.create().status_code, 400)
        self.assertEqual(Pedido.objects.count(), 0)

    def test_cannot_supply_buyer_total_price_or_store(self):
        for field in ('comprador', 'user_id', 'id_usuario', 'monto_total', 'tienda_id'):
            data = dict(self.payload, **{field: 123})
            self.assertEqual(self.create(data).status_code, 400, field)
        data = deepcopy(self.payload)
        data['items'][0]['precio'] = 1
        self.assertEqual(self.create(data).status_code, 400)
        self.assertEqual(Pedido.objects.count(), 0)

    def test_shipping_discount_and_offer_are_computed_on_server(self):
        data = dict(self.payload, metodo_entrega='Chilexpress', codigo_promocional='VERANO20',
                    direccion={'street': 'Calle', 'number': '1', 'apt': '', 'city': 'Santiago', 'region': ''})
        self.assertEqual(self.create(data).status_code, 201)
        order = Pedido.objects.get()
        self.assertEqual(order.costo_envio, Decimal(3490))
        self.assertEqual(order.descuento, Decimal(6000))
        self.assertEqual(order.monto_total, Decimal(27490))

    def test_delivery_requires_real_address_and_invalid_token_is_rejected(self):
        self.assertEqual(self.create(dict(self.payload, metodo_entrega='Starken')).status_code, 400)
        self.api.credentials(HTTP_AUTHORIZATION='Token invalid-token')
        self.assertEqual(self.create().status_code, 401)

    def test_failure_in_item_storage_rolls_back_order(self):
        with patch('apps.core.presentation.checkout.ItemPedido.objects.bulk_create', side_effect=RuntimeError('db failure')):
            with self.assertRaises(RuntimeError):
                self.create()
        self.assertEqual(Pedido.objects.count(), 0)

    def test_existing_cart_keeps_quantities_subtotals_and_user_isolation(self):
        legacy = Usuario.objects.create(id_usuario=self.buyer.pk, correo='legacy@example.com',
                                        password_hash='unused', nombre='Comprador', apellido='', rol='cliente')
        cart = Carrito.objects.create(id_usuario=legacy)
        product = Producto.objects.create(nombre='Producto legado', precio=20, stock=7, id_tienda=self.store)
        ItemCarrito.objects.create(id_carrito=cart, id_producto=product, cantidad=4)
        response = self.api.get('/api/catalog/carrito/items/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'][0]['cantidad'], 4)
        self.assertEqual(response.data['data'][0]['subtotal'], 80)
        other = get_user_model().objects.create_user(username='cart-other')
        self.api.force_authenticate(other)
        response = self.api.get('/api/catalog/carrito/items/', {'user_id': self.buyer.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'], [])

    def test_existing_cart_requires_authentication(self):
        self.api.credentials()
        self.assertEqual(self.api.get('/api/catalog/carrito/items/').status_code, 401)
