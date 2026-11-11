"""Lectura del catálogo territorial de Blue Express."""

from .client import BlueExpressAPIError, BlueExpressClient


def _object(value):
    if not isinstance(value, dict):
        raise BlueExpressAPIError("Objeto territorial de Blue inválido.")
    return value


def _list(value):
    if not isinstance(value, list):
        raise BlueExpressAPIError("Lista territorial de Blue inválida.")
    return value


def _name(value):
    if not isinstance(value, str) or not value.strip():
        raise BlueExpressAPIError("Nombre territorial de Blue inválido.")
    return value.strip()


def _number(value):
    if type(value) is not int or value <= 0:
        raise BlueExpressAPIError("Código territorial numérico inválido.")
    return value


def parse_geography(payload):
    """Normaliza regiones, comunas y localidades sin elegir un destino."""
    payload = _object(payload)

    if payload.get("status") is not True:
        raise BlueExpressAPIError(
            "Blue Express no confirmó la consulta territorial."
        )

    countries = [_object(item) for item in _list(payload.get("data"))]
    chile = [item for item in countries if item.get("code") == "CL"]

    if len(chile) != 1:
        raise BlueExpressAPIError(
            "El catálogo debe contener exactamente una entrada para Chile."
        )

    regions = []

    for raw_region in _list(chile[0].get("states")):
        raw_region = _object(raw_region)
        communes = []

        for raw_commune in _list(raw_region.get("ciudades")):
            raw_commune = _object(raw_commune)
            districts = []

            for raw_district in _list(raw_commune.get("districts")):
                raw_district = _object(raw_district)
                districts.append({
                    "code": _name(raw_district.get("code")),
                    "name": _name(raw_district.get("name")),
                })

            communes.append({
                "code": _number(raw_commune.get("code")),
                "name": _name(raw_commune.get("name")),
                "districts": districts,
            })

        regions.append({
            "code": _number(raw_region.get("code")),
            "name": _name(raw_region.get("name")),
            "communes": communes,
        })

    if not regions:
        raise BlueExpressAPIError("Blue devolvió un catálogo sin regiones.")

    return regions


def fetch_geography():
    payload = BlueExpressClient().request_json("geo")
    return parse_geography(payload)

class BlueExpressDestinationError(ValueError):
    """El destino seleccionado no corresponde al catálogo territorial."""


def resolve_destination(regions, *, region_code, commune_code, district_code):
    """Valida un destino explícito; no selecciona localidades automáticamente."""
    if (
        type(region_code) is not int
        or type(commune_code) is not int
        or not isinstance(district_code, str)
        or not district_code.strip()
    ):
        raise BlueExpressDestinationError(
            "Selecciona una región, comuna y localidad válidas."
        )

    district_code = district_code.strip()

    matching_regions = [
        region for region in regions
        if region["code"] == region_code
    ]
    if len(matching_regions) != 1:
        raise BlueExpressDestinationError(
            "La región no existe o es ambigua en el catálogo de Blue."
        )

    region = matching_regions[0]
    matching_communes = [
        commune for commune in region["communes"]
        if commune["code"] == commune_code
    ]
    if len(matching_communes) != 1:
        raise BlueExpressDestinationError(
            "La comuna no pertenece a la región seleccionada "
            "o es ambigua en el catálogo."
        )

    commune = matching_communes[0]
    matching_districts = [
        district for district in commune["districts"]
        if district["code"] == district_code
    ]
    if len(matching_districts) != 1:
        raise BlueExpressDestinationError(
            "La localidad no pertenece a la comuna seleccionada "
            "o es ambigua en el catálogo."
        )

    district = matching_districts[0]

    return {
        "region_code": region["code"],
        "region_name": region["name"],
        "commune_code": commune["code"],
        "commune_name": commune["name"],
        "district_code": district["code"],
        "district_name": district["name"],
    }