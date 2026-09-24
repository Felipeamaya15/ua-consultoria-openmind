from django.contrib import admin
from django.utils.text import slugify
from apps.core.models import Usuario, Tienda, Producto
from apps.catalog.infrastructure.repositories import ProductRepository


@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    list_display = ('id_usuario', 'correo', 'nombre', 'apellido', 'rol')
    search_fields = ('correo', 'nombre', 'apellido')


@admin.register(Tienda)
class TiendaAdmin(admin.ModelAdmin):
    list_display = ('id_tienda', 'nombre', 'id_usuario_propietario', 'fecha_creacion')
    search_fields = ('nombre',)


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
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