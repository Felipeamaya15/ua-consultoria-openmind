from unittest.mock import patch

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.request import Request

from apps.core.admin import ProductoAdmin, VarianteProductoAdmin, TiendaAdmin
from apps.core.infrastructure.tenant import (
    ConfiguracionTiendaInvalida, TiendaNoConfigurada, resolver_tienda, resolver_tienda_id,
)
from apps.core.models import Producto, Tienda, VarianteProducto


class ResolverTiendaTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='owner', is_staff=True)
        self.customer = get_user_model().objects.create_user(username='customer')
        self.shop = Tienda.objects.create(id_tienda=37, nombre='Tienda', id_usuario_propietario=self.owner)
        self.request = RequestFactory().get('/')
        self.request.user = AnonymousUser()
        self.api = APIClient()

    def test_resuelve_objeto_y_pk_decimal_exacta_para_publico(self):
        self.assertEqual(resolver_tienda(self.request), self.shop)
        self.assertEqual(resolver_tienda_id(self.request), '37')
        self.request.user = self.customer
        self.assertEqual(resolver_tienda(self.request), self.shop)

    def test_cero_tiendas_no_crea_una_y_produce_error_controlado(self):
        self.shop.delete()
        with self.assertRaises(TiendaNoConfigurada):
            resolver_tienda(self.request)
        response = self.api.get('/api/catalog/productos/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['error']['codigo'], 'TIENDA_NO_CONFIGURADA')
        self.assertFalse(Tienda.objects.exists())

    def test_varias_tiendas_no_elige_la_primera_ni_la_del_propietario(self):
        Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.customer)
        self.request.user = self.owner
        for privada in (False, True):
            with self.assertRaises(ConfiguracionTiendaInvalida):
                resolver_tienda(self.request, exigir_propietario=privada)
        response = self.api.get('/api/catalog/productos/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['error']['codigo'], 'CONFIGURACION_TIENDA_INVALIDA')
        self.assertEqual(Tienda.objects.count(), 2)

    def test_propietario_activo_puede_resolver_operacion_privada(self):
        self.request.user = self.owner
        self.assertEqual(resolver_tienda(self.request, exigir_propietario=True), self.shop)

    def test_operacion_privada_rechaza_anonimo_no_propietario_e_inactivo(self):
        with self.assertRaises(NotAuthenticated):
            resolver_tienda(self.request, exigir_propietario=True)
        for usuario in (self.customer, self.owner):
            if usuario == self.owner:
                usuario.is_active = False
                usuario.save(update_fields=['is_active'])
            self.request.user = usuario
            with self.assertRaises(PermissionDenied):
                resolver_tienda(self.request, exigir_propietario=True)

    def test_rechaza_id_ajeno_en_query_cuerpo_cabecera_y_parametro_repetido(self):
        factory = APIRequestFactory()
        requests = (
            factory.get('/?tienda_id=99'),
            factory.get('/?id_tienda=99'),
            factory.get('/?tienda_id=99&tienda_id=37'),
            factory.get('/', HTTP_X_TIENDA_ID='99'),
            factory.get('/', HTTP_TIENDA_ID='99'),
        )
        for request in requests:
            with self.assertRaises(ValidationError):
                resolver_tienda(request)
        from rest_framework.parsers import JSONParser
        for field in ('tienda_id', 'id_tienda'):
            request = Request(factory.post('/', {field: '99'}, format='json'), parsers=[JSONParser()])
            with self.assertRaises(ValidationError):
                resolver_tienda(request)
        self.assertEqual(Tienda.objects.get(), self.shop)

    def test_admite_id_coincidente_sin_usarlo_como_selector(self):
        request = RequestFactory().get('/?tienda_id=37', HTTP_X_TIENDA_ID='37')
        self.assertEqual(resolver_tienda(request), self.shop)

    def test_alias_catalog_delega_en_la_misma_implementacion(self):
        from apps.catalog.application.infrastructure.tenant import resolver_tienda_id as alias
        self.assertIs(alias, resolver_tienda_id)

    def test_catalogo_publico_anonimo_y_comprador_reciben_id_resuelto(self):
        with patch('apps.catalog.presentation.views.ProductRepository') as repository:
            repository.return_value.list_by_store.return_value = []
            for usuario in (None, self.customer):
                self.api.force_authenticate(user=usuario)
                response = self.api.get('/api/catalog/productos/')
                self.assertEqual(response.status_code, 200)
                repository.return_value.list_by_store.assert_called_with('37', activo=True)

    def test_catalogo_rechaza_manipulacion_antes_de_consultar_mongo(self):
        with patch('apps.catalog.presentation.views.ProductRepository') as repository:
            response = self.api.get('/api/catalog/productos/?tienda_id=99')
            self.assertEqual(response.status_code, 400)
            repository.assert_not_called()

    def test_detalle_y_atributos_publicos_pasan_id_resuelto(self):
        with patch('apps.catalog.presentation.views.ProductRepository') as repository:
            repository.return_value.get_by_slug.return_value = None
            for ruta in ('/api/catalog/productos/item/', '/api/catalog/productos/item/atributos/'):
                self.assertEqual(self.api.get(ruta).status_code, 404)
                repository.return_value.get_by_slug.assert_called_with('37', 'item')

    def test_admin_conserva_acceso_propietario_y_rechaza_otra_cuenta(self):
        producto = Producto.objects.create(nombre='P', precio=1, id_tienda=self.shop)
        variante = VarianteProducto.objects.create(id_producto=producto, sku='SKU', precio=1)
        self.request.user = self.owner
        for model, admin_class, obj in (
            (Producto, ProductoAdmin, producto), (VarianteProducto, VarianteProductoAdmin, variante),
        ):
            admin = admin_class(model, AdminSite())
            self.assertEqual(list(admin.get_queryset(self.request)), [obj])
            self.request.user = self.customer
            with self.assertRaises(DjangoPermissionDenied):
                admin.get_queryset(self.request)
            self.request.user = self.owner

    def test_admin_filtra_opciones_y_registros_por_tienda(self):
        otra = Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.customer)
        propio = Producto.objects.create(nombre='Propio', precio=1, id_tienda=self.shop)
        ajeno = Producto.objects.create(nombre='Ajeno', precio=1, id_tienda=otra)
        VarianteProducto.objects.create(id_producto=ajeno, sku='AJENO', precio=1)
        self.request.user = self.owner
        # Aísla los filtros del Admin de la regla global que rechaza varias tiendas.
        with patch('apps.core.admin.resolver_tienda', return_value=self.shop):
            admin = ProductoAdmin(Producto, AdminSite())
            self.assertEqual(list(admin.get_queryset(self.request)), [propio])
            field = admin.formfield_for_foreignkey(Producto._meta.get_field('id_tienda'), self.request)
            self.assertEqual(list(field.queryset), [self.shop])
            admin = VarianteProductoAdmin(VarianteProducto, AdminSite())
            self.assertFalse(admin.get_queryset(self.request).exists())
            field = admin.formfield_for_foreignkey(VarianteProducto._meta.get_field('id_producto'), self.request)
            self.assertEqual(list(field.queryset), [propio])

    def test_admin_configuracion_inicial_sigue_disponible_sin_tienda(self):
        self.shop.delete()
        self.owner.is_superuser = True
        self.owner.save(update_fields=['is_superuser'])
        self.request.user = self.owner
        self.assertTrue(TiendaAdmin(Tienda, AdminSite()).has_add_permission(self.request))
