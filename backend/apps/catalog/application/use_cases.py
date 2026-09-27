from typing import List, Dict, Any, Optional

from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.models import Producto
from apps.core.infrastructure.mongo_client import get_mongo_db
from bson import ObjectId
from django.shortcuts import get_object_or_404

class ListPublicProductsUseCase:

    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(self, tienda_id: str) -> List[Dict[str, Any]]:
        return self.repository.list_by_store(tienda_id, activo=True)

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

class CrearProductoUseCase:
    def ejecutar(self, tienda, datos_validados):
        producto = Producto.objects.create(
            id_tienda=tienda,
            **datos_validados
        )
        return producto

class ObtenerProductoAdminUseCase:
    def ejecutar(self, tienda, id_producto):
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        return producto

class ActualizarProductoAdminUseCase:
    def ejecutar(self, tienda, id_producto, datos_actualizados):
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        
        for campo, valor in datos_actualizados.items():
            setattr(producto, campo, valor)
            
        producto.save()
        return producto

class ActualizarStockProductoUseCase:
    def ejecutar(self, tienda, id_producto, nuevo_stock):
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        
        producto.stock = nuevo_stock
        producto.save()
        
        return producto