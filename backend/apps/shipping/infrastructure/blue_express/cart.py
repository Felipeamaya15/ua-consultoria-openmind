"""Carrito canónico y medidas equivalentes BX-Pricing (no embalaje de emisión)."""
from decimal import Decimal, ROUND_CEILING, localcontext

from .catalog_packages import package_for_catalog_item
from .quotation import _positive_measure

MAX_LINES = 100
MAX_QUANTITY = 100000


class BlueExpressCartError(ValueError):
    pass


def normalize_items(items):
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_LINES:
        raise BlueExpressCartError("El carrito debe contener entre 1 y 100 líneas.")
    result, seen = [], set()
    for item in items:
        if not isinstance(item, dict) or set(item) != {"producto_id", "sku", "cantidad"}:
            raise BlueExpressCartError("Cada línea requiere producto_id, sku y cantidad.")
        product, sku, quantity = item["producto_id"], item["sku"], item["cantidad"]
        if (not isinstance(product, str) or not product.strip() or len(product) > 100
                or not isinstance(sku, str) or not sku.strip() or len(sku) > 100
                or type(quantity) is not int or not 1 <= quantity <= MAX_QUANTITY):
            raise BlueExpressCartError("El carrito contiene identificadores o cantidades inválidos.")
        key = (product.strip(), sku.strip())
        if key in seen:
            raise BlueExpressCartError("No repitas una línea del mismo producto y SKU.")
        seen.add(key)
        result.append({"producto_id": key[0], "sku": key[1], "cantidad": quantity})
    return sorted(result, key=lambda item: (item["producto_id"], item["sku"]))


def package_for_cart(*, store_id, items):
    lines, physical, volume, seen = [], Decimal(0), Decimal(0), set()
    for line in normalize_items(items):
        item = package_for_catalog_item(store_id=store_id, product_id=line["producto_id"], sku=line["sku"])
        key = (item["product_id"], item["sku"])
        if key in seen:
            raise BlueExpressCartError("El carrito contiene dos referencias al mismo SKU.")
        seen.add(key)
        measures = {k: Decimal(_positive_measure(v, k)) for k, v in item["measures"].items()}
        quantity = line["cantidad"]
        physical += measures["weight_kg"] * quantity
        volume += measures["length_cm"] * measures["width_cm"] * measures["height_cm"] * quantity
        lines.append({"producto_id": key[0], "sku": key[1], "cantidad": quantity,
                      "measures": {k: format(v, "f") for k, v in measures.items()}})
    # Lado equivalente de volumen total; redondeo hacia arriba evita subcotizar.
    # No representa largo/ancho/alto físicos para emitir una orden de servicio.
    with localcontext() as ctx:
        ctx.prec = 50
        low, high = Decimal(0), max(Decimal(1), volume)
        for _ in range(200):
            mid = (low + high) / 2
            if mid ** 3 < volume:
                low = mid
            else:
                high = mid
        side = high.quantize(Decimal("0.01"), rounding=ROUND_CEILING)
        # Corrige únicamente el residuo numérico en raíces exactamente centesimales.
        if (side - Decimal("0.01")) ** 3 >= volume:
            side -= Decimal("0.01")
    measures = {"weight_kg": _positive_measure(physical, "Peso total"),
                **{k: _positive_measure(side, k) for k in ("length_cm", "width_cm", "height_cm")}}
    return {"items": sorted(lines, key=lambda item: (item["producto_id"], item["sku"])), "measures": measures}
