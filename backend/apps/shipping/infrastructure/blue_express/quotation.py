"""Cotización Blue Express para un único bulto mediante servicio Express."""

from decimal import Decimal, InvalidOperation

from .client import BlueExpressClient
from .geography import resolve_destination
from .pricing import parse_pricing_response


class BlueExpressPackageError(ValueError):
    """El paquete contiene medidas inválidas."""


def _positive_measure(value, field):
    if isinstance(value, bool) or not isinstance(
        value, (str, int, float, Decimal)
    ):
        raise BlueExpressPackageError(
            f"{field} debe ser un número mayor que cero."
        )

    try:
        measure = Decimal(str(value))
    except InvalidOperation:
        raise BlueExpressPackageError(
            f"{field} debe ser un número mayor que cero."
        ) from None

    if not measure.is_finite() or measure <= 0:
        raise BlueExpressPackageError(
            f"{field} debe ser un número mayor que cero."
        )

    # Evita generar representaciones numéricas desproporcionadas.
    # Es un límite técnico de entrada, no un límite comercial de Blue.
    if measure > Decimal("1000000") or measure < Decimal("0.000001"):
        raise BlueExpressPackageError(
            f"{field} está fuera del rango técnico admitido."
        )

    return format(measure.normalize(), "f")


def build_pricing_payload(
    regions,
    *,
    origin,
    destination,
    weight_kg,
    length_cm,
    width_cm,
    height_cm,
):
    """Valida ambos destinos y construye el request para un bulto."""
    source = resolve_destination(regions, **origin)
    target = resolve_destination(regions, **destination)

    return {
        "from": {
            "country": "CL",
            "district": source["district_code"],
        },
        "to": {
            "country": "CL",
            "state": target["region_code"],
            "district": target["district_code"],
        },
        "serviceType": "EX",
        "serviciosComplementarios": None,
        "datosProducto": {
            "producto": "P",
            "familiaProducto": "PAQU",
            "largo": _positive_measure(length_cm, "Largo"),
            "ancho": _positive_measure(width_cm, "Ancho"),
            "alto": _positive_measure(height_cm, "Alto"),
            "pesoFisico": _positive_measure(weight_kg, "Peso"),
            "cantidadPiezas": 1,
            "unidades": 1,
        },
    }


def quote_single_package(
    regions,
    *,
    origin,
    destination,
    weight_kg,
    length_cm,
    width_cm,
    height_cm,
):
    """Solicita una cotización; no emite una orden de servicio."""
    payload = build_pricing_payload(
        regions,
        origin=origin,
        destination=destination,
        weight_kg=weight_kg,
        length_cm=length_cm,
        width_cm=width_cm,
        height_cm=height_cm,
    )

    response = BlueExpressClient().request_json(
        "pricing",
        method="POST",
        payload=payload,
    )

    return {
        **parse_pricing_response(response),
        "servicio": payload["serviceType"],
    }