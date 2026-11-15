from decimal import Decimal
from zoneinfo import ZoneInfo

from bson import ObjectId
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

from apps.catalog.test_creation import CatalogAPITestCase
from apps.core.infrastructure.commercial import paid_summary, product_totals, serialize_order
from apps.core.infrastructure.reports import consultar_informe
from apps.core.models import Carrito, ItemCarrito, ItemPedido, Pedido, Producto, Usuario
from apps.landing.models import ConfiguracionLanding


class ProductPermanentDeleteTests(CatalogAPITestCase):
    def setUp(self):
        super().setUp()
        self.pk = self.create()
        self.delete_url = f'/api/catalog/productos/{self.pk}/eliminar-definitivo/'

    def test_requires_exact_word_eliminar(self):
        for bad in (None, '', 'borrar', 'si', 'elimina'):
            response = self.api.delete(
                self.delete_url,
                {'confirmacion': bad} if bad is not None else {},
                format='json',
            )
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIsNotNone(self.read(self.pk))

    def test_auth_and_tenant_isolation(self):
        other_id = self.product('999')
        self.assertEqual(
            self.api.delete(
                f'/api/catalog/productos/{other_id}/eliminar-definitivo/',
                {'confirmacion': 'eliminar'},
                format='json',
            ).status_code,
            404,
        )
        self.assertIsNotNone(self.read(other_id))

        outsider = get_user_model().objects.create_user(username='perm-delete-outsider')
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=outsider).key)
        self.assertEqual(
            self.api.delete(self.delete_url, {'confirmacion': 'eliminar'}, format='json').status_code,
            403,
        )
        self.assertIsNotNone(self.read(self.pk))

        self.api.credentials()
        self.assertEqual(
            self.api.delete(self.delete_url, {'confirmacion': 'eliminar'}, format='json').status_code,
            401,
        )
        self.assertIsNotNone(self.read(self.pk))

    def test_permanent_delete_removes_catalog_product_and_preserves_sales_and_orders(self):
        sql_product = Producto.objects.create(
            nombre='Polera QA',
            precio=Decimal('80.00'),
            stock=7,
            activo=True,
            id_tienda=self.store,
        )
        self.repo.update(str(self.store.pk), self.pk, {'id_producto': sql_product.pk})

        buyer = Usuario.objects.create(
            correo='comprador-ventas@example.com',
            password_hash='x',
            nombre='Ana',
            apellido='Pérez',
            rol='cliente',
        )
        carrito = Carrito.objects.create(id_usuario=buyer)
        ItemCarrito.objects.create(
            id_carrito=carrito,
            id_producto=sql_product,
            cantidad=1,
            sku='QA-M',
        )

        ConfiguracionLanding.objects.create(
            tienda=self.store,
            titulo='Tienda QA',
            descripcion='',
            texto_boton='Ver',
            contenido={'productos_destacados': [self.pk], 'categorias': ['Ropa']},
        )

        pedido = Pedido.objects.create(
            tienda=self.store,
            id_usuario=buyer,
            nombre_contacto='Ana Pérez',
            correo_contacto='comprador-ventas@example.com',
            monto_total=Decimal('240.00'),
            estado='pagado',
            medio_pago='Transferencia',
        )
        item = ItemPedido.objects.create(
            id_pedido=pedido,
            id_producto=sql_product,
            producto_mongo_id=self.pk,
            nombre_producto='Polera QA',
            sku='QA-M',
            cantidad=3,
            precio_unitario=Decimal('80.00'),
        )

        response = self.api.delete(
            self.delete_url,
            {'confirmacion': '  Eliminar '},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        # Producto eliminado definitivamente de MongoDB, SQL Producto, Carrito y destacados
        self.assertIsNone(self.read(self.pk))
        self.assertFalse(Producto.objects.filter(pk=sql_product.pk).exists())
        self.assertFalse(ItemCarrito.objects.filter(id_carrito=carrito).exists())
        landing = ConfiguracionLanding.objects.get(tienda=self.store)
        self.assertEqual(landing.contenido['productos_destacados'], [])

        # Listado admin y catálogo público ya no contienen el producto
        admin_list = self.api.get('/api/catalog/productos/admin/listado/')
        self.assertEqual(admin_list.status_code, 200)
        self.assertEqual(admin_list.data['data'], [])

        # Pedidos, ítems históricos y reportes de ventas se conservan 100% intactos
        self.assertTrue(Pedido.objects.filter(pk=pedido.pk).exists())
        saved_item = ItemPedido.objects.get(pk=item.pk)
        self.assertIsNone(saved_item.id_producto_id)
        self.assertEqual(saved_item.nombre_producto, 'Polera QA')
        self.assertEqual(saved_item.sku, 'QA-M')
        self.assertEqual(saved_item.cantidad, 3)

        orders_qs = Pedido.objects.filter(tienda=self.store)
        summary = paid_summary(orders_qs)
        self.assertEqual(summary['pedidos_confirmados'], 1)
        self.assertEqual(summary['importe_confirmado'], '240.00')

        totals = list(product_totals(orders_qs))
        self.assertEqual(len(totals), 1)
        self.assertEqual(totals[0]['nombre_producto'], 'Polera QA')
        self.assertEqual(totals[0]['unidades'], 3)
        self.assertEqual(totals[0]['bruto_lineas'], Decimal('240.00'))

        serialized = serialize_order(Pedido.objects.prefetch_related('itempedido_set').get(pk=pedido.pk))
        self.assertEqual(len(serialized['items']), 1)
        self.assertEqual(serialized['items'][0]['nombre_producto'], 'Polera QA')

        report = consultar_informe(
            self.store,
            pedido.fecha_creacion.year,
            None,
            ZoneInfo('America/Santiago'),
        )
        self.assertEqual(report['total_ventas'], '240.00')
        self.assertEqual(report['pedidos_pagados'], 1)

    def test_unknown_product_returns_404(self):
        response = self.api.delete(
            f'/api/catalog/productos/{ObjectId()}/eliminar-definitivo/',
            {'confirmacion': 'eliminar'},
            format='json',
        )
        self.assertEqual(response.status_code, 404, response.data)
