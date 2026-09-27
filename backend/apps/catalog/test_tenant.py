from importlib import import_module
from unittest.mock import patch
from uuid import uuid4

from bson import ObjectId
from django.test import SimpleTestCase

from apps.core.infrastructure.mongo_client import get_mongo_client


class MongoTenantContract:
    """Aislamiento del catálogo en ambos caminos de importación existentes."""

    tienda_id = '37'
    otra_tienda_id = '92'

    def setUp(self):
        super().setUp()
        client = get_mongo_client()
        database_name = 'test_scrum138_' + uuid4().hex
        self.db = client[database_name]
        self.addCleanup(client.drop_database, database_name)
        module = import_module(self.repository_module)
        with patch.object(module, 'get_mongo_db', return_value=self.db):
            self.products = module.ProductRepository()
            self.templates = module.AttributeTemplateRepository()

    def repositories(self):
        return (self.products, self.templates)

    def read(self, repository, document_id):
        return repository.collection.find_one({'_id': ObjectId(document_id)})

    def test_creacion_asigna_la_tienda_resuelta_sin_modificar_el_payload(self):
        for repository in self.repositories():
            with self.subTest(repository=type(repository).__name__):
                payload = {'nombre': 'Propio'}
                document_id = repository.create(self.tienda_id, payload)
                document = self.read(repository, document_id)
                self.assertEqual(document['tienda_id'], self.tienda_id)
                self.assertIsInstance(document['tienda_id'], str)
                self.assertEqual(payload, {'nombre': 'Propio'})

    def test_creacion_rechaza_tienda_del_payload_distinta_a_la_resuelta(self):
        for repository in self.repositories():
            for payload in (
                {'tienda_id': self.otra_tienda_id},
                {'tienda_id': int(self.tienda_id)},
                {'tienda_id': None},
                {'tienda_id.valor': self.otra_tienda_id},
            ):
                with self.subTest(repository=type(repository).__name__, payload=payload):
                    with self.assertRaises(ValueError):
                        repository.create(self.tienda_id, payload)
                    self.assertEqual(repository.collection.count_documents({}), 0)

    def test_id_ajeno_no_se_puede_leer_actualizar_ni_eliminar(self):
        for repository in self.repositories():
            with self.subTest(repository=type(repository).__name__):
                document_id = repository.create(self.otra_tienda_id, {'nombre': 'Ajeno'})
                original = self.read(repository, document_id)
                self.assertIsNone(repository.get_by_id(self.tienda_id, document_id))
                self.assertFalse(repository.update(self.tienda_id, document_id, {'nombre': 'Intrusion'}))
                self.assertFalse(repository.delete(self.tienda_id, document_id))
                self.assertEqual(self.read(repository, document_id), original)

    def test_id_propio_se_puede_leer_actualizar_y_eliminar(self):
        for repository in self.repositories():
            with self.subTest(repository=type(repository).__name__):
                document_id = repository.create(self.tienda_id, {'nombre': 'Propio'})
                self.assertEqual(repository.get_by_id(self.tienda_id, document_id)['_id'], document_id)
                self.assertTrue(repository.update(self.tienda_id, document_id, {
                    'nombre': 'Actualizado', 'tienda_id': self.tienda_id,
                }))
                self.assertEqual(repository.get_by_id(self.tienda_id, document_id)['nombre'], 'Actualizado')
                self.assertTrue(repository.delete(self.tienda_id, document_id))
                self.assertIsNone(self.read(repository, document_id))

    def test_productos_por_sku_slug_y_listado_filtran_la_tienda(self):
        self.products.create(self.otra_tienda_id, {
            'slug': 'compartido', 'activo': True,
            'variantes': [{'sku': 'COMPARTIDO', 'stock': 5}],
        })
        own_id = self.products.create(self.tienda_id, {
            'slug': 'compartido', 'activo': True,
            'variantes': [{'sku': 'COMPARTIDO', 'stock': 2}],
        })
        self.products.create(self.tienda_id, {'slug': 'inactivo', 'activo': False})
        self.assertEqual(self.products.get_by_sku(self.tienda_id, 'COMPARTIDO')['_id'], own_id)
        self.assertEqual(self.products.get_by_slug(self.tienda_id, 'compartido')['_id'], own_id)
        self.assertEqual(len(self.products.list_by_store(self.tienda_id)), 2)
        self.assertEqual([product['_id'] for product in self.products.list_by_store(self.tienda_id, True)], [own_id])

    def test_plantillas_por_categoria_y_listado_filtran_la_tienda(self):
        self.templates.create(self.otra_tienda_id, {'categoria': 'Ropa'})
        own_id = self.templates.create(self.tienda_id, {'categoria': 'Ropa'})
        self.assertEqual(self.templates.get_by_store_and_category(self.tienda_id, 'Ropa')['_id'], own_id)
        self.assertEqual([template['_id'] for template in self.templates.list_by_store(self.tienda_id)], [own_id])

    def test_descuento_solo_afecta_el_sku_de_la_tienda_resuelta(self):
        foreign_id = self.products.create(self.otra_tienda_id, {
            'variantes': [{'sku': 'COMPARTIDO', 'stock': 20}],
        })
        own_id = self.products.create(self.tienda_id, {
            'variantes': [{'sku': 'COMPARTIDO', 'stock': 2}],
        })
        foreign_original = self.read(self.products, foreign_id)
        self.assertTrue(self.products.decrease_stock(self.tienda_id, 'COMPARTIDO', 2))
        self.assertFalse(self.products.decrease_stock(self.tienda_id, 'COMPARTIDO', 1))
        self.assertEqual(self.read(self.products, own_id)['variantes'][0]['stock'], 0)
        self.assertEqual(self.read(self.products, foreign_id), foreign_original)

    def test_actualizacion_no_reasigna_tienda_ni_mediante_rutas_parciales(self):
        for repository in self.repositories():
            document_id = repository.create(self.tienda_id, {'nombre': 'Conservar'})
            original = self.read(repository, document_id)
            for update in (
                {'tienda_id': self.otra_tienda_id},
                {'tienda_id': int(self.tienda_id)},
                {'tienda_id': None},
                {'tienda_id': {'valor': self.otra_tienda_id}},
                {'tienda_id.valor': self.otra_tienda_id},
                {'tienda_id.$[]': self.otra_tienda_id},
            ):
                with self.subTest(repository=type(repository).__name__, update=update):
                    with self.assertRaises(ValueError):
                        repository.update(self.tienda_id, document_id, {'nombre': 'No guardar', **update})
                    self.assertEqual(self.read(repository, document_id), original)

    def test_tienda_id_debe_ser_cadena_decimal_canonica_en_todas_las_operaciones(self):
        document_id = str(ObjectId())
        operations = []
        for repository in self.repositories():
            operations.extend((
                lambda value, repo=repository: repo.create(value, {}),
                lambda value, repo=repository: repo.get_by_id(value, document_id),
                lambda value, repo=repository: repo.list_by_store(value),
                lambda value, repo=repository: repo.update(value, document_id, {'nombre': 'No guardar'}),
                lambda value, repo=repository: repo.delete(value, document_id),
            ))
        operations.extend((
            lambda value: self.products.get_by_sku(value, 'SKU'),
            lambda value: self.products.get_by_slug(value, 'slug'),
            lambda value: self.products.decrease_stock(value, 'SKU', 1),
            lambda value: self.templates.get_by_store_and_category(value, 'Ropa'),
        ))
        for invalid in (None, 37, True, '', 'empresa_123', '037', '0', '-1', '37.0', ' 37', '37\n', {'$ne': None}):
            for index, operation in enumerate(operations):
                with self.subTest(invalid=invalid, operation=index):
                    with self.assertRaises(ValueError):
                        operation(invalid)
        self.assertEqual(self.db.productos.count_documents({}), 0)
        self.assertEqual(self.db.plantillas_atributos.count_documents({}), 0)

    def test_documentos_legacy_sin_tienda_o_con_tipo_incorrecto_no_se_incluyen(self):
        for repository in self.repositories():
            for fields in ({}, {'tienda_id': int(self.tienda_id)}, {'tienda_id': 'empresa_123'}):
                with self.subTest(repository=type(repository).__name__, fields=fields):
                    document_id = str(repository.collection.insert_one(fields).inserted_id)
                    original = self.read(repository, document_id)
                    self.assertIsNone(repository.get_by_id(self.tienda_id, document_id))
                    self.assertFalse(repository.update(self.tienda_id, document_id, {'nombre': 'No guardar'}))
                    self.assertFalse(repository.delete(self.tienda_id, document_id))
                    self.assertEqual(self.read(repository, document_id), original)
            self.assertEqual(repository.list_by_store(self.tienda_id), [])


class MongoTenantTests(MongoTenantContract, SimpleTestCase):
    repository_module = 'apps.catalog.infrastructure.repositories'


class MongoTenantAlternateRepositoryTests(MongoTenantContract, SimpleTestCase):
    repository_module = 'apps.catalog.application.infrastructure.repositories'
