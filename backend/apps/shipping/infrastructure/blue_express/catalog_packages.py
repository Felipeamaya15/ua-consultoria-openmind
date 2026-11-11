"""Obtiene las medidas de un SKU del catálogo utilizado por el checkout."""

from apps.catalog.domain.stock import is_variant_active
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.models import FichaLogisticaCatalogo

from .packages import BlueExpressCatalogError


def package_for_catalog_item(*, store_id, product_id, sku):
    repository = ProductRepository()

    product = (
        repository.get_by_id(str(store_id), str(product_id))
        or repository.get_by_slug(str(store_id), str(product_id))
    )

    if (
        not product
        or str(product.get("tienda_id")) != str(store_id)
        or not product.get("activo", False)
    ):
        raise BlueExpressCatalogError(
            "El producto no está disponible en esta tienda."
        )

    variants = [
        variant
        for variant in product.get("variantes", [])
        if variant.get("sku") == sku
    ]

    if len(variants) != 1 or not is_variant_active(variants[0]):
        raise BlueExpressCatalogError(
            "El SKU no existe, está duplicado o está inactivo."
        )

    mongo_id = str(product["_id"])

    record = FichaLogisticaCatalogo.objects.filter(
        tienda_id=store_id,
        producto_mongo_id=mongo_id,
        sku=sku,
    ).first()

    if record is None:
        raise BlueExpressCatalogError(
            "Faltan el peso y las dimensiones de este SKU."
        )

    measures = {
        "weight_kg": record.peso_kg,
        "length_cm": record.largo_cm,
        "width_cm": record.ancho_cm,
        "height_cm": record.alto_cm,
    }

    if any(
        value is None or not value.is_finite() or value <= 0
        for value in measures.values()
    ):
        raise BlueExpressCatalogError(
            "El SKU tiene medidas logísticas inválidas."
        )

    return {
        "product_id": mongo_id,
        "sku": sku,
        "measures": measures,
    }