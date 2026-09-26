from typing import List, Dict, Any, Optional

from apps.catalog.infrastructure.repositories import ProductRepository


class ListPublicProductsUseCase:

    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(
        self, tienda_id: str, atributos: Optional[Dict[str, List[str]]] = None
    ) -> List[Dict[str, Any]]:
        return self.repository.list_by_store(tienda_id, activo=True, atributos=atributos)

class GetPublicProductDetailUseCase:
    """Obtiene el detalle de un producto activo, identificado por su slug."""
 
    def __init__(self, repository: ProductRepository):
        self.repository = repository
 
    def execute(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        producto = self.repository.get_by_slug(tienda_id, slug)
        if producto is None or not producto.get("activo", False):
            return None
        return producto


class GetPublicProductAttributesUseCase:
    """
    Obtiene los atributos personalizados de un producto activo :
    - atributos_generales
    - atributos_variante
    """
 
    def __init__(self, repository: ProductRepository):
        self.repository = repository
 
    def execute(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        producto = self.repository.get_by_slug(tienda_id, slug)
        if producto is None or not producto.get("activo", False):
            return None
 
        return {
            "atributos_generales": producto.get("atributos_generales") or [],
            "atributos_variante": self._agrupar_atributos_variante(
                producto.get("variantes") or []
            ),
        }
 
    def _agrupar_atributos_variante(self, variantes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        agrupados: Dict[str, Dict[str, Any]] = {}
        for variante in variantes:
            for attr in variante.get("atributos_variante") or []:
                clave = attr.get("clave")
                if not clave:
                    continue
                entry = agrupados.setdefault(
                    clave, {"clave": clave, "etiqueta": attr.get("etiqueta"), "valores": []}
                )
                valor = attr.get("valor")
                if valor is not None and valor not in entry["valores"]:
                    entry["valores"].append(valor)
        return list(agrupados.values())