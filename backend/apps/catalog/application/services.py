from typing import Dict, Any, List
from bson import ObjectId
from apps.catalog.infrastructure.repositories import ProductRepository


class VariantService:
    def __init__(self):
        self.repo = ProductRepository()

    def get_variants(self, product_id: str) -> list:
        """Recupera todas las variantes asociadas a un producto."""
        producto = None
        if hasattr(self.repo, "get_by_id"):
            producto = self.repo.get_by_id(product_id)

        if not producto and hasattr(self.repo, "collection"):
            id_query = self.repo._build_id_query(product_id) if hasattr(self.repo, "_build_id_query") else {"_id": product_id}
            producto = self.repo.collection.find_one(id_query)

        if not producto:
            raise ValueError(f"No se encontró el producto con ID '{product_id}'.")

        return producto.get("variantes", [])

    def get_variant_by_sku(self, product_id: str, sku: str) -> dict:
        """
        Recupera una variante según su SKU, ID o índice numérico (1, 2, ...).
        """
        variantes = self.get_variants(product_id)
        if not variantes:
            raise ValueError(f"El producto con ID '{product_id}' no tiene variantes registradas.")

        clean_id = str(sku).strip().upper()

        # 1. Búsqueda por SKU exacto
        for v in variantes:
            if v.get("sku", "").strip().upper() == clean_id:
                return v

        # 2. Búsqueda por id numérico interno
        for v in variantes:
            if str(v.get("id", "")).strip() == str(sku).strip() or str(v.get("id_variante", "")).strip() == str(sku).strip():
                return v

        # 3. Búsqueda por índice (1 = primera variante)
        if str(sku).strip().isdigit():
            idx = int(str(sku).strip())
            if 1 <= idx <= len(variantes):
                return variantes[idx - 1]

        raise ValueError(f"La variante con identificador/SKU '{sku}' no existe en este producto.")

    def delete_variant(self, product_id: str, sku: str, soft_delete: bool = False):
        """
        Elimina una variante de un producto en MongoDB.
        Resuelve la variante por índice numérico o SKU y la remueve del arreglo.
        """
        # 1. Obtener la variante para saber su SKU exacto
        variante_existente = self.get_variant_by_sku(product_id, sku)
        sku_real = variante_existente.get("sku")

        # 2. Query de producto compatible
        id_query = self.repo._build_id_query(product_id) if hasattr(self.repo, "_build_id_query") else {"_id": product_id}

        if soft_delete:
            res = self.repo.collection.update_one(
                {"$and": [id_query, {"variantes.sku": sku_real}]},
                {"$set": {"variantes.$.es_activa": False, "variantes.$.activo": False}}
            )
        else:
            res = self.repo.collection.update_one(
                id_query,
                {"$pull": {"variantes": {"sku": sku_real}}}
            )

        if res.modified_count == 0:
            raise ValueError(f"No se pudo eliminar la variante '{sku}' en base de datos.")

        return sku_real

    def create_variant(self, product_id: str, variant_data: Dict[str, Any]):
        variant_data["sku"] = str(variant_data["sku"]).strip().upper()
        if variant_data.get("precio", 0) < 0:
            raise ValueError("El precio no puede ser negativo.")
        if variant_data.get("stock", 0) < 0:
            raise ValueError("El stock no puede ser negativo.")

        success = self.repo.add_variant(product_id, variant_data)
        if not success:
            raise ValueError("No se pudo agregar la variante o el producto no existe.")
        return variant_data

    def update_variant(self, product_id: str, sku: str, update_data: Dict[str, Any]):
        if "precio" in update_data:
            try:
                if float(update_data["precio"]) < 0:
                    raise ValueError("El precio no puede ser negativo.")
            except (ValueError, TypeError):
                raise ValueError("El precio debe ser un número válido.")

        if "stock" in update_data:
            try:
                if int(update_data["stock"]) < 0:
                    raise ValueError("El stock no puede ser negativo.")
            except (ValueError, TypeError):
                raise ValueError("El stock debe ser un número entero válido.")

        variante_existente = self.get_variant_by_sku(product_id, sku)
        sku_real = variante_existente.get("sku")

        success = self.repo.update_variant(product_id, sku_real, update_data)
        if not success:
            raise ValueError(f"No se encontró la variante '{sku}' o no hubo cambios.")
        return self.get_variant_by_sku(product_id, sku_real)

    def process_purchase(self, sku: str, cantidad: int):
        if cantidad <= 0:
            raise ValueError("La cantidad a comprar debe ser mayor a 0.")

        actualizado = self.repo.decrease_stock(sku.strip().upper(), cantidad)
        if not actualizado:
            raise ValueError(f"Operación rechazada: La variante '{sku}' tiene stock 0 o insuficiente.")
        return True