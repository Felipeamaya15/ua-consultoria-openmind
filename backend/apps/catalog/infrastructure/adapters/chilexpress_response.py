import math

# Estructura de la respuesta de Chilexpress
CAMPO_DATOS = "data"
CAMPO_SERVICIOS = "courierServiceOptions"
CAMPO_MONTO = "serviceValue"


def procesar_respuesta_chilexpress(respuesta: dict) -> dict:
    """Convierte la respuesta de Chilexpress en una tarifa normalizada.

    Chilexpress devuelve varios servicios; se elige el de menor valor.
    """
    if not isinstance(respuesta, dict):
        raise ValueError("Respuesta de Chilexpress inválida: el cuerpo debe ser un objeto.")

    datos = respuesta.get(CAMPO_DATOS)
    if not isinstance(datos, dict):
        raise ValueError("Respuesta de Chilexpress inválida: no trae el bloque de datos.")

    servicios = datos.get(CAMPO_SERVICIOS)
    if not isinstance(servicios, list) or not servicios:
        raise ValueError("Respuesta de Chilexpress inválida: no trae servicios con valor.")

    montos = []
    for servicio in servicios:
        if not isinstance(servicio, dict):
            continue
        valor_crudo = servicio.get(CAMPO_MONTO)
        if isinstance(valor_crudo, bool) or valor_crudo is None:
            continue
        try:
            valor_float = float(valor_crudo)
            if not math.isfinite(valor_float):
                continue
            montos.append(int(valor_float))
        except (TypeError, ValueError, OverflowError):
            continue

    if not montos or min(montos) < 0:
        raise ValueError("Respuesta de Chilexpress inválida: no trae servicios con valor.")

    return {
        "operador": "Chilexpress",
        "monto": min(montos),
        "moneda": "CLP",
        "plazo_dias": None,
    }