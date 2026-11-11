"""Servicio de cotización de una unidad del catálogo MongoDB."""

from .catalog_packages import package_for_catalog_item
from .client import BlueExpressClient
from .config import get_service_config
from .geography import fetch_geography
from .origin import origin_for_store
from .pricing import parse_pricing_response
from .quotation import build_pricing_payload


class BlueExpressCartError(ValueError):
    """El carrito no está soportado por esta etapa de la integración."""


def quote_catalog_product(
    *,
    store_id,
    product_id,
    sku,
    destination,
    quantity=1,
):
    """
    Cotiza una unidad embalada del catálogo utilizado por el checkout.

    store_id debe provenir de la tienda resuelta por el backend.
    No crea pedidos, reserva stock ni emite despachos.
    """
    if type(quantity) is not int or quantity != 1:
        raise BlueExpressCartError(
            "Por ahora Blue Express permite cotizar una sola unidad."
        )

    get_service_config("pricing")

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

    response = BlueExpressClient().request_json(
        "pricing",
        method="POST",
        payload=payload,
    )

    return {
        **parse_pricing_response(response),
        "servicio": payload["serviceType"],
        "producto_mongo_id": item["product_id"],
        "sku": item["sku"],
        "cantidad": quantity,
    }