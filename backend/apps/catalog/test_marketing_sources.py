"""Contrato de la fuente ya existente que consume Marketing. Mongo real temporal."""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.catalog.test_creation import CatalogAPITestCase

URL = '/api/catalog/productos/admin/listado/'


class MarketingSourceTests(CatalogAPITestCase):
    def test_returns_real_store_products_with_matching_variant_prices_and_images(self):
        pk = self.create()
        other_id = self.product('999')
        data = self.api.get(URL).json()['data']
        self.assertEqual([p['id'] for p in data], [pk])
        self.assertNotIn(other_id, [p['id'] for p in data])
        self.assertEqual(data[0]['imagenes'], self.payload['imagenes'])
        variants = {v['sku']: v for v in data[0]['variantes']}
        self.assertEqual((variants['QA-M']['precio'], variants['QA-M']['precio_oferta'], variants['QA-M']['stock']), (100, 80, 7))
        self.assertEqual(variants['QA-L']['stock'], 0)

    def test_preserves_inactive_variant_flags_for_marketing_validation(self):
        pk = self.create()
        product = self.read(pk)
        product['variantes'][0]['activo'] = False
        product['variantes'][1]['es_activa'] = False
        self.repo.update(str(self.store.pk), pk, {'variantes': product['variantes']})
        variants = self.api.get(URL).json()['data'][0]['variantes']
        self.assertIs(variants[0]['activo'], False)
        self.assertIs(variants[1]['es_activa'], False)

    def test_empty_images_and_inactive_product_are_reported_without_fake_fallback(self):
        pk = self.create()
        self.repo.update(str(self.store.pk), pk, {'imagenes': [], 'activo': False})
        item = self.api.get(URL).json()['data'][0]
        self.assertEqual(item['imagenes'], [])
        self.assertFalse(item['activo'])
        self.assertNotIn('campania', item)

    def test_owner_permission_and_tenant_spoofing_are_enforced_on_source(self):
        self.create()
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(self.api.get(URL, {'tienda_id': '999'}).status_code, 400)
        self.assertEqual(self.api.get(URL, HTTP_X_TIENDA_ID='999').status_code, 400)
        stranger = get_user_model().objects.create_user(username='marketing-stranger')
        self.api.force_authenticate(stranger)
        self.assertEqual(self.api.get(URL).status_code, 403)
        self.owner.is_active = False
        self.owner.save()
        self.api.force_authenticate(self.owner)
        self.assertEqual(self.api.get(URL).status_code, 403)

    def test_reading_marketing_source_does_not_change_catalog_or_orders(self):
        from apps.core.models import Pedido
        pk = self.create()
        before = self.read(pk)
        for _ in range(2):
            self.assertEqual(self.api.get(URL).status_code, 200)
        self.assertEqual(self.read(pk), before)
        self.assertEqual(Pedido.objects.count(), 0)
