from django.contrib import admin
from django.utils.text import slugify
from apps.catalog.infrastructure.repositories import ProductRepository
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from apps.core.models import Usuario, Tienda, Producto
from apps.core.services import configurar_tienda
from apps.core.infrastructure.tenant import resolver_tienda
from rest_framework.exceptions import APIException

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
        # La asignación inicial es una operación de configuración del despliegue.
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
            # Cubre formularios abiertos antes de que otra configuración terminara.
            raise PermissionDenied('Esta instalación ya tiene una tienda configurada.')
        obj.pk = tienda.pk
        obj.fecha_creacion = tienda.fecha_creacion
        obj._state = tienda._state

    def get_readonly_fields(self, request, obj=None):
        # La transferencia de propiedad no forma parte de una edición común.
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
        # 1. Guarda el producto en PostgreSQL primero
        super().save_model(request, obj, form, change)

        # 2. Si es una creación nueva (no una edición existente), lo sincroniza en MongoDB
        if not change:
            repo = ProductRepository()
            mongo_id = repo.create({
                "nombre": obj.nombre,
                "tienda_id": str(obj.id_tienda_id),
                "slug": slugify(obj.nombre),
                "precio": float(obj.precio) if obj.precio else 0.0,
                "stock": int(obj.stock) if obj.stock is not None else 0,
                "activo": True,
                "variantes": []
            })
            
            # Muestra un mensaje verde de éxito en el Django Admin con el ID de Mongo
            self.message_user(
                request, 
                f"✅ Producto guardado en PostgreSQL y sincronizado en MongoDB con ID: {mongo_id}"
            )
