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
