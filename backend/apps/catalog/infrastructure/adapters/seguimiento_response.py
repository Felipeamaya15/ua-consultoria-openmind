
# Campos de respuesta de cada operador.
CAMPOS = {
    "Chilexpress": {
        "ruta_eventos": ("data", "statusList"),
        "fecha": "date",
        "descripcion": "description",
        "ubicacion": "location",
    },
    "Starken": {
        "ruta_eventos": ("eventos",),
        "fecha": "fecha",
        "descripcion": "estado",
        "ubicacion": "ciudad",
    },
}


def procesar_respuesta_seguimiento(operador: str, respuesta: dict) -> list[dict]:
    """Convierte la respuesta de seguimiento del operador en una lista de eventos.

    """
    if operador not in CAMPOS:
        raise ValueError(f"Operador logístico no soportado: {operador}")
    campos = CAMPOS[operador]

    eventos = respuesta
    for clave in campos["ruta_eventos"]:
        eventos = (eventos or {}).get(clave) if isinstance(eventos, dict) else None
    if not isinstance(eventos, list):
        raise ValueError(f"Respuesta de seguimiento de {operador} inválida: no trae eventos.")

    if any(not isinstance(evento, dict) for evento in eventos):
        raise ValueError(f"Respuesta de seguimiento de {operador} inválida: evento no es un objeto.")

    return [
        {
            "fecha": evento.get(campos["fecha"], ""),
            "descripcion": evento.get(campos["descripcion"], ""),
            "ubicacion": evento.get(campos["ubicacion"], ""),
        }
        for evento in eventos
    ]
