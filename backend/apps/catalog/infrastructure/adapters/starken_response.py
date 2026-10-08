

# Nombres de los campos de la respuesta de Starken.
CAMPO_MONTO = "valor"
CAMPO_PLAZO = "plazo_entrega"


def procesar_respuesta_starken(respuesta: dict) -> dict:
    """Convierte la respuesta de Starken en una tarifa normalizada."""
    try:
        monto = int(float(respuesta[CAMPO_MONTO]))
    except (KeyError, TypeError, ValueError):
        raise ValueError("Respuesta de Starken inválida: no trae el valor del envío.")
    if monto < 0:
        raise ValueError("Respuesta de Starken inválida: valor de envío negativo.")

    plazo = respuesta.get(CAMPO_PLAZO)
    return {
        "operador": "Starken",
        "monto": monto,
        "moneda": "CLP",
        "plazo_dias": int(plazo) if isinstance(plazo, (int, float, str)) and str(plazo).isdigit() else None,
    }
