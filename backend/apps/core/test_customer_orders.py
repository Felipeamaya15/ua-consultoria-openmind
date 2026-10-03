from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from apps.core.models import Usuario, Tienda, Producto, Pedido, ItemPedido


class CustomerOrderHistoryTests(TestCase):
    url = '/api/mi-cuenta/pedidos/'

    def setUp(self):
        User = get_user_model()
        self.customer = User.objects.create_user(username='buyer', email='buyer@example.com')
        self.other = User.objects.create_user(username='other')
        self.owner = User.objects.create_user(username='owner')
        self.store = Tienda.objects.create(nombre='Store', id_usuario_propietario=self.owner)
        self.legacy = Usuario.objects.create(correo='buyer@example.com', password_hash='unused', nombre='Buyer', apellido='', rol='cliente')
        self.product = Producto.objects.create(nombre='Producto real', precio=20, stock=0, id_tienda=self.store)
        self.own = Pedido.objects.create(id_usuario=self.legacy, comprador=self.customer, monto_total=40, estado='enviado')
        ItemPedido.objects.create(id_pedido=self.own, id_producto=self.product, cantidad=2, precio_unitario=20)
        self.foreign = Pedido.objects.create(id_usuario=self.legacy, comprador=self.other, monto_total=20)
        self.unlinked = Pedido.objects.create(id_usuario=self.legacy, monto_total=20)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.customer).key)

    def test_only_explicitly_owned_orders_newest_first(self):
        newer = Pedido.objects.create(id_usuario=self.legacy, comprador=self.customer, monto_total=0)
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([o['id_pedido'] for o in response.data['data']], [newer.pk, self.own.pk])
        self.assertEqual(response.data['data'][1]['cantidad_productos'], 2)
        self.assertNotIn('id_usuario', response.data['data'][0])

    def test_customer_without_orders_gets_empty_list(self):
        empty = get_user_model().objects.create_user(username='empty', email='buyer@example.com')
        self.api.force_authenticate(empty)
        self.assertEqual(self.api.get(self.url).data['data'], [])

    def test_own_detail_uses_stored_prices_and_official_state(self):
        response = self.api.get(f'{self.url}{self.own.pk}/')
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual(data['estado'], 'enviado')
        self.assertEqual(data['estado_etiqueta'], 'Enviado')
        self.assertEqual(data['monto_total'], '40.00')
        self.assertEqual(data['items'][0]['precio_unitario'], '20.00')
        self.assertEqual(data['items'][0]['subtotal'], '40.00')
        self.assertEqual(data['items'][0]['nombre'], 'Producto real')
        self.assertNotIn('pago', data)
        self.assertNotIn('sku', data['items'][0])

    def test_foreign_unlinked_and_missing_order_are_not_found(self):
        for pk in (self.foreign.pk, self.unlinked.pk, 99999):
            self.assertEqual(self.api.get(f'{self.url}{pk}/').status_code, 404)

    def test_cannot_select_other_buyer(self):
        for key in ('user_id', 'id_usuario', 'comprador', 'comprador_id'):
            self.assertEqual(self.api.get(self.url, {key: self.other.pk}).status_code, 400)
            self.assertEqual(self.api.get(f'{self.url}{self.own.pk}/', {key: self.other.pk}).status_code, 400)

    def test_anonymous_gets_401(self):
        self.api.credentials()
        self.assertEqual(self.api.get(self.url).status_code, 401)
        self.assertEqual(self.api.get(f'{self.url}{self.own.pk}/').status_code, 401)

    def test_owner_staff_and_superuser_are_denied(self):
        for user in (self.owner, self.other):
            if user == self.other:
                user.is_staff = True
                user.save()
            self.api.force_authenticate(user)
            self.assertEqual(self.api.get(self.url).status_code, 403)
            self.assertEqual(self.api.get(f'{self.url}{self.own.pk}/').status_code, 403)
        self.other.is_staff = False
        self.other.is_superuser = True
        self.other.save()
        self.assertEqual(self.api.get(self.url).status_code, 403)

    def test_history_is_read_only(self):
        for method in ('post', 'patch', 'put', 'delete'):
            self.assertEqual(getattr(self.api, method)(f'{self.url}{self.own.pk}/', {}, format='json').status_code, 405)
        self.assertEqual(Pedido.objects.count(), 3)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 0)
