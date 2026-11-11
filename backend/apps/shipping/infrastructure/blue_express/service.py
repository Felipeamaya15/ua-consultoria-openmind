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

# API de carrito: conserva el endpoint unitario para clientes existentes.
def _prepare_cart(*, store_id, items, destination):
    import json
    from .cart import package_for_cart
    config = get_service_config("pricing")
    cart = package_for_cart(store_id=store_id, items=items)
    regions = fetch_geography()
    origin = origin_for_store(store_id=store_id, regions=regions)
    payload = build_pricing_payload(regions, origin=origin, destination=destination, **cart["measures"])
    context = {
        "mode": "cart-v1", "store_id": str(store_id),
        "cart_hash": sha256(json.dumps(cart["items"], sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "environment": config["environment"], "pricing_url": config["url"],
        "account_fingerprint": sha256(config["client_account"].encode()).hexdigest(),
        "destination": {"region_code": destination["region_code"], "commune_code": destination["commune_code"],
                        "district_code": payload["to"]["district"]},
        "origin": origin, "request": payload,
    }
    return payload, context, cart


def quote_catalog_cart(*, store_id, items, destination):
    from time import time
    from .cart import normalize_items
    from .quote_tokens import QUOTE_MAX_AGE
    items = normalize_items(items)
    if len(items) == 1 and items[0]["cantidad"] == 1:
        line = items[0]
        result = quote_catalog_product(store_id=store_id, product_id=line["producto_id"],
            sku=line["sku"], quantity=1, destination=destination)
        return {**result, "items": items, "vence_en": int(time()) + QUOTE_MAX_AGE}
    payload, context, cart = _prepare_cart(store_id=store_id, items=items, destination=destination)
    parsed = parse_pricing_response(BlueExpressClient().request_json("pricing", method="POST", payload=payload))
    estimated = parsed["fecha_estimada_entrega"]
    quote = {"proveedor": parsed["proveedor"], "servicio": payload["serviceType"],
        **{key: format(parsed[key], "f") for key in ("tarifa", "flete", "servicio_adicional", "total")},
        "fecha_estimada_entrega": estimated.isoformat() if estimated else None,
        "items": items, "cantidad": sum(line["cantidad"] for line in items),
        "vence_en": int(time()) + QUOTE_MAX_AGE}
    return {**quote, "cotizacion": issue_quote_token(context=context, quote=quote)}


def validate_catalog_cart(*, token, store_id, items, destination):
    from .cart import normalize_items
    items = normalize_items(items)
    if len(items) == 1 and items[0]["cantidad"] == 1:
        line = items[0]
        return validate_catalog_quote(token=token, store_id=store_id,
            product_id=line["producto_id"], sku=line["sku"], quantity=1, destination=destination)
    _, context, _ = _prepare_cart(store_id=store_id, items=items, destination=destination)
    return validate_quote_token(token=token, expected_context=context)
