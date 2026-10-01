from typing import List, Dict, Any, Optional

from django.utils.text import slugify
from django.utils import timezone

from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.models import Producto
from apps.core.infrastructure.mongo_client import get_mongo_db
from bson import ObjectId
from django.shortcuts import get_object_or_404
from apps.catalog.domain.stock import validate_stock

class ListPublicProductsUseCase:

    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(
        self, tienda_id: str, atributos: Optional[Dict[str, List[str]]] = None
    ) -> List[Dict[str, Any]]:
        return self.repository.list_by_store(tienda_id, activo=True, atributos=atributos)

class GetPublicProductDetailUseCase:
    """Obtiene el detalle de un producto activo, identificado por su slug."""
 
    def __init__(self, repository: ProductRepository):
        self.repository = repository
 
    def execute(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        producto = self.repository.get_by_slug(tienda_id, slug)
        if producto is None or not producto.get("activo", False):
            return None
        return producto


class GetPublicProductAttributesUseCase:
    """
    Obtiene los atributos personalizados de un producto activo :
    - atributos_generales
    - atributos_variante
    """
 
    def __init__(self, repository: ProductRepository):
        self.repository = repository
 
    def execute(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        producto = self.repository.get_by_slug(tienda_id, slug)
        if producto is None or not producto.get("activo", False):
            return None
 
        return {
            "atributos_generales": producto.get("atributos_generales") or [],
            "atributos_variante": self._agrupar_atributos_variante(
                producto.get("variantes") or []
            ),
        }
 
    def _agrupar_atributos_variante(self, variantes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        agrupados: Dict[str, Dict[str, Any]] = {}
        for variante in variantes:
            for attr in variante.get("atributos_variante") or []:
                clave = attr.get("clave")
                if not clave:
                    continue
                entry = agrupados.setdefault(
                    clave, {"clave": clave, "etiqueta": attr.get("etiqueta"), "valores": []}
                )
                valor = attr.get("valor")
                if valor is not None and valor not in entry["valores"]:
                    entry["valores"].append(valor)
        return list(agrupados.values())
class SoftDeleteProductUseCase:
    def execute(self, id_producto: int, tienda_id: str) -> dict:
        # Los productos documentales se desactivan por su ObjectId y tienda.
        if ObjectId.is_valid(str(id_producto)):
            repository = ProductRepository()
            product = repository.get_by_id(str(tienda_id), str(id_producto))
            if product is None:
                raise ValueError("El producto no existe en el catálogo.")
            if not product.get('activo', False):
                raise ValueError("El producto ya se encuentra eliminado.")
            if not repository.update(str(tienda_id), str(id_producto), {'activo': False}):
                raise ValueError("No se pudo desactivar el producto.")
            return {"exito": True, "mensaje": "Producto eliminado lógicamente de forma correcta."}
        try:
            id_producto = int(id_producto)
        except (TypeError, ValueError):
            raise ValueError("El producto no existe en el catálogo.") from None
        # 1. Soft Delete en PostgreSQL
        try:
            producto_pg = Producto.objects.get(id_producto=id_producto, id_tienda=tienda_id)
            if not producto_pg.activo:
                raise ValueError("El producto ya se encuentra eliminado.")
            
            producto_pg.activo = False
            producto_pg.save(update_fields=['activo'])
        except Producto.DoesNotExist:
            raise ValueError("El producto no existe en el catálogo.")

        # 2. Soft Delete en MongoDB (Si existe ahí)
        db = get_mongo_db()
        productos_collection = db.productos
        
        # Actualizamos el estado 'activo' en Mongo asegurando que pertenezca a la misma tienda
        # En MongoDB los productos se guardan con id de la tienda en string (Ej: "tienda_id": "7")
        productos_collection.update_one(
            {"id_postgresql": id_producto, "tienda_id": str(tienda_id)}, 
            {"$set": {"activo": False}}
        )

        return {"exito": True, "mensaje": "Producto eliminado lógicamente de forma correcta."}
    
class CreateProductUseCase:
    """Crea un producto nuevo en el catálogo de la tienda (RF-03.4 / tarea de creación)."""

    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(self, tienda_id: str, data: Dict[str, Any]) -> str:
        for variant in data['variantes']:
            if self.repository.get_by_sku(tienda_id, variant['sku']):
                raise ValueError(f"El SKU '{variant['sku']}' ya existe en esta tienda.")
        slug = self._slug_disponible(tienda_id, slugify(data["nombre"]))

        producto = {
            "nombre": data["nombre"],
            "slug": slug,
            "descripcion": data.get("descripcion", ""),
            "categoria": data["categoria"],
            "activo": data.get("activo", True),
            "fecha_creacion": timezone.now(),
            "imagenes": data.get("imagenes", []),
            "atributos_generales": data.get("atributos_generales", []),
            "variantes": data["variantes"],
            "seo": data.get("seo", {}),
        }

        return self.repository.create(tienda_id, producto)

    def _slug_disponible(self, tienda_id: str, base_slug: str) -> str:
        slug = base_slug or "producto"
        sufijo = 1
        while self.repository.get_by_slug(tienda_id, slug):
            sufijo += 1
            slug = f"{base_slug or 'producto'}-{sufijo}"
        return slug

class CrearProductoUseCase:
    def ejecutar(self, tienda, datos_validados):
        if 'stock' in datos_validados:
            validate_stock(datos_validados['stock'])
        producto = Producto.objects.create(
            id_tienda=tienda,
            **datos_validados
        )
        return producto


class ProductEditConflict(ValueError):
    pass


class UpdateCatalogProductUseCase:
    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(self, tienda_id, original, data, revision):
        if revision != self.repository.revision(original):
            raise ProductEditConflict("El producto cambió desde que lo abriste. Recarga antes de guardar.")
        for variant in data.get('variantes', []):
            existing = self.repository.get_by_sku(tienda_id, variant['sku'])
            if existing and existing['_id'] != original['_id']:
                raise ValueError(f"El SKU '{variant['sku']}' ya existe en esta tienda.")
        # Mantener metadatos legacy de variantes que siguen existiendo.
        if 'variantes' in data:
            previous = {v['sku']: v for v in original.get('variantes', [])}
            data = {**data, 'variantes': [
                {**previous.get(v['sku'], {}), **v} for v in data['variantes']
            ]}
        product = self.repository.update_catalog(tienda_id, original, data)
        if product is None:
            raise ProductEditConflict("El producto cambió durante el guardado. Recarga antes de guardar.")
        return product

class ObtenerProductoAdminUseCase:
    def ejecutar(self, tienda, id_producto):
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        return producto

class ActualizarProductoAdminUseCase:
    def ejecutar(self, tienda, id_producto, datos_actualizados):
        if 'stock' in datos_actualizados:
            validate_stock(datos_actualizados['stock'])
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        
        for campo, valor in datos_actualizados.items():
            setattr(producto, campo, valor)
            
        producto.save()
        return producto

class ActualizarStockProductoUseCase:
    def ejecutar(self, tienda, id_producto, nuevo_stock):
        validate_stock(nuevo_stock)
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        
        producto.stock = nuevo_stock
        producto.save()
        
        return producto

class ValidarDisponibilidadProductoUseCase:
    def ejecutar(self, tienda_id, id_producto, cantidad_requerida=1):
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda_id)
        
        if not producto.activo:
            raise ValueError("El producto no se encuentra disponible (inactivo).")
            
        if producto.stock <= 0:
            raise ValueError("El producto se encuentra agotado (stock 0).")
            
        if producto.stock < cantidad_requerida:
            raise ValueError(f"Stock insuficiente. Solo quedan {producto.stock} unidades.")
            
        return producto
