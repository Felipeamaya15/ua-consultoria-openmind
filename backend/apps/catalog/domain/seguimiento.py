import re
import unicodedata
from enum import Enum
from typing import Optional


class EstadoSeguimiento(str, Enum):
    EN_ORIGEN = "En origen"
    EN_TRANSITO = "En tránsito"
    EN_REPARTO = "En reparto"


_REGLAS = (
    (EstadoSeguimiento.EN_TRANSITO, r"centro|hub|clasificacion|terminal|bodega|consolidacion"),
    (EstadoSeguimiento.EN_REPARTO, r"(^|_)(reparto|distribucion|ultima_milla|entrega|entrega_final)($|_)|ruta_de_entrega"),
    (EstadoSeguimiento.EN_TRANSITO, r"transito|traslad|en_ruta|en_viaje|en_camino|despachad|enviad|interurbano|regional"),
    (EstadoSeguimiento.EN_ORIGEN, r"origen|cread|emitid|recepcion|recibid|ingres|admitid|admision|retirad|recolectad|registrad|etiqueta"),
)


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto)
    sin_tildes = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "_", sin_tildes).strip("_")


def estandarizar_estado(estado_operador: str) -> Optional[EstadoSeguimiento]:
    if estado_operador is not None and not isinstance(estado_operador, str):
        raise ValueError("El estado logístico debe ser texto.")
    texto = _normalizar(estado_operador or "")
    for estado, patron in _REGLAS:
        if re.search(patron, texto):
            return estado
    return None
