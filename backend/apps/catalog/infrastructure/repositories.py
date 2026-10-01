from typing import Optional, List, Dict, Any
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from apps.catalog.domain.stock import validate_product_stock, validate_stock
from apps.catalog.domain.tienda import data_for_store, validate_store_id
from apps.core.infrastructure.mongo_client import get_mongo_db
from apps.catalog.infrastructure.attribute_filters import build_attribute_query


class ProductRepository:
    """Repositorio para operaciones CRUD de productos en MongoDB"""
    
    def __init__(self):
        self.db = get_mongo_db()
        self.collection = self.db.productos
    
    def create(self, tienda_id: str, product_data: Dict[str, Any]) -> str:
        """Crea un nuevo producto. Retorna el ID como string."""
        product_data = data_for_store(tienda_id, product_data)
        validate_product_stock(product_data)
        result = self.collection.insert_one(product_data)
        return str(result.inserted_id)
    
    def get_by_id(self, tienda_id: str, product_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene un producto por su ID."""
        validate_store_id(tienda_id)
        try:
            product = self.collection.find_one({"tienda_id": tienda_id, "_id": ObjectId(product_id)})
            if product:
                product["_id"] = str(product["_id"])
            return product
        except Exception:
            return None
    
    def get_by_sku(self, tienda_id: str, sku: str) -> Optional[Dict[str, Any]]:
        """Obtiene el producto que contiene la variante con el SKU dado."""
        validate_store_id(tienda_id)
        product = self.collection.find_one({
            "tienda_id": tienda_id,
            "variantes.sku": sku
        })
        if product:
            product["_id"] = str(product["_id"])
        return product
    
    def get_by_slug(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        """Obtiene un producto por su slug."""
        validate_store_id(tienda_id)
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
    
    def update(self, tienda_id: str, product_id: str, update_data: Dict[str, Any]) -> bool:
        """Actualiza un producto."""
        update_data = data_for_store(tienda_id, update_data)
        validate_product_stock(update_data)
        try:
            result = self.collection.update_one(
                {"tienda_id": tienda_id, "_id": ObjectId(product_id)},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception:
            return False
    
    def delete(self, tienda_id: str, product_id: str) -> bool:
        """Elimina un producto."""
        validate_store_id(tienda_id)
        try:
            result = self.collection.delete_one({"tienda_id": tienda_id, "_id": ObjectId(product_id)})
            return result.deleted_count > 0
        except Exception:
            return False
    
    def decrease_stock(self, tienda_id: str, sku: str, cantidad: int) -> bool:
        """Disminuye stock de una variante de forma atómica (RN-03)."""
        validate_store_id(tienda_id)
        validate_stock(cantidad)
        result = self.collection.find_one_and_update(
            {
                "tienda_id": tienda_id,
                "variantes": {"$elemMatch": {"sku": sku, "stock": {"$gte": cantidad}}}
            },
            {"$inc": {"variantes.$.stock": -cantidad}},
        )
        return result is not None
    
    def add_variant(self, tienda_id: str, product_id: str, variant_data: Dict[str, Any]) -> bool:
        """Añade una variante sin permitir SKU repetido ni stock negativo."""
        validate_store_id(tienda_id)
        validate_product_stock({'variantes': [variant_data]})
        try:
            product_key = {"tienda_id": tienda_id, "_id": ObjectId(product_id)}
        except (InvalidId, ValueError, TypeError):
            return False
        if self.collection.find_one({**product_key, "variantes.sku": variant_data["sku"]}):
            raise ValueError(f"Ya existe una variante con el SKU '{variant_data['sku']}' en este producto.")
        try:
            result = self.collection.update_one(
                {**product_key, "variantes.sku": {"$ne": variant_data["sku"]}},
                {"$push": {"variantes": variant_data}}
            )
        except DuplicateKeyError as error:
            raise ValueError('El SKU ya existe en esta tienda.') from error
        return result.modified_count > 0

    def update_variant(self, tienda_id: str, product_id: str, sku: str, editable_data: Dict[str, Any]) -> bool:
        """Edita una variante propia; el stock se valida también sin servicio."""
        validate_store_id(tienda_id)
        update_fields = {f"variantes.$.{key}": value for key, value in editable_data.items()}
        validate_product_stock(update_fields)
        try:
            product_key = {"tienda_id": tienda_id, "_id": ObjectId(product_id), "variantes.sku": sku}
        except (InvalidId, ValueError, TypeError):
            return False
        result = self.collection.update_one(product_key, {"$set": update_fields})
        return result.matched_count > 0

    def update_variant_stock(self, tienda_id: str, product_id: str, sku: str, stock: int) -> Optional[Dict[str, Any]]:
        """Devuelve el documento posterior a la escritura atómica de una variante."""
        validate_store_id(tienda_id)
        validate_stock(stock)
        try:
            object_id = ObjectId(product_id)
        except (InvalidId, ValueError, TypeError):
            return None
        product = self.collection.find_one_and_update(
            {"tienda_id": tienda_id, "_id": object_id, "variantes.sku": sku},
            {"$set": {"variantes.$.stock": stock}},
            return_document=ReturnDocument.AFTER,
        )
        if product:
            return next((variant for variant in product.get('variantes', []) if variant.get('sku') == sku), None)
        return None


class AttributeTemplateRepository:
    """Repositorio para plantillas de atributos por tienda/rubro."""
    
    def __init__(self):
        self.db = get_mongo_db()
        self.collection = self.db.plantillas_atributos
    
    def create(self, tienda_id: str, template_data: Dict[str, Any]) -> str:
        """Crea una plantilla de atributos."""
        result = self.collection.insert_one(data_for_store(tienda_id, template_data))
        return str(result.inserted_id)
    
    def get_by_id(self, tienda_id: str, template_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene una plantilla por ID."""
        validate_store_id(tienda_id)
        try:
            template = self.collection.find_one({"tienda_id": tienda_id, "_id": ObjectId(template_id)})
            if template:
                template["_id"] = str(template["_id"])
            return template
        except Exception:
            return None
    
    def get_by_store_and_category(self, tienda_id: str, categoria: str) -> Optional[Dict[str, Any]]:
        """Obtiene la plantilla para una tienda y categoría."""
        validate_store_id(tienda_id)
        template = self.collection.find_one({
            "tienda_id": tienda_id,
            "categoria": categoria
        })
        if template:
            template["_id"] = str(template["_id"])
        return template
    
    def list_by_store(self, tienda_id: str) -> List[Dict[str, Any]]:
        """Lista plantillas de una tienda."""
        validate_store_id(tienda_id)
        templates = list(self.collection.find({"tienda_id": tienda_id}))
        for template in templates:
            template["_id"] = str(template["_id"])
        return templates
    
    def update(self, tienda_id: str, template_id: str, update_data: Dict[str, Any]) -> bool:
        """Actualiza una plantilla."""
        update_data = data_for_store(tienda_id, update_data)
        try:
            result = self.collection.update_one(
                {"tienda_id": tienda_id, "_id": ObjectId(template_id)},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception:
            return False
    
    def delete(self, tienda_id: str, template_id: str) -> bool:
        """Elimina una plantilla."""
        validate_store_id(tienda_id)
        try:
            result = self.collection.delete_one({"tienda_id": tienda_id, "_id": ObjectId(template_id)})
            return result.deleted_count > 0
        except Exception:
            return False
