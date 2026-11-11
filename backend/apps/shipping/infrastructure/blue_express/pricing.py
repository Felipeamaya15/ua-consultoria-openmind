"""Normalización de respuestas de cotización de Blue Express."""

from datetime import datetime
from decimal import Decimal, InvalidOperation

from .client import BlueExpressAPIError


def _amount(data, field):
    value = data.get(field)

    if isinstance(value, bool) or not isinstance(
        value, (str, int, float, Decimal)
    ):
        raise BlueExpressAPIError(
            f"La cotización de Blue contiene un importe inválido: {field}."
        )

    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise BlueExpressAPIError(
            f"La cotización de Blue contiene un importe inválido: {field}."
        ) from None

    if not amount.is_finite() or amount < 0:
        raise BlueExpressAPIError(
            f"La cotización de Blue contiene un importe inválido: {field}."
        )

    return amount


def parse_pricing_response(payload):
    """Conserva los importes por separado, sin calcular impuestos ni recargos."""
    if not isinstance(payload, dict) or payload.get("status") is not True:
        raise BlueExpressAPIError(
            "Blue Express no confirmó una cotización exitosa."
        )

    data = payload.get("data")
    if not isinstance(data, dict):
        raise BlueExpressAPIError(
            "Blue Express devolvió una cotización sin datos válidos."
        )

    amounts = {
        field: _amount(data, field)
        for field in ("tarifa", "flete", "servicioAdicional", "total")
    }

    raw_date = data.get("fechaEstimadaEntrega")
    estimated_date = None

    if raw_date is not None and raw_date != "":
        if not isinstance(raw_date, str):
            raise BlueExpressAPIError(
                "La fecha estimada de Blue Express es inválida."
            )

        try:
            estimated_date = datetime.strptime(
                raw_date, "%d-%m-%Y"
            ).date()
        except ValueError:
            raise BlueExpressAPIError(
                "La fecha estimada de Blue Express es inválida."
            ) from None

    return {
        "proveedor": "BLUE_EXPRESS",
        "tarifa": amounts["tarifa"],
        "flete": amounts["flete"],
        "servicio_adicional": amounts["servicioAdicional"],
        "total": amounts["total"],
        "fecha_estimada_entrega": estimated_date,
    }