"""Lectura y validación del origen de despacho por tienda."""

from apps.core.models import OrigenDespachoBlue

from .geography import resolve_destination


class BlueExpressOriginError(ValueError):
    """La tienda no tiene un origen de despacho completo."""


def origin_for_store(*, store_id, regions):
    record = OrigenDespachoBlue.objects.filter(
        tienda_id=store_id,
    ).first()

    if record is None:
        raise BlueExpressOriginError(
            "La tienda no tiene configurado su origen de despacho Blue."
        )

    required_text = {
        "dirección": record.direccion,
        "nombre del remitente": record.nombre_remitente,
        "teléfono": record.telefono,
    }

    for label, value in required_text.items():
        if not isinstance(value, str) or not value.strip():
            raise BlueExpressOriginError(
                f"Falta completar {label} en el origen de despacho."
            )

    codes = {
        "region_code": record.region_code,
        "commune_code": record.commune_code,
        "district_code": record.district_code,
    }

    # Confirma que la localidad pertenece a la comuna y región guardadas.
    validated = resolve_destination(regions, **codes)

    return {
        "region_code": validated["region_code"],
        "commune_code": validated["commune_code"],
        "district_code": validated["district_code"],
    }