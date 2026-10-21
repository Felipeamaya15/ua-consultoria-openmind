# Campos de respuesta de cada operador.
CAMPOS = {
    "Chilexpress": {
        "ruta_eventos": ("data", "statusList"),
        "fecha": "date",
        "estado": "status",
        "descripcion": "description",
        "ubicacion": "location",
    },
    "Starken": {
        "ruta_eventos": ("eventos",),
        "fecha": "fecha",
        "estado": "estado",
        "descripcion": "descripcion",
        "ubicacion": "ciudad",
    },
}


def _texto_limpio(evento: dict, campo: str, operador: str, obligatorio: bool = False) -> str:
    valor = evento.get(campo, "")
    if valor is None:
        valor = ""
    if not isinstance(valor, str):
        raise ValueError(
            f"Respuesta de seguimiento de {operador} inválida: el campo '{campo}' debe ser texto."
        )
    texto = valor.strip()
    if obligatorio and not texto:
        raise ValueError(
            f"Respuesta de seguimiento de {operador} inválida: falta el campo obligatorio '{campo}'."
        )
    return texto


def procesar_respuesta_seguimiento(operador: str, respuesta: dict) -> list[dict]:
    """Convierte la respuesta de seguimiento del operador en una lista de eventos."""
    if operador not in CAMPOS:
        raise ValueError(f"Operador logístico no soportado: {operador}")
    if not isinstance(respuesta, dict):
        raise ValueError(f"Respuesta de seguimiento de {operador} inválida: no es un objeto.")

    campos = CAMPOS[operador]

    eventos = respuesta
    for clave in campos["ruta_eventos"]:
        eventos = (eventos or {}).get(clave) if isinstance(eventos, dict) else None
    if not isinstance(eventos, list):
        raise ValueError(f"Respuesta de seguimiento de {operador} inválida: no trae eventos.")

    if any(not isinstance(evento, dict) for evento in eventos):
        raise ValueError(f"Respuesta de seguimiento de {operador} inválida: evento no es un objeto.")

    eventos_normalizados = []
    for evento in eventos:
        fecha = _texto_limpio(evento, campos["fecha"], operador)
        estado = _texto_limpio(evento, campos["estado"], operador)
        descripcion = _texto_limpio(evento, campos["descripcion"], operador)
        ubicacion = _texto_limpio(evento, campos["ubicacion"], operador)
        if not estado and not descripcion:
            raise ValueError(
                f"Respuesta de seguimiento de {operador} inválida: evento sin estado ni descripción."
            )
        eventos_normalizados.append({
            "fecha": fecha,
            "estado": estado,
            "descripcion": descripcion,
            "ubicacion": ubicacion,
        })

    return eventos_normalizados