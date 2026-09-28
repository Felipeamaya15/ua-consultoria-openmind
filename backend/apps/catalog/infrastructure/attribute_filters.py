from typing import Any, Dict, List, Set

ATTR_PARAM_PREFIX = "attr."
MAX_ATTR_KEYS = 20
MAX_VALUES_PER_KEY = 50


class FiltrosAtributosInvalidos(ValueError):
    """Se enviaron demasiadas claves o valores en los filtros de atributos."""


def parse_attribute_params(
    query_params, prefix: str = ATTR_PARAM_PREFIX
) -> Dict[str, List[str]]:
    """Lee `?attr.color=Negro&attr.color=Rojo&attr.talla=M` -> {'color': [...], 'talla': ['M']}."""
    atributos: Dict[str, List[str]] = {}
    for param in query_params.keys():
        if not param.startswith(prefix):
            continue
        clave = param[len(prefix):].strip()
        valores = [v.strip() for v in query_params.getlist(param) if v.strip()]
        if clave and valores:
            atributos[clave] = list(dict.fromkeys(valores)) 

    if len(atributos) > MAX_ATTR_KEYS or any(
        len(valores) > MAX_VALUES_PER_KEY for valores in atributos.values()
    ):
        raise FiltrosAtributosInvalidos("Se enviaron demasiados filtros de atributos.")
    return atributos


def build_attribute_query(
    base_query: Dict[str, Any],
    atributos: Dict[str, List[str]],
    variant_claves: Set[str],
    ) -> Dict[str, Any]:
    
    if not atributos:
        return base_query

    query = dict(base_query)
    conditions: List[Dict[str, Any]] = []
    variant_conditions: List[Dict[str, Any]] = []

    for clave, valores in sorted(atributos.items()):
        match = {"$elemMatch": {"clave": clave, "valor": {"$in": list(valores)}}}
        if clave in variant_claves:
            variant_conditions.append({"atributos_variante": match})
        else:
            conditions.append({"atributos_generales": match})

    if variant_conditions:
        conditions.append({"variantes": {"$elemMatch": {"$and": variant_conditions}}})

    if conditions:
        query["$and"] = query.get("$and", []) + conditions
    return query