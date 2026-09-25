from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import ItemPedido, Pedido, Producto, Tienda, Usuario, VarianteProducto


class StockPostgreSQLTests(TestCase):
    def setUp(self):
        self.usuario = Usuario.objects.create(
            correo='stock@example.test', password_hash='test', nombre='Stock',
            apellido='Test', rol='admin',
        )
        self.propietario = get_user_model().objects.create_user(username='propietario-stock')
        self.tienda = Tienda.objects.create(nombre='Test', id_usuario_propietario=self.propietario)
        self.producto = Producto.objects.create(
            nombre='Producto', precio=10, stock=5, id_tienda=self.tienda,
        )
        self.variante = VarianteProducto.objects.create(
            id_producto=self.producto, sku='SKU', precio=10, stock=5,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.propietario)

    def test_creacion_y_actualizacion_no_negativas_en_ambos_modelos(self):
        for stock in (0, 3):
            producto = Producto.objects.create(
                nombre='Nuevo', precio=10, stock=stock, id_tienda=self.tienda,
            )
            variante = VarianteProducto.objects.create(
                id_producto=producto, sku=f'VALIDO-{stock}', precio=10, stock=stock,
            )
            for obj in (producto, variante):
                obj.stock = 2
                obj.save(update_fields=['stock'])
                obj.refresh_from_db()
                self.assertEqual(obj.stock, 2)
                obj.stock = 0
                obj.save(update_fields=['stock'])
                obj.refresh_from_db()
                self.assertEqual(obj.stock, 0)

    def test_restricciones_sql_rechazan_creacion_negativa(self):
        datos = (
            (Producto, dict(nombre='Inválido', precio=10, stock=-1, id_tienda=self.tienda)),
            (VarianteProducto, dict(id_producto=self.producto, sku='INVALIDO', precio=10, stock=-1)),
        )
        for model, fields in datos:
            with self.subTest(model=model.__name__):
                count = model.objects.count()
                with self.assertRaises(IntegrityError), transaction.atomic():
                    model.objects.create(**fields)
                self.assertEqual(model.objects.count(), count)

    def test_restricciones_sql_rechazan_update_y_descuento_sin_alterar_stock(self):
        for obj in (self.producto, self.variante):
            for value in (-1, F('stock') - 6):
                with self.subTest(model=type(obj).__name__, value=str(value)):
                    with self.assertRaises(IntegrityError), transaction.atomic():
                        type(obj).objects.filter(pk=obj.pk).update(stock=value)
                    obj.refresh_from_db()
                    self.assertEqual(obj.stock, 5)

    def test_validacion_de_modelos_rechaza_stock_negativo(self):
        for obj in (self.producto, self.variante):
            obj.stock = -1
            with self.assertRaises(ValidationError):
                obj.full_clean(exclude=['atributos'])

    def test_api_crea_variantes_no_negativas_y_rechaza_negativa(self):
        url = f'/api/productos/{self.producto.pk}/variantes/'
        for stock in (0, 2):
            response = self.api.post(url, {'sku': f'API-{stock}', 'precio': 10, 'stock': stock}, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        count = VarianteProducto.objects.count()
        response = self.api.post(url, {'sku': 'API-INVALIDO', 'precio': 10, 'stock': -1}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(VarianteProducto.objects.count(), count)

    def test_api_actualiza_stock_y_rechaza_negativo_sin_modificar_otros_datos(self):
        url = f'/api/productos/{self.producto.pk}/variantes/{self.variante.pk}/'
        for stock in (0, 3):
            response = self.api.patch(url, {'stock': stock}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.variante.refresh_from_db()
            self.assertEqual(self.variante.stock, stock)
        response = self.api.patch(url, {'stock': -1, 'precio': 99}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 3)
        self.assertEqual(self.variante.precio, 10)

    def test_compra_fallida_revierte_descuentos_anteriores(self):
        response = self.api.post('/api/compras/', {
            'id_usuario': self.usuario.pk,
            'items': [{'id_variante': self.variante.pk, 'cantidad': 3}] * 2,
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 5)
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ItemPedido.objects.exists())
