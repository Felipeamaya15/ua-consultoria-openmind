from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import ItemPedido, Pedido, Producto, Tienda, Usuario, VarianteProducto


class TiendaSQLHTTPTests(TestCase):
    def setUp(self):
        self.propietario = get_user_model().objects.create_user(username='propietario-sql')
        self.comprador_autenticado = get_user_model().objects.create_user(username='comprador-sql')
        self.comprador = Usuario.objects.create(
            correo='comprador-sql@example.test', password_hash='test', nombre='Comprador',
            apellido='SQL', rol='cliente',
        )
        self.tienda = Tienda.objects.create(
            id_tienda=41, nombre='Instalación SQL', id_usuario_propietario=self.propietario,
        )
        self.producto = Producto.objects.create(
            id_tienda=self.tienda, nombre='Producto local', precio=10, stock=5,
        )
        self.variante = VarianteProducto.objects.create(
            id_producto=self.producto, sku='LOCAL', precio=10, stock=5,
        )
        self.lista_url = f'/api/productos/{self.producto.pk}/variantes/'
        self.detalle_url = f'{self.lista_url}{self.variante.pk}/'
        self.api = APIClient()

    def crear_datos_ajenos(self):
        otra_tienda = Tienda.objects.create(
            nombre='Datos ajenos', id_usuario_propietario=self.comprador_autenticado,
        )
        otro_producto = Producto.objects.create(
            id_tienda=otra_tienda, nombre='Otro producto', precio=20, stock=8,
        )
        otra_variante = VarianteProducto.objects.create(
            id_producto=otro_producto, sku='AJENA', precio=20, stock=8,
        )
        return otro_producto, otra_variante

    def compra(self, items):
        return self.api.post('/api/compras/', {
            'id_usuario': self.comprador.pk, 'items': items,
        }, format='json')

    def assert_sin_compra(self):
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 5)
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ItemPedido.objects.exists())

    def test_lecturas_publicas_admiten_anonimo_y_comprador_autenticado(self):
        for usuario in (None, self.comprador_autenticado):
            self.api.force_authenticate(user=usuario)
            for url in (self.lista_url, self.detalle_url):
                with self.subTest(usuario=usuario, url=url):
                    response = self.api.get(url)
                    self.assertEqual(response.status_code, 200, response.data)

    def test_propietario_puede_crear_y_actualizar_variante(self):
        self.api.force_authenticate(user=self.propietario)
        response = self.api.post(self.lista_url, {
            'sku': 'NUEVA', 'precio': 15, 'stock': 2,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        creada = VarianteProducto.objects.get(sku='NUEVA')
        self.assertEqual(creada.id_producto.id_tienda, self.tienda)
        response = self.api.patch(self.detalle_url, {'stock': 4}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 4)

    def test_escritura_reconoce_la_sesion_django_del_propietario(self):
        self.api.force_login(self.propietario)
        response = self.api.patch(self.detalle_url, {'stock': 4}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 4)

    def test_escrituras_rechazan_anonimo_no_propietario_y_propietario_inactivo(self):
        self.propietario.is_active = False
        self.propietario.save(update_fields=['is_active'])
        for usuario in (None, self.comprador_autenticado, self.propietario):
            self.api.force_authenticate(user=usuario)
            with self.subTest(usuario=usuario):
                response = self.api.post(self.lista_url, {
                    'sku': 'NO-AUTORIZADA', 'precio': 15, 'stock': 2,
                }, format='json')
                self.assertIn(response.status_code, (401, 403), response.data)
                response = self.api.patch(self.detalle_url, {'stock': 1}, format='json')
                self.assertIn(response.status_code, (401, 403), response.data)
        self.assertEqual(VarianteProducto.objects.count(), 1)
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 5)

    def test_identificador_cliente_no_selecciona_tienda_en_lectura_o_escritura(self):
        self.api.force_authenticate(user=self.propietario)
        response = self.api.get(self.lista_url, {'tienda_id': 'otra'})
        self.assertEqual(response.status_code, 400, response.data)
        response = self.api.patch(self.detalle_url, {
            'tienda_id': 'otra', 'stock': 1,
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 5)

    def test_instalacion_ambigua_bloquea_variantes_y_compra(self):
        self.crear_datos_ajenos()
        response = self.api.get(self.lista_url)
        self.assertEqual(response.status_code, 503, response.data)
        response = self.compra([{'id_variante': self.variante.pk, 'cantidad': 1}])
        self.assertEqual(response.status_code, 503, response.data)
        self.assert_sin_compra()

    def test_filtro_http_no_expone_producto_o_variante_ajenos(self):
        otro_producto, otra_variante = self.crear_datos_ajenos()
        # Aísla la pertenencia del producto, además del bloqueo de instalaciones ambiguas.
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.tienda):
            urls = (
                f'/api/productos/{otro_producto.pk}/variantes/',
                f'/api/productos/{otro_producto.pk}/variantes/{otra_variante.pk}/',
                f'{self.lista_url}{otra_variante.pk}/',
            )
            for url in urls:
                with self.subTest(url=url):
                    response = self.api.get(url)
                    self.assertEqual(response.status_code, 404, response.data)

    def test_filtro_http_impide_crear_o_actualizar_en_producto_ajeno(self):
        otro_producto, otra_variante = self.crear_datos_ajenos()
        self.api.force_authenticate(user=self.propietario)
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.tienda):
            response = self.api.post(f'/api/productos/{otro_producto.pk}/variantes/', {
                'sku': 'INTRUSA', 'precio': 10, 'stock': 1,
            }, format='json')
            self.assertEqual(response.status_code, 404, response.data)
            response = self.api.patch(
                f'/api/productos/{otro_producto.pk}/variantes/{otra_variante.pk}/',
                {'stock': 1}, format='json',
            )
            self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(VarianteProducto.objects.count(), 2)
        otra_variante.refresh_from_db()
        self.assertEqual(otra_variante.stock, 8)

    def test_compra_publica_de_variante_local_funciona(self):
        response = self.compra([{'id_variante': self.variante.pk, 'cantidad': 2}])
        self.assertEqual(response.status_code, 201, response.data)
        self.variante.refresh_from_db()
        self.assertEqual(self.variante.stock, 3)
        self.assertEqual(ItemPedido.objects.get().id_producto.id_tienda, self.tienda)

    def test_compra_rechaza_variante_ajena_en_validacion_sin_modificaciones(self):
        _, otra_variante = self.crear_datos_ajenos()
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.tienda):
            response = self.compra([
                {'id_variante': self.variante.pk, 'cantidad': 1},
                {'id_variante': otra_variante.pk, 'cantidad': 1},
            ])
        self.assertEqual(response.status_code, 400, response.data)
        self.assert_sin_compra()
        otra_variante.refresh_from_db()
        self.assertEqual(otra_variante.stock, 8)

    def test_descuento_revalida_pertenencia_y_revierte_compra_si_cambia_tras_validacion(self):
        _, otra_variante = self.crear_datos_ajenos()
        items = [
            {'id_variante': self.variante.pk, 'cantidad': 1},
            {'id_variante': otra_variante.pk, 'cantidad': 1},
        ]
        # Simula que una variante dejó de pertenecer a la tienda tras validar la entrada.
        with patch('apps.core.presentation.views.resolver_tienda', return_value=self.tienda), patch(
            'apps.core.presentation.serializers.RegistrarCompraSerializer.validate_items',
            return_value=items,
        ):
            response = self.compra(items)
        self.assertEqual(response.status_code, 400, response.data)
        self.assert_sin_compra()
        otra_variante.refresh_from_db()
        self.assertEqual(otra_variante.stock, 8)
