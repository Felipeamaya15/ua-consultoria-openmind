from copy import deepcopy
from unittest.mock import patch

from bson import ObjectId
from django.contrib.auth import get_user_model
from pymongo.errors import AutoReconnect

from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.test_creation import CatalogAPITestCase
from apps.core.models import Producto


class ProductEditingTests(CatalogAPITestCase):
    def setUp(self):
        super().setUp()
        self.pk = self.create()
        self.detail_url = f'/api/catalog/productos/{self.pk}/admin/'
        self.update_url = f'/api/catalog/productos/{self.pk}/actualizar/'

    def edit_payload(self):
        response = self.api.get(self.detail_url)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['data']

    def test_admin_list_includes_inactive_and_real_ids_only_in_own_store(self):
        other = self.product('999')
        Producto.objects.create(nombre='Only SQL', precio=1, stock=1, id_tienda=self.store)
        self.repo.update(str(self.store.pk), self.pk, {'activo': False})
        response = self.api.get('/api/catalog/productos/admin/listado/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([p['id'] for p in response.data['data']], [self.pk])
        self.assertFalse(response.data['data'][0]['activo'])
        self.assertNotEqual(other, self.pk)
        self.assertTrue(ObjectId.is_valid(response.data['data'][0]['id']))

    def test_put_persists_every_edit_and_public_reads_new_values_with_stable_slug(self):
        before = self.read(self.pk)
        payload = self.edit_payload()
        payload.update(nombre='Polera editada', descripcion='Nueva descripción', categoria='Vestuario',
                       imagenes=['https://example.com/edit.png'],
                       atributos_generales=[{'clave': 'material', 'etiqueta': 'Material', 'valor': 'Lino'}],
                       seo={'meta_titulo': 'Nuevo título', 'meta_descripcion': 'Nueva meta'})
        payload['variantes'][0].update(sku='EDIT-M', precio=200, precio_oferta=150, stock=6)
        payload['variantes'][0]['atributos_variante'][0]['valor'] = 'XL'
        response = self.api.put(self.update_url, payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        after = self.read(self.pk)
        for field in ('nombre', 'descripcion', 'categoria', 'imagenes', 'atributos_generales', 'seo', 'variantes'):
            self.assertEqual(after[field], payload[field])
        self.assertEqual(after['tienda_id'], str(self.store.pk))
        self.assertEqual(after['slug'], before['slug'])
        self.assertEqual(after['fecha_creacion'], before['fecha_creacion'])
        self.assertNotEqual(response.data['data']['revision'], payload['revision'])
        self.api.credentials()
        listing = self.api.get('/api/catalog/productos/?attr.talla=XL&attr.material=Lino')
        self.assertEqual(listing.data['data'][0]['nombre'], 'Polera editada')
        public = self.api.get(f'/api/catalog/productos/{before["slug"]}/')
        self.assertEqual(public.data['data']['variantes'][0]['stock'], 6)

    def test_patch_same_values_and_toggle_publication(self):
        payload = self.edit_payload()
        response = self.api.put(self.update_url, payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        original = self.read(self.pk)
        response = self.api.patch(self.update_url, {'revision': response.data['data']['revision'], 'activo': False}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.read(self.pk)['variantes'], original['variantes'])
        self.assertEqual(self.api.get('/api/catalog/productos/').data['data'], [])
        self.assertEqual(self.api.get(self.detail_url).status_code, 200)
        response = self.api.patch(self.update_url, {'revision': response.data['data']['revision'], 'activo': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(self.api.get('/api/catalog/productos/').data['data']), 1)

    def test_invalid_stock_duplicate_sku_and_incomplete_attributes_leave_document_intact(self):
        original = self.read(self.pk)
        for stock in (-1, 1.5, True):
            payload = self.edit_payload()
            payload['variantes'][0]['stock'] = stock
            self.assertEqual(self.api.put(self.update_url, payload, format='json').status_code, 400)
        payload = self.edit_payload()
        payload['variantes'][1]['sku'] = 'qa-m'
        self.assertEqual(self.api.put(self.update_url, payload, format='json').status_code, 400)
        payload = self.edit_payload()
        payload['variantes'][0]['atributos_variante'] = []
        self.assertEqual(self.api.put(self.update_url, payload, format='json').status_code, 400)
        self.assertEqual(self.read(self.pk), original)

    def test_duplicate_sku_from_another_product_is_rejected(self):
        self.product(str(self.store.pk))
        payload = self.edit_payload()
        payload['variantes'][0]['sku'] = 'A'
        self.assertEqual(self.api.put(self.update_url, payload, format='json').status_code, 400)
        self.assertEqual(self.read(self.pk)['variantes'][0]['sku'], 'QA-M')

    def test_add_remove_variants_and_preserve_legacy_metadata_and_soft_delete(self):
        self.db.productos.update_one({'_id': ObjectId(self.pk)}, {'$set': {
            'variantes.0.es_activa': False, 'variantes.0.id_variante': 'historical',
        }})
        payload = self.edit_payload()
        payload['variantes'] = [payload['variantes'][0], {
            'sku': 'NEW-XL', 'precio': 150, 'stock': 2,
            'atributos_variante': [{'clave': 'talla', 'etiqueta': 'Talla', 'valor': 'XL'}],
        }]
        response = self.api.put(self.update_url, payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        variants = self.read(self.pk)['variantes']
        self.assertEqual([v['sku'] for v in variants], ['QA-M', 'NEW-XL'])
        self.assertFalse(variants[0]['es_activa'])
        self.assertEqual(variants[0]['id_variante'], 'historical')
        self.assertEqual(self.api.delete(f'/api/catalog/productos/{self.pk}/eliminar/').status_code, 200)
        self.assertFalse(self.read(self.pk)['activo'])
        self.assertEqual(self.api.get(self.detail_url).status_code, 200)

    def test_authentication_owner_and_store_cannot_be_overridden(self):
        payload = self.edit_payload()
        for field in ('tienda_id', 'id_tienda'):
            response = self.api.put(self.update_url, {**payload, field: '999'}, format='json')
            self.assertEqual(response.status_code, 400)
        self.api.credentials()
        for url in ('/api/catalog/productos/admin/listado/', self.detail_url):
            self.assertEqual(self.api.get(url).status_code, 401)
        self.assertEqual(self.api.put(self.update_url, payload, format='json').status_code, 401)
        outsider = get_user_model().objects.create_user(username='edit-outsider')
        self.api.force_authenticate(user=outsider)
        self.assertEqual(self.api.get(self.detail_url).status_code, 403)
        self.assertEqual(self.api.put(self.update_url, payload, format='json').status_code, 403)

    def test_other_store_and_unknown_ids_return_404_without_creating(self):
        payload = self.edit_payload()
        for pk in (self.product('999'), str(ObjectId()), 'p-123'):
            self.assertEqual(self.api.get(f'/api/catalog/productos/{pk}/admin/').status_code, 404)
            self.assertEqual(self.api.put(f'/api/catalog/productos/{pk}/actualizar/', payload, format='json').status_code, 404)

    def test_stale_form_does_not_overwrite_updated_stock(self):
        payload = self.edit_payload()
        self.service.update_stock(str(self.store.pk), self.pk, 'QA-M', 2)
        payload['nombre'] = 'Stale'
        response = self.api.put(self.update_url, payload, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(self.read(self.pk)['variantes'][0]['stock'], 2)
        self.assertEqual(self.read(self.pk)['nombre'], 'Polera QA')

    def test_atomic_edit_rejects_stock_change_during_write(self):
        original = self.repo.get_admin_product(str(self.store.pk), self.pk)
        self.service.update_stock(str(self.store.pk), self.pk, 'QA-M', 1)
        self.assertIsNone(self.repo.update_catalog(str(self.store.pk), original, {'nombre': 'Stale'}))
        self.assertEqual(self.read(self.pk)['nombre'], 'Polera QA')

    def test_persistence_failure_returns_error_and_no_local_success(self):
        payload = self.edit_payload()
        with patch.object(ProductRepository, 'update_catalog', side_effect=AutoReconnect()):
            response = self.api.put(self.update_url, payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.data['exito'])
