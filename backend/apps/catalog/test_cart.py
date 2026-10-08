from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import ItemCarrito, Producto, Tienda

URL = '/api/catalog/carrito/items/'


class FakeVariantService:
    """Reemplaza a VariantService para no depender de MongoDB en estos tests."""
    VARIANTES = {
        'QA-M': {'sku': 'QA-M', 'stock': 5, 'precio': 12000, 'precio_oferta': 9000,
                 'atributos_variante': [{'clave': 'talla', 'valor': 'M'}]},
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

    def update(self, tienda_id, product_id, datos):
        for documento in self.documentos.values():
            if str(documento.get('_id')) == str(product_id):
                documento.update(datos)
                return True
        return False

    def get_by_slug(self, tienda_id, slug):
        return self.documentos.get(slug)

    def get_by_id(self, tienda_id, product_id):
        for slug, documento in self.documentos.items():
            if str(documento.get('id_producto')) == str(product_id) or str(documento.get('_id')) == str(product_id):
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
        documentos = {
            'polera': {'_id': 'mongo-1', 'slug': 'polera', 'id_producto': self.product.pk, 'imagenes': ['/media/qa.png']},
            'sin-variantes': {'_id': 'mongo-2', 'slug': 'sin-variantes', 'nombre': 'Sin variantes'},
            'solo-mongo': {
                '_id': 'mongo-3', 'slug': 'solo-mongo', 'nombre': 'Solo Mongo',
                'variantes': [{'sku': 'SM-1', 'precio': 8000, 'stock': 3}, {'sku': 'SM-2', 'precio': 9500, 'stock': 2}],
            },
        }
        self.documentos = documentos
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
        self.assertEqual(self.add_by_slug(slug='sin-variantes').status_code, 404)
        self.assertEqual(ItemCarrito.objects.count(), 0)

    def test_add_by_slug_links_catalog_only_product_once(self):
        response = self.add_by_slug(slug='solo-mongo')
        self.assertEqual(response.status_code, 201)
        producto = Producto.objects.get(nombre='Solo Mongo')
        self.assertEqual((producto.precio, producto.stock), (8000, 5))  # precio mínimo y stock total
        self.assertEqual(self.documentos['solo-mongo']['id_producto'], producto.pk)
        self.add_by_slug(slug='solo-mongo')  # ya vinculado: no crea otra fila
        self.assertEqual(Producto.objects.filter(nombre='Solo Mongo').count(), 1)
        self.assertEqual(ItemCarrito.objects.get().cantidad, 2)

    def test_variant_price_is_used_instead_of_base_price(self):
        # La variante QA-M está en oferta (9000 < 12000); el producto base cuesta 10000.
        added = self.add(sku='QA-M', cantidad=3)
        self.assertEqual(added.data['data']['precio_unitario'], '9000.00')
        item = self.api.get(URL).data['data'][0]
        self.assertEqual((item['precio_unitario'], item['subtotal']), ('9000.00', 27000))
        item_id = ItemCarrito.objects.get().pk
        patched = self.api.patch(f'{URL}{item_id}/', {'cantidad': 4}, format='json')
        self.assertEqual(patched.data['data']['precio_unitario'], '9000.00')

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
        self.add(sku='QA-L', cantidad=2)
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
    def test_patch_validates_against_variant_stock(self):
        self.add(sku='QA-L')
        item = ItemCarrito.objects.get(sku='QA-L')
        ok = self.api.patch(f'{URL}{item.pk}/', {'cantidad': 2}, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data['data']['stock_disponible'], 2)
        too_much = self.api.patch(f'{URL}{item.pk}/', {'cantidad': 3}, format='json')
        self.assertEqual(too_much.status_code, 400)
        item.refresh_from_db()
        self.assertEqual(item.cantidad, 2)
    def test_delete_removes_only_the_selected_variant(self):
        self.add(sku='QA-M')
        self.add(sku='QA-L')
        item = ItemCarrito.objects.get(sku='QA-M')
        response = self.api.delete(f'{URL}{item.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(ItemCarrito.objects.values_list('sku', flat=True)), ['QA-L'])

    def test_delete_base_product_keeps_its_variants(self):
        self.add()
        self.add(sku='QA-M')
        base = ItemCarrito.objects.get(sku__isnull=True)
        self.assertEqual(self.api.delete(f'{URL}{base.pk}/').status_code, 200)
        self.assertEqual(ItemCarrito.objects.get().sku, 'QA-M')

    def test_delete_rejects_item_of_another_user(self):
        other = get_user_model().objects.create_user(username='other-buyer', email='other@example.com')
        other_api = APIClient()
        other_api.force_authenticate(other)
        other_api.post(URL, {'id_producto': self.product.pk, 'cantidad': 1}, format='json')
        item = ItemCarrito.objects.get()
        response = self.api.delete(f'{URL}{item.pk}/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['error']['codigo'], 'RECURSO_NO_ENCONTRADO')
        self.assertTrue(ItemCarrito.objects.filter(pk=item.pk).exists())

    def test_delete_unknown_item_and_requires_authentication(self):
        self.assertEqual(self.api.delete(f'{URL}99999/').status_code, 404)
        self.api.force_authenticate(None)
        self.assertEqual(self.api.delete(f'{URL}1/').status_code, 401)

    def test_catalog_object_id_persists_and_round_trips_in_cart(self):
        response = self.add_by_slug(slug='mongo-1', sku='QA-M')
        self.assertEqual(response.status_code, 201, response.data)
        saved = self.api.get(URL).data['data'][0]
        self.assertEqual((saved['producto_mongo_id'], saved['slug'], saved['sku']), ('mongo-1', 'polera', 'QA-M'))
        self.assertEqual((saved['precio_unitario'], saved['stock_disponible']), ('9000.00', 5))
        self.assertEqual(saved['atributos'], {'talla': 'M'})
        self.assertEqual(saved['imagen'], '/media/qa.png')
        self.assertEqual(ItemCarrito.objects.count(), 1)

    def test_every_cart_verb_rejects_foreign_tenant_selector(self):
        self.add()
        item = ItemCarrito.objects.get()
        before = item.cantidad
        calls = (
            lambda: self.api.get(URL, HTTP_X_TIENDA_ID='999'),
            lambda: self.api.post(URL, {'id_producto': self.product.pk, 'tienda_id': 999}, format='json'),
            lambda: self.api.patch(f'{URL}{item.pk}/', {'cantidad': 2}, format='json', HTTP_X_TIENDA_ID='999'),
            lambda: self.api.delete(f'{URL}{item.pk}/?tienda_id=999'),
        )
        for call in calls:
            self.assertEqual(call().status_code, 400)
        item.refresh_from_db()
        self.assertEqual(item.cantidad, before)

    def test_numeric_product_id_cannot_bypass_use_case_store_scope(self):
        from apps.catalog.application.use_cases import AgregarItemCarritoDTO, AgregarItemCarritoUseCase
        from apps.catalog.domain.exceptions import ProductoNoEncontradoException
        with self.assertRaises(ProductoNoEncontradoException):
            AgregarItemCarritoUseCase().execute(AgregarItemCarritoDTO(
                usuario_id=self.user.pk, id_producto=self.product.pk, tienda_id='999'))
        self.assertFalse(ItemCarrito.objects.exists())
