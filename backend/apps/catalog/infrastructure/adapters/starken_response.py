import math

# Nombres de los campos de la respuesta de Starken.
CAMPO_MONTO = "valor"
CAMPO_PLAZO = "plazo_entrega"


def procesar_respuesta_starken(respuesta: dict) -> dict:
    """Convierte la respuesta de Starken en una tarifa normalizada."""
    if not isinstance(respuesta, dict):
        raise ValueError("Respuesta de Starken inválida: el cuerpo debe ser un objeto.")

    valor_crudo = respuesta.get(CAMPO_MONTO)
    if isinstance(valor_crudo, bool) or valor_crudo is None:
        raise ValueError("Respuesta de Starken inválida: no trae el valor del envío.")

    try:
        valor_float = float(valor_crudo)
        if not math.isfinite(valor_float):
            raise ValueError("Valor no finito.")
        monto = int(valor_float)
    except (TypeError, ValueError, OverflowError):
        raise ValueError("Respuesta de Starken inválida: no trae el valor del envío.")

    if monto < 0:
        raise ValueError("Respuesta de Starken inválida: valor de envío negativo.")

    plazo = respuesta.get(CAMPO_PLAZO)
    plazo_dias = (
        int(plazo)
        if not isinstance(plazo, bool)
        and isinstance(plazo, (int, float, str))
        and str(plazo).isdigit()
        and int(plazo) > 0
        else None
    )
    return {
        "operador": "Starken",
        "monto": monto,
        "moneda": "CLP",
        "plazo_dias": plazo_dias,
    }