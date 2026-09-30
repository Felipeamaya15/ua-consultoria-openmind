from typing import Optional, List, Dict, Any
from bson import ObjectId
from apps.catalog.domain.stock import validate_product_stock, validate_stock
from apps.catalog.domain.tienda import data_for_store, validate_store_id
from apps.core.infrastructure.mongo_client import get_mongo_db
from apps.catalog.infrastructure.attribute_filters import build_attribute_query


class ProductRepository:
    """Repositorio para operaciones CRUD de productos en MongoDB"""

    def __init__(self):
        self.db = get_mongo_db()
        self.collection = self.db.productos

    def _build_id_query(self, product_id: Any) -> Dict[str, Any]:
        """Construye un filtro compatible con id_producto (entero o str) y _id (ObjectId o str)."""
        filtros = []
        try:
            filtros.append({"id_producto": int(product_id)})
        except (ValueError, TypeError):
            pass

        filtros.append({"id_producto": str(product_id)})
        filtros.append({"_id": str(product_id)})

        if ObjectId.is_valid(str(product_id)):
            try:
                filtros.append({"_id": ObjectId(str(product_id))})
            except Exception:
                pass

        return {"$or": filtros}

    def create(self, tienda_id: str, product_data: Dict[str, Any]) -> str:
        """Crea un nuevo producto. Retorna el ID como string."""
        product_data = data_for_store(tienda_id, product_data)
        validate_product_stock(product_data)
        result = self.collection.insert_one(product_data)
        return str(result.inserted_id)

    def get_by_id(self, tienda_id_or_product_id: str, product_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Obtiene un producto por su ID.
        Soporta llamadas con un argumento get_by_id(product_id) o dos get_by_id(tienda_id, product_id).
        """
        try:
            if product_id is None:
                query = self._build_id_query(tienda_id_or_product_id)
            else:
                validate_store_id(tienda_id_or_product_id)
                query = {"$and": [{"tienda_id": tienda_id_or_product_id}, self._build_id_query(product_id)]}

            product = self.collection.find_one(query)
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
            query = {"$and": [{"tienda_id": tienda_id}, self._build_id_query(product_id)]}
            result = self.collection.update_one(query, {"$set": update_data})
            return result.modified_count > 0
        except Exception:
            return False

    def delete(self, tienda_id: str, product_id: str) -> bool:
        """Elimina un producto."""
        validate_store_id(tienda_id)
        try:
            query = {"$and": [{"tienda_id": tienda_id}, self._build_id_query(product_id)]}
            result = self.collection.delete_one(query)
            return result.deleted_count > 0
        except Exception:
            return False

    def decrease_stock(self, tienda_id_or_sku: str, sku_or_cantidad: Any, cantidad: Optional[int] = None) -> bool:
        """
        Disminuye stock de una variante de forma atómica (RN-03).
        Soporta firma (sku, cantidad) desde servicios o (tienda_id, sku, cantidad).
        """
        if cantidad is None:
            sku = str(tienda_id_or_sku)
            cant = int(sku_or_cantidad)
            validate_stock(cant)
            filtro = {"variantes": {"$elemMatch": {"sku": sku, "stock": {"$gte": cant}}}}
        else:
            tienda_id = str(tienda_id_or_sku)
            sku = str(sku_or_cantidad)
            cant = int(cantidad)
            validate_store_id(tienda_id)
            validate_stock(cant)
            filtro = {
                "tienda_id": tienda_id,
                "variantes": {"$elemMatch": {"sku": sku, "stock": {"$gte": cant}}}
            }

        result = self.collection.find_one_and_update(
            filtro,
            {"$inc": {"variantes.$.stock": -cant}},
        )
        return result is not None

    def add_variant(self, product_id: str, variant_data: Dict[str, Any]) -> bool:
        """
        Agrega una nueva variante al arreglo 'variantes' del producto.
        Valida que el SKU no esté repetido dentro de ese producto.
        Soporta identificadores numéricos e identificadores ObjectId.
        """
        try:
            id_query = self._build_id_query(product_id)

            # 1. Verificar si ya existe ese SKU en el producto
            filtro_sku = {"$and": [id_query, {"variantes.sku": variant_data["sku"]}]}
            existe = self.collection.find_one(filtro_sku)
            if existe:
                raise ValueError(f"Ya existe una variante con el SKU '{variant_data['sku']}' en este producto.")

            # 2. Agregar la variante al array usando $push
            result = self.collection.update_one(
                id_query,
                {"$push": {"variantes": variant_data}}
            )
            return result.modified_count > 0
        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            return False

    def update_variant(self, product_id: str, identifier: str, editable_data: Dict[str, Any]) -> bool:
        """
        Actualiza los campos editables de una variante específica.
        Soporta identificar la variante por SKU, por su campo 'id', o por su índice numérico (1, 2...).
        """
        try:
            id_query = self._build_id_query(product_id)
            producto = self.collection.find_one(id_query)
            if not producto:
                return False

            variantes = producto.get("variantes", [])
            clean_id = str(identifier).strip().upper()

            # Localizar el SKU real de la variante dentro del arreglo
            target_sku = None
            for idx, v in enumerate(variantes, start=1):
                if (
                    v.get("sku", "").strip().upper() == clean_id
                    or str(v.get("id", "")) == clean_id
                    or str(v.get("id_variante", "")) == clean_id
                    or (clean_id.isdigit() and int(clean_id) == idx)
                ):
                    target_sku = v.get("sku")
                    break

            if not target_sku:
                return False

            # Construir la actualización posicional en MongoDB
            update_fields = {f"variantes.$.{k}": v for k, v in editable_data.items()}

            result = self.collection.update_one(
                {"$and": [id_query, {"variantes.sku": target_sku}]},
                {"$set": update_fields}
            )
            return result.matched_count > 0
        except Exception:
            return False
        
    def delete_variant(self, product_id: str, sku: str, soft_delete: bool = False):
        """
        Elimina una variante de un producto en MongoDB.
        """
        variante_existente = self.get_variant_by_sku(product_id, sku)
        sku_real = variante_existente.get("sku")

        # 2. Ejecutar la eliminación a través del repositorio
        if hasattr(self.repo, "delete_variant"):
            success = self.repo.delete_variant(product_id, sku_real, soft_delete=soft_delete)
        else:
            id_query = self.repo._build_id_query(product_id) if hasattr(self.repo, "_build_id_query") else {"_id": product_id}
            if soft_delete:
                res = self.repo.collection.update_one(
                    {"$and": [id_query, {"variantes.sku": sku_real}]},
                    {"$set": {"variantes.$.es_activa": False}}
                )
            else:
                res = self.repo.collection.update_one(
                    id_query,
                    {"$pull": {"variantes": {"sku": sku_real}}}
                )
            success = res.modified_count > 0

        if not success:
            raise ValueError(f"No se pudo eliminar la variante con identificador/SKU '{sku}'.")

        return sku_real    

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