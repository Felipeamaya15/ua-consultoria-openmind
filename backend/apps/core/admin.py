from django.contrib import admin
from django.utils.text import slugify
from apps.catalog.infrastructure.repositories import ProductRepository
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from apps.core.models import Usuario, Tienda, Producto
from apps.core.services import configurar_tienda
from apps.core.infrastructure.tenant import resolver_tienda
from rest_framework.exceptions import APIException
from .models import Pedido

@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    list_display = ('id_usuario', 'correo', 'nombre', 'apellido', 'rol')
    search_fields = ('correo', 'nombre', 'apellido')


@admin.register(Tienda)
class TiendaAdmin(admin.ModelAdmin):
    list_display = ('id_tienda', 'nombre', 'id_usuario_propietario', 'fecha_creacion')
    search_fields = ('nombre',)

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        if request.user.is_active and request.user.is_superuser:
            return queryset
        return queryset.del_propietario(request.user)

    def has_add_permission(self, request):
        return (
            request.user.is_superuser
            and super().has_add_permission(request)
            and not Tienda.objects.exists()
        )

    def save_model(self, request, obj, form, change):
        if change:
            return super().save_model(request, obj, form, change)
        tienda, creada = configurar_tienda(
            obj.id_usuario_propietario, nombre=obj.nombre, descripcion=obj.descripcion,
        )
        if not creada:
            raise PermissionDenied('Esta instalación ya tiene una tienda configurada.')
        obj.pk = tienda.pk
        obj.fecha_creacion = tienda.fecha_creacion
        obj._state = tienda._state

    def get_readonly_fields(self, request, obj=None):
        return ('id_usuario_propietario',) if obj else ()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'id_usuario_propietario':
            kwargs['queryset'] = get_user_model().objects.filter(is_active=True)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

class TiendaAdministradaMixin:
    def tienda_administrada(self, request):
        try:
            return resolver_tienda(request, exigir_propietario=True)
        except APIException as error:
            raise PermissionDenied(str(error.detail)) from error

    def get_queryset(self, request):
        tienda = self.tienda_administrada(request)
        return super().get_queryset(request).filter(**{self.filtro_tienda: tienda})

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name in ('id_tienda', 'id_producto'):
            tienda = self.tienda_administrada(request)
            kwargs['queryset'] = (
                Tienda.objects.filter(pk=tienda.pk) if db_field.name == 'id_tienda'
                else Producto.objects.filter(id_tienda=tienda)
            )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Producto)
class ProductoAdmin(TiendaAdministradaMixin, admin.ModelAdmin):
    filtro_tienda = 'id_tienda'
    list_display = ('id_producto', 'nombre', 'precio', 'stock', 'id_tienda')
    search_fields = ('nombre',)
    list_filter = ('id_tienda',)

    def save_model(self, request, obj, form, change):
        if obj.id_tienda_id != self.tienda_administrada(request).pk:
            raise PermissionDenied('El producto no pertenece a la tienda administrada.')
        super().save_model(request, obj, form, change)
        if not change:
            repo = ProductRepository()
            mongo_id = repo.create(str(obj.id_tienda_id), {
                "id_producto": obj.id_producto,
                "nombre": obj.nombre,
                "tienda_id": str(obj.id_tienda_id),
                "slug": slugify(obj.nombre),
                "precio": float(obj.precio) if obj.precio else 0.0,
                "stock": int(obj.stock) if obj.stock is not None else 0,
                "activo": True,
                "variantes": []
            })
            self.message_user(
                request, 
                f"✅ Producto guardado en PostgreSQL y sincronizado en MongoDB con ID: {mongo_id}"
            )
        else:
            from apps.core.infrastructure.mongo_client import get_mongo_db
            db = get_mongo_db()
            
            filtro = {
                "tienda_id": str(obj.id_tienda_id),
                "$or": [
                    {"id_producto": obj.id_producto},
                    {"id_postgresql": obj.id_producto}
                ]
            }
            producto_mongo = db.productos.find_one(filtro)
            if producto_mongo:
                producto_mongo['nombre'] = obj.nombre
                producto_mongo['precio'] = float(obj.precio) if obj.precio else 0.0
                producto_mongo['stock'] = int(obj.stock) if obj.stock is not None else 0
                producto_mongo['activo'] = obj.activo
                if producto_mongo.get('variantes') and len(producto_mongo['variantes']) > 0:
                    for variante in producto_mongo['variantes']:
                        variante['stock'] = producto_mongo['stock']
                        variante['precio'] = producto_mongo['precio']
                db.productos.replace_one({'_id': producto_mongo['_id']}, producto_mongo)
                self.message_user(
                    request, 
                    f"🔄 Stock ({obj.stock}) y datos del producto sincronizados correctamente en el catálogo y sus variantes."
                )
@admin.register(Pedido)
class PedidoAdmin(TiendaAdministradaMixin, admin.ModelAdmin):
    filtro_tienda = 'tienda'
    list_display = ('id_pedido', 'identificador', 'comprador', 'monto_total', 'estado')
    readonly_fields = ('identificador',)

    def save_model(self, request, obj, form, change):
        if obj.tienda_id != self.tienda_administrada(request).pk:
            raise PermissionDenied('El pedido no pertenece a la tienda administrada.')
        return super().save_model(request, obj, form, change)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'tienda':
            kwargs['queryset'] = Tienda.objects.filter(pk=self.tienda_administrada(request).pk)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
