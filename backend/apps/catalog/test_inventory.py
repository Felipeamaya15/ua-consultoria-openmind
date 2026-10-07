from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from bson import ObjectId
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import F
from django.test import SimpleTestCase, TestCase
from pymongo.errors import WriteError
from rest_framework.test import APIClient

from apps.catalog.application.services import VariantService
from apps.catalog.application.use_cases import ActualizarStockProductoUseCase, CrearProductoUseCase
from apps.catalog.domain.models import Variante
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.infrastructure.stock_validation import ensure_product_stock_validator
from apps.catalog.presentation.serializers import ProductCreateSerializer, ProductoUpdateSerializer
from apps.core.infrastructure.mongo_client import get_mongo_client
from apps.core.models import Producto, Tienda


class TemporaryCatalog:
    def setUp(self):
        super().setUp()
        client = get_mongo_client()
        database_name = 'test_inventory_' + uuid4().hex
        self.db = client[database_name]
        self.addCleanup(client.drop_database, database_name)
        override = self.settings(MONGO_DB_NAME=database_name)
        override.enable()
        self.addCleanup(override.disable)
        ensure_product_stock_validator(self.db)
        self.repo = ProductRepository()
        self.service = VariantService(self.repo)

    def product(self, tienda_id='37'):
        return self.repo.create(tienda_id, {
            'nombre': 'Producto de prueba', 'slug': uuid4().hex, 'categoria': 'Pruebas',
            'activo': True, 'variantes': [
                {'sku': 'A', 'precio': 100, 'stock': 10, 'atributos_variante': []},
                {'sku': 'B', 'precio': 200, 'stock': 5, 'atributos_variante': []},
            ],
        })

    def read(self, product_id):
        return self.db.productos.find_one({'_id': ObjectId(product_id)})


class InventoryPersistenceTests(TemporaryCatalog, SimpleTestCase):
    def test_stock_independiente_persistido_y_actualizacion_sin_cambio(self):
        pk = self.product()
        before = self.read(pk)
        self.assertEqual(self.service.update_stock('37', pk, 'A', 7)['stock'], 7)
        expected = before
        expected['variantes'][0]['stock'] = 7
        self.assertEqual(self.read(pk), expected)
        self.assertEqual(self.service.update_stock('37', pk, 'A', 7)['stock'], 7)
        self.assertEqual(ProductRepository().get_by_id('37', pk)['variantes'][1]['stock'], 5)



    def test_cero_y_positivo_validos_en_todos_los_caminos_de_variante(self):
        pk = self.product()
        for stock in (0, 3):
            self.assertEqual(self.service.update_stock('37', pk, 'A', stock)['stock'], stock)
            self.assertTrue(self.repo.update_variant('37', pk, 'B', {'stock': stock}))
        self.assertTrue(self.repo.add_variant('37', pk, {'sku': 'C', 'stock': 0}))
        self.assertEqual(self.read(pk)['variantes'][2]['stock'], 0)

    def test_repositorio_y_servicio_rechazan_negativos_sin_cambios(self):
        pk = self.product()
        original = self.read(pk)
        calls = [
            lambda: self.repo.add_variant('37', pk, {'sku': 'C', 'stock': -1}),
            lambda: self.repo.update_variant('37', pk, 'A', {'stock': -1, 'precio': 999}),
            lambda: self.repo.update_variant_stock('37', pk, 'A', -1),
            lambda: self.service.create_variant('37', pk, {'sku': 'C', 'precio': 5, 'stock': -1}),
            lambda: self.service.update_variant('37', pk, 'A', {'stock': -1}),
            lambda: self.service.update_stock('37', pk, 'A', -1),
        ]
        for call in calls:
            with self.assertRaises(ValueError): call()
            self.assertEqual(self.read(pk), original)

    def test_otras_tiendas_y_ids_inexistentes_no_se_actualizan(self):
        pk = self.product('92')
        original = self.read(pk)
        self.assertIsNone(self.service.update_stock('37', pk, 'A', 7))
        self.assertFalse(self.repo.update_variant('37', pk, 'A', {'stock': 7}))
        self.assertFalse(self.repo.add_variant('37', pk, {'sku': 'C', 'stock': 0}))
        self.assertIsNone(self.service.update_stock('92', pk, 'NO-EXISTE', 7))
        self.assertIsNone(self.service.update_stock('92', 'no-es-objectid', 'A', 7))
        self.assertEqual(self.read(pk), original)

    def test_descontar_mas_stock_rechaza_y_no_cambia_otras_variantes(self):
        pk = self.product()
        original = self.read(pk)
        self.assertFalse(self.repo.decrease_stock('37', 'B', 6))
        self.assertEqual(self.read(pk), original)
        self.assertTrue(self.service.process_purchase('37', 'B', 5))
        self.assertEqual(self.read(pk)['variantes'][1]['stock'], 0)
        self.assertEqual(self.read(pk)['variantes'][0]['stock'], 10)
        with self.assertRaises(ValueError): self.service.process_purchase('37', 'B', 1)

    def test_descuento_concurrente_no_deja_negativos(self):
        pk = self.product()
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.repo.decrease_stock('37', 'B', 1), range(8)))
        self.assertEqual(sum(results), 5)
        self.assertEqual(self.read(pk)['variantes'][1]['stock'], 0)

    def test_regla_mongo_rechaza_escrituras_directas_y_descontar_sin_guardia(self):
        pk = self.product()
        original = self.read(pk)
        for data in ({'stock': -1}, {'variantes': [{'stock': -1}]}, {'stock': True}, {'stock': 1.5}):
            with self.assertRaises(WriteError) as error:
                self.db.productos.insert_one(data)
            self.assertEqual(error.exception.code, 121)
        for update in (
            {'$set': {'stock': -1}}, {'$set': {'variantes.0.stock': -1}},
            {'$push': {'variantes': {'sku': 'INVALIDA', 'stock': -1}}},
            {'$inc': {'variantes.0.stock': -11}},
        ):
            with self.assertRaises(WriteError):
                self.db.productos.update_one({'_id': ObjectId(pk)}, update)
            self.assertEqual(self.read(pk), original)

    def test_regla_conserva_documentos_antiguos_y_otros_validadores(self):
        self.db.productos.insert_one({'nombre': 'Antiguo', 'variantes': [{'sku': 'SIN-STOCK'}]})
        other = {'$jsonSchema': {'properties': {'nombre': {'bsonType': 'string'}}}}
        self.db.command('collMod', 'productos', validator=other)
        ensure_product_stock_validator(self.db)
        options = next(self.db.list_collections(filter={'name': 'productos'}))['options']
        self.assertIn(other, options['validator']['$and'])
        ensure_product_stock_validator(self.db)
        self.assertEqual(next(self.db.list_collections(filter={'name': 'productos'}))['options'], options)
        with self.assertRaises(WriteError): self.db.productos.insert_one({'nombre': 3})
        with self.assertRaises(WriteError): self.db.productos.insert_one({'stock': -1})

    def test_auditoria_no_repara_negativos_antiguos_silenciosamente(self):
        self.db.command('collMod', 'productos', validator={})
        pk = self.db.productos.insert_one({'stock': -2}).inserted_id
        with self.assertRaisesRegex(ValueError, 'inventario inválido'):
            ensure_product_stock_validator(self.db)
        self.assertEqual(self.db.productos.find_one({'_id': pk})['stock'], -2)

    def test_sku_repetido_no_se_inserta_ni_siquiera_concurrentemente(self):
        pk = self.product()
        def add(_):
            try: return self.repo.add_variant('37', pk, {'sku': 'C', 'stock': 1})
            except ValueError: return False
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(sum(pool.map(add, range(4))), 1)
        self.assertEqual(len([v for v in self.read(pk)['variantes'] if v['sku'] == 'C']), 1)

    def test_dominio_y_serializer_de_creacion_rechazan_stock_negativo(self):
        for stock in (0, 2): self.assertEqual(Variante('SKU', 1, stock, {}).stock, stock)
        for stock in (-1, True, 1.5):
            with self.assertRaises(ValueError): Variante('SKU', 1, stock, {})
        serializer = ProductCreateSerializer(data={'nombre': 'Prueba', 'categoria': 'Prueba', 'variantes': [{'sku': 'A', 'precio': 1, 'stock': -1}]})
        self.assertFalse(serializer.is_valid())

class VariantAttributeValidationTests(TemporaryCatalog, SimpleTestCase):

    def product_with_attribute_schema(self):
        return self.repo.create('37', {
            'nombre': 'Polera de prueba',
            'slug': uuid4().hex,
            'categoria': 'Vestuario',
            'activo': True,
            'variantes': [
                {
                    'sku': 'POL-M-ROJO',
                    'precio': 10000,
                    'stock': 5,
                    'atributos_variante': [
                        {
                            'clave': 'talla',
                            'etiqueta': 'Talla',
                            'valor': 'M'
                        },
                        {
                            'clave': 'color',
                            'etiqueta': 'Color',
                            'valor': 'Rojo'
                        }
                    ]
                }
            ]
        })

    def test_crear_variante_con_esquema_valido(self):
        pk = self.product_with_attribute_schema()

        variante = self.service.create_variant(
            '37',
            pk,
            {
                'sku': 'POL-L-AZUL',
                'precio': 12000,
                'stock': 3,
                'atributos_variante': [
                    {
                        'clave': 'talla',
                        'etiqueta': 'Talla',
                        'valor': 'L'
                    },
                    {
                        'clave': 'color',
                        'etiqueta': 'Color',
                        'valor': 'Azul'
                    }
                ]
            }
        )

        self.assertEqual(variante['sku'], 'POL-L-AZUL')

        producto = self.read(pk)

        creada = next(
            v for v in producto['variantes']
            if v['sku'] == 'POL-L-AZUL'
        )

        self.assertEqual(
            {a['clave'] for a in creada['atributos_variante']},
            {'talla', 'color'}
        )

    def test_crear_variante_incompleta_se_rechaza_sin_persistir(self):
        pk = self.product_with_attribute_schema()
        original = self.read(pk)

        with self.assertRaisesRegex(
            ValueError,
            'faltan atributos requeridos'
        ):
            self.service.create_variant(
                '37',
                pk,
                {
                    'sku': 'POL-L',
                    'precio': 12000,
                    'stock': 3,
                    'atributos_variante': [
                        {
                            'clave': 'talla',
                            'etiqueta': 'Talla',
                            'valor': 'L'
                        }
                    ]
                }
            )

        self.assertEqual(self.read(pk), original)

    def test_crear_variante_con_atributo_no_definido_se_rechaza(self):
        pk = self.product_with_attribute_schema()
        original = self.read(pk)

        with self.assertRaisesRegex(
            ValueError,
            'atributos no definidos'
        ):
            self.service.create_variant(
                '37',
                pk,
                {
                    'sku': 'POL-L-ALGODON',
                    'precio': 12000,
                    'stock': 3,
                    'atributos_variante': [
                        {
                            'clave': 'talla',
                            'etiqueta': 'Talla',
                            'valor': 'L'
                        },
                        {
                            'clave': 'material',
                            'etiqueta': 'Material',
                            'valor': 'Algodón'
                        }
                    ]
                }
            )

        self.assertEqual(self.read(pk), original)

    def test_actualizar_variante_con_esquema_invalido_se_rechaza(self):
        pk = self.product_with_attribute_schema()
        original = self.read(pk)

        with self.assertRaisesRegex(
            ValueError,
            'faltan atributos requeridos'
        ):
            self.service.update_variant(
                '37',
                pk,
                'POL-M-ROJO',
                {
                    'atributos_variante': [
                        {
                            'clave': 'talla',
                            'etiqueta': 'Talla',
                            'valor': 'XL'
                        }
                    ]
                }
            )

        self.assertEqual(self.read(pk), original)

class InventoryAPITests(TemporaryCatalog, TestCase):
    def setUp(self):
        super().setUp()
        self.owner = get_user_model().objects.create_user(username='inventory-owner')
        self.store = Tienda.objects.create(nombre='Pruebas', id_usuario_propietario=self.owner)
        self.pk = self.product(str(self.store.pk))
        self.url = f'/api/catalog/productos/{self.pk}/variantes/A/stock/'
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

    def test_patch_actualiza_a_y_conserva_b_y_todos_los_demas_campos(self):
        before = self.read(self.pk)
        response = self.api.patch(self.url, {'stock': 7, 'precio': 999}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['stock'], 7)
        before['variantes'][0]['stock'] = 7
        self.assertEqual(self.read(self.pk), before)
        response = self.api.get(f'/api/catalog/productos/{before["slug"]}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([v['stock'] for v in response.data['data']['variantes']], [7, 5])
        self.assertEqual(self.api.patch(self.url, {'stock': 7}, format='json').status_code, 200)
        self.assertEqual(self.api.patch(self.url, {'stock': 0}, format='json').status_code, 200)

    def test_stock_invalido_devuelve_400_sin_escribir(self):
        original = self.read(self.pk)
        for payload in ({'stock': -1}, {'stock': 1.5}, {'stock': True}, {'stock': None}, {}, {'stock': 'no'}):
            response = self.api.patch(self.url, payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(self.read(self.pk), original)

    def test_producto_o_variante_ajenos_o_inexistentes_devuelven_404(self):
        other = self.product('92')
        for product_id, sku in ((other, 'A'), (self.pk, 'NO'), ('invalido', 'A'), (str(ObjectId()), 'A')):
            response = self.api.patch(f'/api/catalog/productos/{product_id}/variantes/{sku}/stock/', {'stock': 7}, format='json')
            self.assertEqual(response.status_code, 404, response.data)

    def test_requiere_autenticacion_y_propietario(self):
        self.api.force_authenticate(user=None)
        self.assertEqual(self.api.patch(self.url, {'stock': 7}, format='json').status_code, 401)
        outsider = get_user_model().objects.create_user(username='inventory-outsider')
        self.api.force_authenticate(user=outsider)
        self.assertEqual(self.api.patch(self.url, {'stock': 7}, format='json').status_code, 403)
        self.assertEqual(self.read(self.pk)['variantes'][0]['stock'], 10)

    def test_actualizacion_general_sql_rechaza_stock_negativo_con_400(self):
        product = Producto.objects.create(nombre='SQL', precio=10, stock=5, id_tienda=self.store)
        response = self.api.put(f'/api/catalog/productos/{product.pk}/actualizar/', {'stock': -1, 'nombre': 'No guardar'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        product.refresh_from_db()
        self.assertEqual((product.stock, product.nombre), (5, 'SQL'))
        for stock in (0, 3):
            response = self.api.patch(f'/api/catalog/productos/{product.pk}/stock/', {'stock': stock}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            product.refresh_from_db()
            self.assertEqual(product.stock, stock)

    def test_sql_rechaza_bypass_y_servicios_directos_negativos(self):
        product = Producto.objects.create(nombre='SQL', precio=10, stock=5, id_tienda=self.store)
        for value in (-1, F('stock') - 6):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Producto.objects.filter(pk=product.pk).update(stock=value)
            product.refresh_from_db()
            self.assertEqual(product.stock, 5)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Producto.objects.create(nombre='Inválido', precio=10, stock=-1, id_tienda=self.store)
        with self.assertRaises(ValueError):
            ActualizarStockProductoUseCase().ejecutar(self.store, product.pk, -1)
        with self.assertRaises(ValueError):
            CrearProductoUseCase().ejecutar(self.store, {'nombre': 'Inválido', 'precio': 10, 'stock': -1})
        self.assertFalse(ProductoUpdateSerializer(data={'stock': -1}, partial=True).is_valid())
