from concurrent.futures import ThreadPoolExecutor
from importlib import import_module
from unittest.mock import patch
from uuid import uuid4

from bson import ObjectId
from django.test import SimpleTestCase

from apps.core.infrastructure.mongo_client import get_mongo_client


class MongoStockContract:
    """Mismo contrato para los dos caminos de importación existentes."""
    tienda_id = '37'

    def setUp(self):
        super().setUp()
        client = get_mongo_client()
        database_name = 'test_scrum236_' + uuid4().hex
        self.db = client[database_name]
        self.addCleanup(client.drop_database, database_name)
        module = import_module(self.repository_module)
        with patch.object(module, 'get_mongo_db', return_value=self.db):
            self.repository = module.ProductRepository()

    def create_product(self, stock=5):
        return self.repository.create(self.tienda_id, {
            'nombre': 'Producto', 'stock': stock,
            'variantes': [{'sku': 'SKU', 'stock': stock}],
        })

    def read(self, product_id):
        return self.db.productos.find_one({'_id': ObjectId(product_id)})

    def test_crea_producto_y_variantes_con_stock_cero_o_positivo(self):
        for stock in (0, 5):
            product = self.read(self.create_product(stock))
            self.assertEqual(product['stock'], stock)
            self.assertEqual(product['variantes'][0]['stock'], stock)

    def test_rechaza_creacion_negativa_sin_insertar_producto_ni_variantes(self):
        for data in ({'stock': -1}, {'variantes': [{'sku': 'OK', 'stock': 3}, {'sku': 'NO', 'stock': -1}]}):
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    self.repository.create(self.tienda_id, data)
                self.assertEqual(self.db.productos.count_documents({}), 0)

    def test_actualiza_producto_y_variantes_con_stock_cero_o_positivo(self):
        pk = self.create_product()
        for stock in (0, 3):
            self.assertTrue(self.repository.update(self.tienda_id, pk, {'stock': stock, 'variantes.0.stock': stock}))
            product = self.read(pk)
            self.assertEqual(product['stock'], stock)
            self.assertEqual(product['variantes'][0]['stock'], stock)
        self.assertTrue(self.repository.update(self.tienda_id, pk, {'variantes': [{'sku': 'NUEVA', 'stock': 0}]}))
        self.assertEqual(self.read(pk)['variantes'], [{'sku': 'NUEVA', 'stock': 0}])

    def test_rechaza_actualizaciones_negativas_completas_parciales_y_posicionales(self):
        pk = self.create_product()
        original = self.read(pk)
        updates = (
            {'stock': -1},
            {'variantes': [{'sku': 'SKU', 'stock': -1}]},
            {'variantes.0': {'sku': 'SKU', 'stock': -1}},
            {'variantes.0.stock': -1},
            {'variantes.$[].stock': -1},
        )
        for update in updates:
            with self.subTest(update=update):
                with self.assertRaises(ValueError):
                    self.repository.update(self.tienda_id, pk, {'nombre': 'No guardar', **update})
                self.assertEqual(self.read(pk), original)

    def test_rechaza_stock_no_entero_sin_persistir(self):
        pk = self.create_product()
        original = self.read(pk)
        for value in (-0.5, '-1', None, True, float('nan')):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.repository.update(self.tienda_id, pk, {'stock': value})
                self.assertEqual(self.read(pk), original)

    def test_descuento_exige_stock_en_la_misma_variante(self):
        pk = self.repository.create(self.tienda_id, {'variantes': [
            {'sku': 'ESCASO', 'stock': 1}, {'sku': 'ABUNDANTE', 'stock': 10},
        ]})
        original = self.read(pk)
        self.assertFalse(self.repository.decrease_stock(self.tienda_id, 'ESCASO', 2))
        self.assertEqual(self.read(pk), original)
        self.assertTrue(self.repository.decrease_stock(self.tienda_id, 'ABUNDANTE', 2))
        self.assertEqual(self.read(pk)['variantes'], [
            {'sku': 'ESCASO', 'stock': 1}, {'sku': 'ABUNDANTE', 'stock': 8},
        ])

    def test_descuento_hasta_cero_y_rechazo_de_operacion_siguiente(self):
        pk = self.create_product(2)
        self.assertTrue(self.repository.decrease_stock(self.tienda_id, 'SKU', 2))
        self.assertFalse(self.repository.decrease_stock(self.tienda_id, 'SKU', 1))
        self.assertEqual(self.read(pk)['variantes'][0]['stock'], 0)

    def test_descuento_invalido_no_modifica_inventario(self):
        pk = self.create_product()
        original = self.read(pk)
        for cantidad in (-1, 1.5, '-1', True):
            with self.assertRaises(ValueError):
                self.repository.decrease_stock(self.tienda_id, 'SKU', cantidad)
            self.assertEqual(self.read(pk), original)

    def test_descuentos_concurrentes_no_superan_stock_disponible(self):
        pk = self.create_product(3)
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda _: self.repository.decrease_stock(self.tienda_id, 'SKU', 1), range(8)))
        self.assertEqual(sum(results), 3)
        self.assertEqual(self.read(pk)['variantes'][0]['stock'], 0)


class MongoStockTests(MongoStockContract, SimpleTestCase):
    repository_module = 'apps.catalog.infrastructure.repositories'


class MongoStockAlternateRepositoryTests(MongoStockContract, SimpleTestCase):
    repository_module = 'apps.catalog.application.infrastructure.repositories'
