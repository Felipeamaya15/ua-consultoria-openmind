from typing import Dict, Any
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.domain.stock import validate_stock

class VariantService:
    def __init__(self, repository=None):
        self.repo = repository if repository is not None else ProductRepository()

    def create_variant(self, tienda_id: str, product_id: str, variant_data: Dict[str, Any]):
        variant_data = dict(variant_data)
        variant_data["sku"] = variant_data["sku"].strip().upper()
        if variant_data.get("precio", 0) < 0:
            raise ValueError("El precio no puede ser negativo.")
        validate_stock(variant_data.get("stock", 0))
            
        success = self.repo.add_variant(tienda_id, product_id, variant_data)
        if not success:
            raise ValueError("No se pudo agregar la variante o el producto no existe.")
        return variant_data

    def update_variant(self, tienda_id: str, product_id: str, sku: str, update_data: Dict[str, Any]):
        sku_clean = sku.strip().upper()
        if "precio" in update_data and update_data["precio"] < 0:
            raise ValueError("El precio no puede ser negativo.")
        if "stock" in update_data:
            validate_stock(update_data["stock"])

        success = self.repo.update_variant(tienda_id, product_id, sku_clean, update_data)
        if not success:
            raise ValueError(f"No se encontró la variante '{sku}' o no hubo cambios.")
        return True

    def process_purchase(self, tienda_id: str, sku: str, cantidad: int):
        validate_stock(cantidad)
        if cantidad <= 0:
            raise ValueError("La cantidad a comprar debe ser mayor a 0.")
            
        # Ejecuta la validación atómica (RN-03)
        actualizado = self.repo.decrease_stock(tienda_id, sku.strip().upper(), cantidad)
        if not actualizado:
            raise ValueError(f"Operación rechazada: La variante '{sku}' tiene stock 0 o insuficiente.")
        return True

    def update_stock(self, tienda_id: str, product_id: str, sku: str, stock: int):
        validate_stock(stock)
        # El SKU de la URL identifica el dato ya persistido; no cambia su formato.
        return self.repo.update_variant_stock(tienda_id, product_id, sku, stock)
