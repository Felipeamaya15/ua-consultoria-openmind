from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class Variante:
    sku: str
    precio: float
    stock: int
    atributos: Dict[str, Any]
    es_activa: bool = True

    def __post_init__(self):
        self.sku = self.sku.strip().upper()
        if self.precio < 0:
            raise ValueError("El precio no puede ser negativo.")
        if self.stock < 0:
            raise ValueError("El stock no puede ser negativo.")