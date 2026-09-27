from typing import Dict, Any
from apps.catalog.infrastructure.repositories import ProductRepository

class VariantService:
    def __init__(self):
        self.repo = ProductRepository()

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
            
        # Ejecuta la validación atómica (RN-03)
        actualizado = self.repo.decrease_stock(sku.strip().upper(), cantidad)
        if not actualizado:
            raise ValueError(f"Operación rechazada: La variante '{sku}' tiene stock 0 o insuficiente.")
        return True