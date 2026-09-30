from typing import Dict, Any
from bson import ObjectId
from apps.catalog.infrastructure.repositories import ProductRepository


class VariantService:
    def __init__(self):
        self.repo = ProductRepository()

    def get_variants(self, product_id: str) -> list:
        """Recupera todas las variantes asociadas a un producto."""
        try:
            mongo_id = ObjectId(product_id)
        except Exception:
            mongo_id = product_id

        # Intentamos obtenerlo mediante el repositorio o directo por colección
        producto = None
        if hasattr(self.repo, "get_by_id"):
            producto = self.repo.get_by_id(product_id)

        if not producto and hasattr(self.repo, "collection"):
            producto = self.repo.collection.find_one(
                {"$or": [{"_id": mongo_id}, {"_id": str(product_id)}]}
            )

        if not producto:
            raise ValueError(f"No se encontró el producto con ID '{product_id}'.")

        return producto.get("variantes", [])

    def get_variant_by_sku(self, product_id: str, sku: str) -> dict:
        """Recupera una variante específica según su SKU."""
        variantes = self.get_variants(product_id)
        sku_clean = sku.strip().upper()
        variante = next((v for v in variantes if v.get("sku", "").upper() == sku_clean), None)

        if not variante:
            raise ValueError(f"La variante con SKU '{sku}' no existe en este producto.")

        return variante

    def delete_variant(self, product_id: str, sku: str, soft_delete: bool = False):
        """
        Elimina una variante de un producto en MongoDB.
        Si soft_delete=True, desactiva la variante (es_activa=False).
        Si soft_delete=False, remueve la variante del arreglo mediante $pull.
        """
        try:
            mongo_id = ObjectId(product_id)
        except Exception:
            mongo_id = product_id

        producto = None
        if hasattr(self.repo, "get_by_id"):
            producto = self.repo.get_by_id(product_id)

        if not producto and hasattr(self.repo, "collection"):
            producto = self.repo.collection.find_one(
                {"$or": [{"_id": mongo_id}, {"_id": str(product_id)}]}
            )

        if not producto:
            raise ValueError(f"No se encontró el producto con ID '{product_id}'.")

        variantes = producto.get("variantes", [])
        sku_clean = sku.strip().upper()
        variante_existente = next((v for v in variantes if v.get("sku", "").upper() == sku_clean), None)

        if not variante_existente:
            raise ValueError(f"La variante con SKU '{sku}' no existe en este producto.")

        sku_real = variante_existente.get("sku", sku)

        if soft_delete:
            self.repo.collection.update_one(
                {"$or": [{"_id": mongo_id}, {"_id": str(product_id)}], "variantes.sku": sku_real},
                {"$set": {"variantes.$.es_activa": False}}
            )
        else:
            self.repo.collection.update_one(
                {"$or": [{"_id": mongo_id}, {"_id": str(product_id)}]},
                {"$pull": {"variantes": {"sku": sku_real}}}
            )

        return True

    def create_variant(self, product_id: str, variant_data: Dict[str, Any]):
        variant_data["sku"] = variant_data["sku"].strip().upper()
        if variant_data.get("precio", 0) < 0:
            raise ValueError("El precio no puede ser negativo.")
        if variant_data.get("stock", 0) < 0:
            raise ValueError("El stock no puede ser negativo.")
            
        success = self.repo.add_variant(product_id, variant_data)
        if not success:
            raise ValueError("No se pudo agregar la variante o el producto no existe.")
        return variant_data

    def update_variant(self, product_id: str, sku: str, update_data: Dict[str, Any]):
        sku_clean = sku.strip().upper()
        if "precio" in update_data and update_data["precio"] < 0:
            raise ValueError("El precio no puede ser negativo.")
        if "stock" in update_data and update_data["stock"] < 0:
            raise ValueError("El stock no puede ser negativo.")

        success = self.repo.update_variant(product_id, sku_clean, update_data)
        if not success:
            raise ValueError(f"No se encontró la variante '{sku}' o no hubo cambios.")
        return True

    def process_purchase(self, sku: str, cantidad: int):
        if cantidad <= 0:
            raise ValueError("La cantidad a comprar debe ser mayor a 0.")
            
        actualizado = self.repo.decrease_stock(sku.strip().upper(), cantidad)
        if not actualizado:
            raise ValueError(f"Operación rechazada: La variante '{sku}' tiene stock 0 o insuficiente.")
        return True