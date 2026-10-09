import unicodedata
from enum import Enum
from typing import Optional


class EstadoSeguimiento(str, Enum):
    EN_ORIGEN = "En origen"
    EN_TRANSITO = "En tránsito"
    EN_REPARTO = "En reparto"


_PALABRAS = (
    (EstadoSeguimiento.EN_REPARTO, ("reparto", "ruta de entrega", "en entrega")),
    (EstadoSeguimiento.EN_TRANSITO, ("transito", "en camino", "trasladado", "centro de distribucion")),
    (EstadoSeguimiento.EN_ORIGEN, ("origen", "recibido", "retirado", "admitido", "ingresado")),
)


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto)
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn").lower()


def estandarizar_estado(estado_operador: str) -> Optional[EstadoSeguimiento]:
    if estado_operador is not None and not isinstance(estado_operador, str):
        raise ValueError("El estado logístico debe ser texto.")
    texto = _normalizar(estado_operador or "")
    for estado, palabras in _PALABRAS:
        if any(palabra in texto for palabra in palabras):
            return estado
    return None
