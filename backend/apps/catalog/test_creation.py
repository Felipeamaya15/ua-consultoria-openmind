from copy import deepcopy
from unittest.mock import patch

from bson import ObjectId
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from pymongo.errors import AutoReconnect

from apps.catalog.infrastructure.indexes import create_catalog_indexes
from apps.catalog.test_inventory import TemporaryCatalog
from apps.core.models import Producto, Tienda


class CatalogAPITestCase(TemporaryCatalog, TestCase):
    def setUp(self):
        super().setUp()
        create_catalog_indexes()
        self.owner = get_user_model().objects.create_user(username='creation-owner')
        self.store = Tienda.objects.create(nombre='Creation', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.owner).key)
        self.url = '/api/catalog/productos/crear/'
        self.payload = {
            'nombre': 'Polera QA', 'descripcion': 'Algodón', 'categoria': 'Ropa',
            'activo': True, 'imagenes': ['https://example.com/polera.png'],
            'atributos_generales': [{'clave': 'material', 'etiqueta': 'Material', 'valor': 'Algodón'}],
            'variantes': [
                {'sku': ' qa-m ', 'precio': 100, 'precio_oferta': 80, 'stock': 7,
                 'atributos_variante': [{'clave': 'talla', 'etiqueta': 'Talla', 'valor': 'M'}]},
                {'sku': 'QA-L', 'precio': 120, 'stock': 0,
                 'atributos_variante': [{'clave': 'talla', 'etiqueta': 'Talla', 'valor': 'L'}]},
            ],
            'seo': {'meta_titulo': 'Polera', 'meta_descripcion': 'Algodón'},
        }

    def create(self, payload=None):
        response = self.api.post(self.url, payload or self.payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['data']['id']


class ProductCreationTests(CatalogAPITestCase):
    def test_token_creation_persists_document_and_public_detail_and_filters(self):
        pk = self.create()
        document = self.read(pk)
        self.assertEqual(document['tienda_id'], str(self.store.pk))
        for field in ('nombre', 'descripcion', 'categoria', 'activo', 'imagenes', 'atributos_generales', 'seo'):
            self.assertEqual(document[field], self.payload[field])
        self.assertEqual([v['sku'] for v in document['variantes']], ['QA-M', 'QA-L'])
        self.assertEqual([v['stock'] for v in document['variantes']], [7, 0])
        self.assertIn('fecha_creacion', document)
        self.assertFalse(Producto.objects.exists())
        self.api.credentials()
        listing = self.api.get('/api/catalog/productos/?attr.talla=M&attr.material=Algodón')
        self.assertEqual(listing.status_code, 200, listing.data)
        self.assertEqual([p['id'] for p in listing.data['data']], [pk])
        detail = self.api.get(f'/api/catalog/productos/{document["slug"]}/')
        self.assertEqual(detail.data['data']['variantes'][0]['precio_oferta'], 80)
        self.assertEqual(detail.data['data']['imagenes'], self.payload['imagenes'])

    def test_inactive_product_is_persisted_and_hidden(self):
        self.payload['activo'] = False
        pk = self.create()
        self.assertFalse(self.read(pk)['activo'])
        self.assertEqual(self.api.get('/api/catalog/productos/').data['data'], [])
        self.assertEqual(self.api.get('/api/catalog/productos/polera-qa/').status_code, 404)

    def test_invalid_stock_sku_attributes_images_do_not_write(self):
        invalid = []
        for stock in (-1, True, 1.0, 1.5, None):
            payload = deepcopy(self.payload)
            payload['variantes'][0]['stock'] = stock
            invalid.append(payload)
        payload = deepcopy(self.payload)
        payload['variantes'][1]['sku'] = 'qa-m'
        invalid.append(payload)
        payload = deepcopy(self.payload)
        payload['variantes'][1]['atributos_variante'] = []
        invalid.append(payload)
        payload = deepcopy(self.payload)
        payload['imagenes'] = ['data:image/gif;base64,AAAA']
        invalid.append(payload)
        for payload in invalid:
            response = self.api.post(self.url, payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.db.productos.count_documents({}), 0)

    def test_sku_is_unique_per_store_and_slug_collision_gets_suffix(self):
        self.create()
        self.assertEqual(self.api.post(self.url, self.payload, format='json').status_code, 400)
        self.payload['variantes'][0]['sku'] = 'NEW-M'
        self.payload['variantes'][1]['sku'] = 'NEW-L'
        pk = self.create()
        self.assertEqual(self.read(pk)['slug'], 'polera-qa-2')

    def test_requires_owner_and_rejects_client_store_selection(self):
        self.api.credentials()
        self.assertEqual(self.api.post(self.url, self.payload, format='json').status_code, 401)
        outsider = get_user_model().objects.create_user(username='creation-outsider')
        self.api.force_authenticate(user=outsider)
        self.assertEqual(self.api.post(self.url, self.payload, format='json').status_code, 403)
        self.api.force_authenticate(user=self.owner)
        self.payload['tienda_id'] = '999'
        self.assertEqual(self.api.post(self.url, self.payload, format='json').status_code, 400)
        self.assertEqual(self.db.productos.count_documents({}), 0)

    def test_persistence_failure_returns_error_without_success(self):
        with patch('apps.catalog.infrastructure.repositories.ProductRepository.create', side_effect=AutoReconnect()):
            response = self.api.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.data['exito'])
        self.assertEqual(self.db.productos.count_documents({}), 0)

    def test_existing_sql_soft_delete_still_updates_linked_document(self):
        product = Producto.objects.create(nombre='Legacy', precio=100, stock=1, id_tienda=self.store)
        pk = self.repo.create(str(self.store.pk), {
            'id_postgresql': product.pk, 'nombre': 'Legacy', 'slug': 'legacy',
            'categoria': 'Ropa', 'activo': True,
            'variantes': [{'sku': 'LEGACY', 'precio': 100, 'stock': 1}],
        })
        response = self.api.delete(f'/api/catalog/productos/{product.pk}/eliminar/')
        self.assertEqual(response.status_code, 200, response.data)
        product.refresh_from_db()
        self.assertFalse(product.activo)
        self.assertFalse(self.read(pk)['activo'])

    def test_variant_stock_and_soft_delete_preserve_document_and_other_store(self):
        other_id = self.product('999')
        pk = self.create()
        response = self.api.patch(f'/api/catalog/productos/{pk}/variantes/QA-M/stock/', {'stock': 3}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([v['stock'] for v in self.read(pk)['variantes']], [3, 0])
        self.assertEqual(self.api.delete(f'/api/catalog/productos/{other_id}/eliminar/').status_code, 404)
        self.assertTrue(self.read(other_id)['activo'])
        response = self.api.delete(f'/api/catalog/productos/{pk}/eliminar/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(self.read(pk))
        self.assertFalse(self.read(pk)['activo'])
        self.assertEqual(self.api.get('/api/catalog/productos/').data['data'], [])
