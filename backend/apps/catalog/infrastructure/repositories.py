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

    @staticmethod
    def revision(product):
        from hashlib import sha256
        from bson.json_util import dumps
        return sha256(dumps(product, sort_keys=True).encode()).hexdigest()

    def get_admin_product(self, tienda_id: str, product_id: str):
        validate_store_id(tienda_id)
        if not ObjectId.is_valid(product_id):
            return None
        product = self.collection.find_one({'tienda_id': tienda_id, '_id': ObjectId(product_id)})
        if product:
            product['_id'] = str(product['_id'])
        return product

    def update_catalog(self, tienda_id: str, original: dict, data: dict):
        """Compara el documento leído para no pisar stock/cambios concurrentes."""
        data = data_for_store(tienda_id, data)
        validate_product_stock(data)
        query = {key: value for key, value in original.items() if key != '_id'}
        query.update({'_id': ObjectId(original['_id']), 'tienda_id': tienda_id})
        product = self.collection.find_one_and_update(
            query, {'$set': data}, return_document=ReturnDocument.AFTER,
        )
        if product:
            product['_id'] = str(product['_id'])
        return product


    def get_by_id(self, tienda_id_or_product_id: str, product_id: Optional[str] = None) -> Optional[Dict[str, Any]]:

        """

        Obtiene un producto por su ID.

        Soporta llamadas con un argumento get_by_id(product_id) o dos get_by_id(tienda_id, product_id).

        """

        if product_id is not None:
            validate_store_id(tienda_id_or_product_id)
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

        validate_store_id(tienda_id)
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


    def decrease_stock(
        self,
        tienda_id_or_sku: str,
        sku_or_cantidad: Any,
        cantidad: Optional[int] = None
    ) -> bool:
        """
        Disminuye stock de una variante de forma atómica (RN-03).

        Soporta:
        - decrease_stock(sku, cantidad)
        - decrease_stock(tienda_id, sku, cantidad)
        """

        if cantidad is None:
            sku = str(tienda_id_or_sku)
            cantidad_recibida = sku_or_cantidad

            if isinstance(cantidad_recibida, bool) or not isinstance(cantidad_recibida, int):
                raise ValueError(
                    "La cantidad a descontar debe ser un número entero válido."
                )

            if cantidad_recibida <= 0:
                raise ValueError(
                    "La cantidad a descontar debe ser mayor a 0."
                )

            cant = cantidad_recibida
            validate_stock(cant)

            filtro = {
                "variantes": {
                    "$elemMatch": {
                        "sku": sku,
                        "stock": {"$gte": cant}
                    }
                }
            }

        else:
            tienda_id = tienda_id_or_sku
            sku = str(sku_or_cantidad)
            cantidad_recibida = cantidad

            if isinstance(cantidad_recibida, bool) or not isinstance(cantidad_recibida, int):
                raise ValueError(
                    "La cantidad a descontar debe ser un número entero válido."
                )

            if cantidad_recibida <= 0:
                raise ValueError(
                    "La cantidad a descontar debe ser mayor a 0."
                )

            cant = cantidad_recibida

            validate_store_id(tienda_id)
            validate_stock(cant)

            filtro = {
                "tienda_id": tienda_id,
                "variantes": {
                    "$elemMatch": {
                        "sku": sku,
                        "stock": {"$gte": cant}
                    }
                }
            }

        result = self.collection.find_one_and_update(
            filtro,
            {"$inc": {"variantes.$.stock": -cant}},
        )

        return result is not None


    def add_variant(
        self,
        tienda_id_or_product_id: str,
        product_id_or_variant_data: Any,
        variant_data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Agrega una variante al producto.

        Soporta:
        - add_variant(product_id, variant_data)
        - add_variant(tienda_id, product_id, variant_data)

        En ambos casos valida stock y evita SKU duplicado.
        """
        if variant_data is None:
            tienda_id = None
            product_id = str(tienda_id_or_product_id)
            data = dict(product_id_or_variant_data)
            id_query = self._build_id_query(product_id)
        else:
            tienda_id = str(tienda_id_or_product_id)
            validate_store_id(tienda_id)
            product_id = str(product_id_or_variant_data)
            data = dict(variant_data)
            id_query = {
                "$and": [
                    {"tienda_id": tienda_id},
                    self._build_id_query(product_id),
                ]
            }

        validate_product_stock({"variantes": [data]})

        sku = str(data.get("sku", "")).strip().upper()
        if not sku:
            raise ValueError("El SKU de la variante es obligatorio.")
        data["sku"] = sku

        filtro_sku = {"$and": [id_query, {"variantes.sku": sku}]}
        if self.collection.find_one(filtro_sku):
            raise ValueError(f"Ya existe una variante con el SKU '{sku}' en este producto.")

        try:
            result = self.collection.update_one(
                {"$and": [id_query, {"variantes.sku": {"$ne": sku}}]},
                {"$push": {"variantes": data}},
            )
        except DuplicateKeyError as error:
            raise ValueError("El SKU ya existe en esta tienda.") from error

        return result.modified_count > 0

    def update_variant(
        self,
        tienda_id_or_product_id: str,
        product_id_or_identifier: str,
        identifier_or_data: Any,
        editable_data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Actualiza una variante.

        Soporta:
        - update_variant(product_id, identifier, editable_data)
        - update_variant(tienda_id, product_id, identifier, editable_data)

        El identificador puede ser SKU, id interno o índice numérico.
        """
        if editable_data is None:
            tienda_id = None
            product_id = str(tienda_id_or_product_id)
            identifier = str(product_id_or_identifier)
            data = dict(identifier_or_data)
            id_query = self._build_id_query(product_id)
        else:
            tienda_id = str(tienda_id_or_product_id)
            validate_store_id(tienda_id)
            product_id = str(product_id_or_identifier)
            identifier = str(identifier_or_data)
            data = dict(editable_data)
            id_query = {
                "$and": [
                    {"tienda_id": tienda_id},
                    self._build_id_query(product_id),
                ]
            }

        if "stock" in data:
            validate_stock(data["stock"])

        producto = self.collection.find_one(id_query)
        if not producto:
            return False

        variantes = producto.get("variantes", [])
        clean_id = identifier.strip().upper()

        target_sku = None
        for idx, variante in enumerate(variantes, start=1):
            sku = str(variante.get("sku", "")).strip().upper()
            id_interno = str(variante.get("id", "")).strip().upper()
            id_variante = str(variante.get("id_variante", "")).strip().upper()

            if (
                sku == clean_id
                or id_interno == clean_id
                or id_variante == clean_id
                or (clean_id.isdigit() and int(clean_id) == idx)
            ):
                target_sku = variante.get("sku")
                break

        if not target_sku:
            return False

        update_fields = {f"variantes.$.{key}": value for key, value in data.items()}

        result = self.collection.update_one(
            {"$and": [id_query, {"variantes.sku": target_sku}]},
            {"$set": update_fields},
        )
        return result.matched_count > 0

    def update_variant_stock(
        self,
        tienda_id: str,
        product_id: str,
        sku: str,
        stock: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Actualiza de forma atómica el stock de una variante perteneciente a una tienda
        y devuelve la variante posterior a la escritura.
        """
        validate_store_id(tienda_id)
        validate_stock(stock)

        query = {
            "$and": [
                {"tienda_id": tienda_id},
                self._build_id_query(product_id),
                {"variantes.sku": sku},
            ]
        }

        product = self.collection.find_one_and_update(
            query,
            {"$set": {"variantes.$.stock": stock}},
            return_document=ReturnDocument.AFTER,
        )

        if not product:
            return None

        return next(
            (variant for variant in product.get("variantes", []) if variant.get("sku") == sku),
            None,
        )

    def delete_variant(
        self,
        product_id: str,
        sku: str,
        soft_delete: bool = False,
    ) -> bool:
        """Elimina o desactiva una variante de un producto."""
        id_query = self._build_id_query(product_id)

        if soft_delete:
            result = self.collection.update_one(
                {"$and": [id_query, {"variantes.sku": sku}]},
                {
                    "$set": {
                        "variantes.$.es_activa": False,
                        "variantes.$.activo": False,
                    }
                },
            )
        else:
            result = self.collection.update_one(
                id_query,
                {"$pull": {"variantes": {"sku": sku}}},
            )

        return result.modified_count > 0


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
