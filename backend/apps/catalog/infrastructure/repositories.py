from typing import Optional, List, Dict, Any
from bson import ObjectId
from apps.core.infrastructure.mongo_client import get_mongo_db
from apps.catalog.infrastructure.attribute_filters import build_attribute_query


class ProductRepository:
    """Repositorio para operaciones CRUD de productos en MongoDB"""
    
    def __init__(self):
        self.db = get_mongo_db()
        self.collection = self.db.productos
    
    def create(self, product_data: Dict[str, Any]) -> str:
        """Crea un nuevo producto. Retorna el ID como string."""
        result = self.collection.insert_one(product_data)
        return str(result.inserted_id)
    
    def get_by_id(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene un producto por su ID."""
        try:
            product = self.collection.find_one({"_id": ObjectId(product_id)})
            if product:
                product["_id"] = str(product["_id"])
            return product
        except Exception:
            return None
    
    def get_by_sku(self, tienda_id: str, sku: str) -> Optional[Dict[str, Any]]:
        """Obtiene el producto que contiene la variante con el SKU dado."""
        product = self.collection.find_one({
            "tienda_id": tienda_id,
            "variantes.sku": sku
        })
        if product:
            product["_id"] = str(product["_id"])
        return product
    
    def get_by_slug(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        """Obtiene un producto por su slug."""
        product = self.collection.find_one({
            "tienda_id": tienda_id,
            "slug": slug
        })
        if product:
            product["_id"] = str(product["_id"])
        return product
    
    def list_by_store(
        self,
        tienda_id: str,
        activo: Optional[bool] = None,
        atributos: Optional[Dict[str, List[str]]] = None,
    ) -> List[Dict[str, Any]]:
        """Lista productos de una tienda, filtrando opcionalmente por atributos personalizados."""
        query = {"tienda_id": tienda_id}
        if activo is not None:
            query["activo"] = activo

        if atributos:
            variant_claves = set(
                self.collection.distinct("variantes.atributos_variante.clave", query)
            )
            query = build_attribute_query(query, atributos, variant_claves)

        products = list(self.collection.find(query))
        for product in products:
            product["_id"] = str(product["_id"])
        return products
    
    def update(self, product_id: str, update_data: Dict[str, Any]) -> bool:
        """Actualiza un producto."""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(product_id)},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception:
            return False
    
    def delete(self, product_id: str) -> bool:
        """Elimina un producto."""
        try:
            result = self.collection.delete_one({"_id": ObjectId(product_id)})
            return result.deleted_count > 0
        except Exception:
            return False
    
    def decrease_stock(self, sku: str, cantidad: int) -> bool:
        """Disminuye stock de una variante de forma atómica (RN-03)."""
        result = self.collection.find_one_and_update(
            {
                "variantes.sku": sku,
                "variantes.stock": {"$gte": cantidad}
            },
            {"$inc": {"variantes.$.stock": -cantidad}},
        )
        return result is not None


class AttributeTemplateRepository:
    """Repositorio para plantillas de atributos por tienda/rubro."""
    
    def __init__(self):
        self.db = get_mongo_db()
        self.collection = self.db.plantillas_atributos
    
    def create(self, template_data: Dict[str, Any]) -> str:
        """Crea una plantilla de atributos."""
        result = self.collection.insert_one(template_data)
        return str(result.inserted_id)
    
    def get_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene una plantilla por ID."""
        try:
            template = self.collection.find_one({"_id": ObjectId(template_id)})
            if template:
                template["_id"] = str(template["_id"])
            return template
        except Exception:
            return None
    
    def get_by_store_and_category(self, tienda_id: str, categoria: str) -> Optional[Dict[str, Any]]:
        """Obtiene la plantilla para una tienda y categoría."""
        template = self.collection.find_one({
            "tienda_id": tienda_id,
            "categoria": categoria
        })
        if template:
            template["_id"] = str(template["_id"])
        return template
    
    def list_by_store(self, tienda_id: str) -> List[Dict[str, Any]]:
        """Lista plantillas de una tienda."""
        templates = list(self.collection.find({"tienda_id": tienda_id}))
        for template in templates:
            template["_id"] = str(template["_id"])
        return templates
    
    def update(self, template_id: str, update_data: Dict[str, Any]) -> bool:
        """Actualiza una plantilla."""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(template_id)},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception:
            return False
    
    def delete(self, template_id: str) -> bool:
        """Elimina una plantilla."""
        try:
            result = self.collection.delete_one({"_id": ObjectId(template_id)})
            return result.deleted_count > 0
        except Exception:
            return False