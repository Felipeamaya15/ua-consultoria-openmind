from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.models import (
    ConfiguracionEntrega,
    ConfiguracionPago,
    ItemCarrito,
    Pedido,
    Producto,
    Promocion,
    Tienda,
)
from apps.core.payments import TRANSFER_PUBLIC_FIELDS


class EndToEndPurchaseFlowTests(TestCase):
    """Prueba End-to-End del recorrido principal de compra de extremo a extremo."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username='e2e-owner', email='owner@example.com')
        self.buyer = User.objects.create_user(username='e2e-buyer', email='comprador.e2e@example.com')
        self.store = Tienda.objects.create(nombre='Tienda E2E', id_usuario_propietario=self.owner)

        # 1. Configurar alternativas de entrega (Retiro y Chilexpress con tarifa para Santiago)
        ConfiguracionEntrega.objects.create(
            tienda=self.store,
            datos={
                'pickup': {
                    'enabled': True,
                    'address': 'Av. Vicuña Mackenna 4860, Macul',
                    'schedule': 'Lun–Vie 09:00 a 18:00',
                },
                'chilexpress': {
                    'enabled': True,
                    'tarifas': [
                        {'region': 'Metropolitana', 'comuna': 'Santiago', 'monto': 4500, 'plazo_dias': 2}
                    ],
                },
                'starken': {'enabled': False},
            },
        )

        # 2. Configurar modalidad de pago (Transferencia bancaria con los 6 campos obligatorios)
        ConfiguracionPago.objects.create(
            tienda=self.store,
            datos={
                'transfer': {
                    'enabled': True,
                    'fields': {field: f'valor-{field}' for field in TRANSFER_PUBLIC_FIELDS},
                }
            },
        )

        # 3. Configurar promoción activa (20% de descuento)
        self.promo = Promocion.objects.create(
            tienda=self.store,
            nombre='Descuento E2E 20%',
            codigo='E2E20',
            tipo='percentage',
            valor=20,
            fecha_inicio=timezone.now() - timedelta(days=1),
            activa=True,
        )

        # 4. Crear producto con variantes y stock independiente en colección Mongo aislada
        self.repo = ProductRepository()
        self.repo.collection = self.repo.db.get_collection('test_e2e_flow_' + uuid4().hex)
        self.addCleanup(self.repo.collection.drop)

        self.sql_product = Producto.objects.create(
            nombre='Polerón Universitario E2E', precio=15000, stock=10, id_tienda=self.store, activo=True
        )
        self.product_id = self.repo.create(
            str(self.store.pk),
            {
                'id_producto': self.sql_product.pk,
                'nombre': 'Polerón Universitario E2E',
                'slug': 'poleron-universitario-e2e',
                'categoria': 'Vestuario',
                'descripcion': 'Polerón oficial para prueba E2E',
                'activo': True,
                'imagenes': ['/media/landing/images/imagen_principal.jpg'],
                'variantes': [
                    {
                        'sku': 'POL-M',
                        'precio': 18000,
                        'precio_oferta': 15000,
                        'stock': 6,
                        'atributos_variante': [{'clave': 'talla', 'etiqueta': 'Talla', 'valor': 'M'}],
                    },
                    {
                        'sku': 'POL-L',
                        'precio': 20000,
                        'stock': 4,
                        'atributos_variante': [{'clave': 'talla', 'etiqueta': 'Talla', 'valor': 'L'}],
                    },
                ],
            },
        )

        for target in (
            'apps.catalog.presentation.views.ProductRepository',
            'apps.catalog.application.use_cases.ProductRepository',
            'apps.catalog.application.services.ProductRepository',
            'apps.core.presentation.checkout.ProductRepository',
        ):
            patcher = patch(target, return_value=self.repo)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.api = APIClient()
        self.token = Token.objects.create(user=self.buyer).key
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + self.token)

    def test_complete_buyer_journey_end_to_end(self):
        # ETAPA 1 y 2: Ingreso al catálogo público y consulta de detalle/variantes del producto
        catalog_res = self.api.get('/api/catalog/productos/')
        self.assertEqual(catalog_res.status_code, 200)
        self.assertTrue(catalog_res.data['exito'])
        self.assertEqual(len(catalog_res.data['data']), 1)

        detail_res = self.api.get(f'/api/catalog/productos/{self.product_id}/')
        self.assertEqual(detail_res.status_code, 200)
        variantes = detail_res.data['data']['variantes']
        self.assertEqual({v['sku'] for v in variantes}, {'POL-M', 'POL-L'})

        # ETAPA 3: Incorporación de variante seleccionada (POL-M) al carrito
        add_res = self.api.post(
            '/api/catalog/carrito/items/',
            {'slug': self.product_id, 'sku': 'POL-M', 'cantidad': 1},
            format='json',
        )
        self.assertEqual(add_res.status_code, 201, add_res.data)
        cart_item_id = add_res.data['data']['id_item_carrito']
        self.assertEqual(add_res.data['data']['precio_unitario'], '15000.00')

        # ETAPA 4: Modificación de cantidades en el carrito (de 1 a 2 unidades -> subtotal $30.000)
        patch_res = self.api.patch(
            f'/api/catalog/carrito/items/{cart_item_id}/',
            {'cantidad': 2},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200, patch_res.data)
        cart_get = self.api.get('/api/catalog/carrito/items/')
        self.assertEqual(cart_get.data['data'][0]['cantidad'], 2)
        self.assertEqual(cart_get.data['data'][0]['subtotal'], 30000)

        # ETAPA 7: Consulta de alternativas de entrega y cotización en tiempo real (Chilexpress -> $4.500)
        delivery_res = self.api.get('/api/entregas/alternativas/')
        self.assertEqual(delivery_res.status_code, 200)
        self.assertTrue(delivery_res.data['data']['chilexpress']['enabled'])

        quote_res = self.api.post(
            '/api/entregas/cotizacion/',
            {'operador': 'Chilexpress', 'region': 'Metropolitana', 'comuna': 'Santiago'},
            format='json',
        )
        self.assertEqual(quote_res.status_code, 200, quote_res.data)
        signed_quote = quote_res.data['data']['tarifas'][0]['cotizacion']
        shipping_cost = quote_res.data['data']['tarifas'][0]['monto']
        self.assertEqual(int(shipping_cost), 4500)

        # ETAPA 5: Aplicación y validación de código promocional (20% sobre $30.000 = $6.000 de descuento)
        promo_res = self.api.post(
            '/api/promociones/validar/',
            {'code': 'E2E20', 'subtotal': 30000, 'shipping': int(shipping_cost)},
            format='json',
        )
        self.assertEqual(promo_res.status_code, 200, promo_res.data)
        self.assertEqual(Decimal(promo_res.data['data']['discount']), Decimal('6000.00'))

        # ETAPA 8: Consulta de métodos de pago habilitados
        payments_res = self.api.get('/api/pagos/activos/')
        self.assertEqual(payments_res.status_code, 200)
        self.assertTrue(payments_res.data['data']['transfer']['enabled'])

        # ETAPA 6 y 9: Ingreso de datos del comprador y confirmación del pedido en Checkout
        checkout_payload = {
            'clave_checkout': str(uuid4()),
            'items': [{'producto_id': self.product_id, 'sku': 'POL-M', 'cantidad': 2}],
            'contacto': {
                'nombre': 'María González',
                'email': 'comprador.e2e@example.com',
                'telefono': '+56912345678',
            },
            'medio_pago': 'Transferencia',
            'metodo_entrega': 'Chilexpress',
            'direccion': {
                'street': 'Av. Libertador Bernardo O’Higgins',
                'number': '1058',
                'apt': 'Depto 301',
                'city': 'Santiago',
                'region': 'Metropolitana',
            },
            'cotizacion': signed_quote,
            'codigo_promocional': 'E2E20',
        }
        order_res = self.api.post('/api/checkout/pedidos/', checkout_payload, format='json')
        self.assertEqual(order_res.status_code, 201, order_res.data)

        created = order_res.data['data']
        self.assertEqual(created['estado'], 'pendiente')
        self.assertEqual(created['descuento'], '6000.00')
        self.assertEqual(created['costo_envio'], '4500.00')
        self.assertEqual(created['monto_total'], '28500.00')  # 30000 - 6000 + 4500
        self.assertRegex(created['identificador'], r'^ORD-\d{8}-[A-Z0-9]{4}$')

        # Limpieza del carrito tras confirmar (como ejecuta CartContext.clearCart)
        self.api.delete(f'/api/catalog/carrito/items/{cart_item_id}/')
        self.assertEqual(ItemCarrito.objects.count(), 0)

        # Verificar descuento de stock en MongoDB (POL-M pasa de 6 a 4; POL-L permanece en 4)
        updated_doc = self.repo.get_by_id(str(self.store.pk), self.product_id)
        stocks = {v['sku']: v['stock'] for v in updated_doc['variantes']}
        self.assertEqual(stocks, {'POL-M': 4, 'POL-L': 4})

        # ETAPA 10A: Consulta del pedido en el historial del comprador autenticado (/mis-pedidos)
        history_res = self.api.get('/api/mi-cuenta/pedidos/')
        self.assertEqual(history_res.status_code, 200)
        self.assertEqual(history_res.data['data'][0]['identificador'], created['identificador'])

        order_detail_res = self.api.get(f"/api/mi-cuenta/pedidos/{created['id_pedido']}/")
        self.assertEqual(order_detail_res.status_code, 200)
        self.assertEqual(order_detail_res.data['data']['items'][0]['sku'], 'POL-M')
        self.assertEqual(order_detail_res.data['data']['items'][0]['cantidad'], 2)

        # ETAPA 10B: Consulta pública del pedido en el portal de seguimiento (/seguimiento)
        self.api.credentials()  # Incluso sin sesión (como invitado)
        tracking_res = self.api.post(
            '/api/pedidos/seguimiento/',
            {'identificador': created['identificador'], 'email': 'comprador.e2e@example.com'},
            format='json',
        )
        self.assertEqual(tracking_res.status_code, 200, tracking_res.data)
        self.assertEqual(tracking_res.data['data']['identificador'], created['identificador'])
        self.assertEqual(tracking_res.data['data']['monto_total'], '28500.00')
        self.assertTrue(
            any(step['actual'] and step['estado'] == 'pendiente' for step in tracking_res.data['data']['linea_tiempo'])
        )