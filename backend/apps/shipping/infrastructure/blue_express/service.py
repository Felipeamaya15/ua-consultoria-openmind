"""Cotización y validación de una unidad del catálogo MongoDB."""

from hashlib import sha256

from .catalog_packages import package_for_catalog_item
from .client import BlueExpressClient
from .config import get_service_config
from .geography import fetch_geography
from .origin import origin_for_store
from .pricing import parse_pricing_response
from .quotation import build_pricing_payload
from .quote_tokens import issue_quote_token, validate_quote_token


class BlueExpressCartError(ValueError):
    """El carrito no está soportado por esta etapa de la integración."""


def _prepare_quote(
    *,
    store_id,
    product_id,
    sku,
    destination,
    quantity,
):
    if type(quantity) is not int or quantity != 1:
        raise BlueExpressCartError(
            "Por ahora Blue Express permite cotizar una sola unidad."
        )

    config = get_service_config("pricing")

    item = package_for_catalog_item(
        store_id=store_id,
        product_id=product_id,
        sku=sku,
    )

    regions = fetch_geography()
    origin = origin_for_store(
        store_id=store_id,
        regions=regions,
    )

    payload = build_pricing_payload(
        regions,
        origin=origin,
        destination=destination,
        **item["measures"],
    )

    # No se incluyen tokens ni claves en el contexto firmado.
    account_fingerprint = sha256(
        config["client_account"].encode("utf-8")
    ).hexdigest()

    context = {
        "store_id": str(store_id),
        "product_id": item["product_id"],
        "sku": item["sku"],
        "quantity": quantity,
        "environment": config["environment"],
        "pricing_url": config["url"],
        "account_fingerprint": account_fingerprint,
        "destination": {
            "region_code": destination["region_code"],
            "commune_code": destination["commune_code"],
            "district_code": payload["to"]["district"],
        },
        "origin": origin,
        "request": payload,
    }

    return payload, context


def quote_catalog_product(
    *,
    store_id,
    product_id,
    sku,
    destination,
    quantity=1,
):
    """Consulta Blue y firma una respuesta construida por el servidor."""
    payload, context = _prepare_quote(
        store_id=store_id,
        product_id=product_id,
        sku=sku,
        destination=destination,
        quantity=quantity,
    )

    response = BlueExpressClient().request_json(
        "pricing",
        method="POST",
        payload=payload,
    )
    parsed = parse_pricing_response(response)
    estimated_date = parsed["fecha_estimada_entrega"]

    # Decimal y date se convierten explícitamente para JSON.
    quote = {
        "proveedor": parsed["proveedor"],
        "servicio": payload["serviceType"],
        "tarifa": format(parsed["tarifa"], "f"),
        "flete": format(parsed["flete"], "f"),
        "servicio_adicional": format(parsed["servicio_adicional"], "f"),
        "total": format(parsed["total"], "f"),
        "fecha_estimada_entrega": (
            estimated_date.isoformat() if estimated_date else None
        ),
        "producto_mongo_id": context["product_id"],
        "sku": context["sku"],
        "cantidad": quantity,
    }

    token = issue_quote_token(context=context, quote=quote)

    return {
        **quote,
        "cotizacion": token,
    }


def validate_catalog_quote(
    *,
    token,
    store_id,
    product_id,
    sku,
    destination,
    quantity=1,
):
    """
    Reconstruye el contexto y valida la cotización firmada.

    Consulta el catálogo territorial, pero no vuelve a solicitar precio.
    No crea pedidos ni emite despachos.
    """
    _, context = _prepare_quote(
        store_id=store_id,
        product_id=product_id,
        sku=sku,
        destination=destination,
        quantity=quantity,
    )

    return validate_quote_token(
        token=token,
        expected_context=context,
    )