
# Estructura de la respuesta de Chilexpress
CAMPO_DATOS = "data"
CAMPO_SERVICIOS = "courierServiceOptions"
CAMPO_MONTO = "serviceValue"


def procesar_respuesta_chilexpress(respuesta: dict) -> dict:
    """Convierte la respuesta de Chilexpress en una tarifa normalizada.

    Chilexpress devuelve varios servicios; se elige el de menor valor.
    """
    servicios = (respuesta.get(CAMPO_DATOS) or {}).get(CAMPO_SERVICIOS) or []
    montos = []
    for servicio in servicios:
        try:
            montos.append(int(float(servicio[CAMPO_MONTO])))
        except (KeyError, TypeError, ValueError):
            continue
    if not montos or min(montos) < 0:
        raise ValueError("Respuesta de Chilexpress inválida: no trae servicios con valor.")

    return {
        "operador": "Chilexpress",
        "monto": min(montos),
        "moneda": "CLP",
        "plazo_dias": None,
    }
