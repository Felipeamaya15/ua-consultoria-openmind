from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import ItemCarrito, Producto, Tienda

URL = '/api/catalog/carrito/items/'


class FakeVariantService:
    """Reemplaza a VariantService para no depender de MongoDB en estos tests."""
    VARIANTES = {
        'QA-M': {'sku': 'QA-M', 'stock': 5},
        'QA-L': {'sku': 'QA-L', 'stock': 2},
    }

    def get_variant_by_sku(self, product_id, sku):
        try:
            return self.VARIANTES[str(sku).strip().upper()]
        except KeyError:
            raise ValueError(f"No se encontró la variante '{sku}'.")


class FakeProductRepository:

    def __init__(self, documentos):
        self.documentos = documentos

    def get_by_slug(self, tienda_id, slug):
        return self.documentos.get(slug)

    def get_by_id(self, tienda_id, product_id):
        for slug, documento in self.documentos.items():
            if str(documento.get('id_producto')) == str(product_id):
                return {**documento, 'slug': slug}
        return None

class CarritoVariantesTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.user = users.objects.create_user(username='cart-user', email='cart@example.com')
        owner = users.objects.create_user(username='cart-owner')
        store = Tienda.objects.create(nombre='Tienda carrito', id_usuario_propietario=owner)
        self.product = Producto.objects.create(nombre='Polera', precio=10000, stock=10, id_tienda=store)
        patcher = patch('apps.catalog.application.use_cases.VariantService', FakeVariantService)
        patcher.start()
        self.addCleanup(patcher.stop)
        documentos = {'polera': {'id_producto': self.product.pk}, 'sin-vinculo': {'nombre': 'Sin id SQL'}}
        repo_patcher = patch('apps.catalog.application.use_cases.ProductRepository', lambda: FakeProductRepository(documentos))
        repo_patcher.start()
        self.addCleanup(repo_patcher.stop)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def add(self, **extra):
        data = {'id_producto': self.product.pk, 'cantidad': 1}
        data.update(extra)
        return self.api.post(URL, data, format='json')

    def add_by_slug(self, slug='polera', **extra):
        data = {'slug': slug, 'cantidad': 1}
        data.update(extra)
        return self.api.post(URL, data, format='json')

    def test_add_by_slug_resolves_product_and_variant(self):
        response = self.add_by_slug(sku='qa-m')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['data']['id_producto'], self.product.pk)
        item = ItemCarrito.objects.get()
        self.assertEqual((item.id_producto_id, item.sku), (self.product.pk, 'QA-M'))

    def test_add_by_slug_same_product_accumulates_with_id(self):
        self.add_by_slug()
        self.add()
        self.assertEqual(ItemCarrito.objects.get().cantidad, 2)

    def test_add_by_slug_unknown_or_unlinked_product_is_404(self):
        self.assertEqual(self.add_by_slug(slug='no-existe').status_code, 404)
        self.assertEqual(self.add_by_slug(slug='sin-vinculo').status_code, 404)
        self.assertEqual(ItemCarrito.objects.count(), 0)

    def test_add_requires_id_or_slug(self):
        response = self.api.post(URL, {'cantidad': 1}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('id_producto', response.data['error']['detalles'])

    def test_add_variant_stores_sku_and_each_variant_is_a_separate_item(self):
        self.assertEqual(self.add(sku='qa-m').status_code, 201)
        self.assertEqual(self.add(sku='QA-L').status_code, 201)
        self.assertEqual(self.add().status_code, 201)  # producto base
        self.assertEqual(ItemCarrito.objects.count(), 3)
        self.assertEqual(set(ItemCarrito.objects.values_list('sku', flat=True)), {'QA-M', 'QA-L', None})

    def test_adding_same_variant_accumulates_quantity(self):
        self.add(sku='QA-M', cantidad=2)
        response = self.add(sku='QA-M', cantidad=2)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ItemCarrito.objects.get(sku='QA-M').cantidad, 4)

    def test_add_rejects_quantity_above_variant_stock(self):
        self.add(sku='QA-L', cantidad=2)
        response = self.add(sku='QA-L', cantidad=1)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error']['codigo'], 'STOCK_INSUFICIENTE')

    def test_add_rejects_unknown_variant_and_invalid_quantity(self):
        self.assertEqual(self.add(sku='NO-EXISTE').status_code, 404)
        self.assertEqual(self.add(cantidad=0).status_code, 400)

    def test_get_returns_sku_and_variant_stock(self):
        response = self.api.get(URL)
        self.assertEqual(response.status_code, 200)
        item = response.data['data'][0]
        self.assertEqual(item['sku'], 'QA-L')
        self.assertEqual(item['slug'], 'polera')
        self.assertEqual(item['stock_disponible'], 2)
        self.assertEqual(item['subtotal'], 20000)

    def test_get_empty_cart_and_requires_authentication(self):
        self.assertEqual(self.api.get(URL).data['data'], [])
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get(URL).status_code, 401)
