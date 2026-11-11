"""Adaptación de la cotización Blue al contrato del checkout."""

from decimal import Decimal, InvalidOperation
import unicodedata

from django.conf import settings

from apps.core.shipping import ErrorCotizacion, canonical_region
from apps.shipping.infrastructure.blue_express.client import BlueExpressAPIError
from apps.shipping.infrastructure.blue_express.config import (
    BlueExpressConfigurationError,
)
from apps.shipping.infrastructure.blue_express.geography import (
    fetch_geography,
    resolve_destination,
)
from apps.shipping.infrastructure.blue_express.service import (
    validate_catalog_quote,
    validate_catalog_cart,
)


def _normalized_name(value):
    text = unicodedata.normalize("NFKD", str(value).strip())
    text = "".join(
        character for character in text
        if not unicodedata.combining(character)
    )
    return " ".join(text.casefold().split())


def blue_quote_for_checkout(tienda, data):
    if not getattr(settings, "BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED", False):
        raise ErrorCotizacion(
            "cotizacion",
            "Blue Express todavía no está disponible para completar compras.",
            "BLUE_CHECKOUT_NO_DISPONIBLE",
        )

    items = data.get("items", [])
    destination = data.get("destino_blue")
    address = data.get("direccion", {})

    if not isinstance(destination, dict):
        raise ErrorCotizacion(
            "destino_blue",
            "Selecciona un destino de Blue Express.",
            "DESTINO_INVALIDO",
        )

    try:
        if len(items) == 1 and items[0].get("cantidad") == 1:
            item = items[0]
            quote = validate_catalog_quote(token=data.get("cotizacion"), store_id=tienda.pk,
                product_id=item["producto_id"], sku=item["sku"], quantity=1, destination=destination)
        else:
            quote = validate_catalog_cart(token=data.get("cotizacion"), store_id=tienda.pk,
                items=items, destination=destination)

        resolved = resolve_destination(
            fetch_geography(),
            **destination,
        )
    except BlueExpressConfigurationError:
        raise ErrorCotizacion(
            "cotizacion",
            "Blue Express no está disponible.",
            "BLUE_NO_DISPONIBLE",
        ) from None
    except BlueExpressAPIError:
        raise ErrorCotizacion(
            "cotizacion",
            "No se pudo verificar el envío con Blue Express. Intenta nuevamente.",
            "BLUE_PROVEEDOR_ERROR",
        ) from None
    except ValueError as error:
        raise ErrorCotizacion(
            "cotizacion",
            str(error),
            "BLUE_COTIZACION_INVALIDA",
        ) from None

    expected_region = _normalized_name(resolved["region_name"])
    actual_region = _normalized_name(
        canonical_region(address.get("region", ""))
    )
    expected_commune = _normalized_name(resolved["commune_name"])
    actual_commune = _normalized_name(address.get("city", ""))

    if actual_region != expected_region or actual_commune != expected_commune:
        raise ErrorCotizacion(
            "direccion",
            "La región o comuna de la dirección no coincide con el destino cotizado.",
            "DESTINO_INVALIDO",
        )

    try:
        raw_total = quote.get("total")
        if isinstance(raw_total, bool):
            raise ValueError
        amount = Decimal(str(raw_total))
        if (
            not amount.is_finite()
            or amount < 0
            or amount > Decimal("9999999999.99")
            or amount != amount.to_integral_value()
        ):
            raise ValueError
    except (InvalidOperation, TypeError, ValueError):
        raise ErrorCotizacion(
            "cotizacion",
            "El importe de Blue Express no es válido para cobrar en pesos enteros.",
            "BLUE_IMPORTE_INVALIDO",
        ) from None

    return {
        "operador": "Blue Express",
        "servicio": quote["servicio"],
        "monto": format(amount, ".0f"),
        "moneda": "CLP",
        "plazo_dias": None,
        "fecha_estimada_entrega": quote.get("fecha_estimada_entrega"),
        "region": resolved["region_name"],
        "comuna": resolved["commune_name"],
        "destino_blue": {
            "region_code": resolved["region_code"],
            "commune_code": resolved["commune_code"],
            "district_code": resolved["district_code"],
        },
        "items": [{"producto_id": row["producto_id"], "sku": row["sku"], "cantidad": row["cantidad"]} for row in items],
        **({"producto_mongo_id": quote["producto_mongo_id"], "sku": quote["sku"], "cantidad": quote["cantidad"]}
           if "producto_mongo_id" in quote else {}),
        "origen": "blue_express_api",
    }