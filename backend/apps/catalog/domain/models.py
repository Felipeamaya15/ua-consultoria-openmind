import math
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Optional
from .stock import validate_stock


@dataclass
class Variante:
    sku: str
    precio: float
    stock: int
    atributos: Dict[str, Any]
    es_activa: bool = True
    precio_oferta: Optional[float] = None

    def __post_init__(self):
        self.sku = self.sku.strip().upper()
        if isinstance(self.precio, bool) or not isinstance(self.precio, (int, float)) or not math.isfinite(self.precio):
            raise ValueError("El precio debe ser un número finito válido.")
        if self.precio < 0:
            raise ValueError("El precio no puede ser negativo.")
        if self.precio_oferta is not None:
            if (
                isinstance(self.precio_oferta, bool)
                or not isinstance(self.precio_oferta, (int, float))
                or not math.isfinite(self.precio_oferta)
            ):
                raise ValueError("El precio de oferta debe ser un número finito válido.")
            if self.precio_oferta < 0:
                raise ValueError("El precio de oferta no puede ser negativo.")
            if self.precio_oferta >= self.precio:
                raise ValueError("El precio de oferta debe ser menor al precio normal.")
        validate_stock(self.stock)

    @property
    def tiene_oferta(self) -> bool:
        return self.precio_oferta is not None and 0 <= self.precio_oferta < self.precio

    @property
    def precio_efectivo(self) -> float:
        return self.precio_oferta if self.tiene_oferta else self.precio

    @property
    def porcentaje_descuento(self) -> int:
        if not self.tiene_oferta or self.precio <= 0:
            return 0
        descuento = (Decimal(str(self.precio)) - Decimal(str(self.precio_oferta))) / Decimal(str(self.precio)) * Decimal("100")
        return int(descuento.quantize(Decimal("1"), rounding=ROUND_HALF_UP))