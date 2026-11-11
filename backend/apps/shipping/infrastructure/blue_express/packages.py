"""Obtención de medidas del catálogo para cotizar una unidad embalada."""

from apps.core.models import FichaLogistica, Producto, VarianteProducto


class BlueExpressCatalogError(ValueError):
    """El producto no puede utilizarse para construir el paquete."""


def package_for_product(*, store_id, product_id, variant_id=None):
    """Obtiene medidas desde la base de datos, nunca desde el navegador."""
    product = Producto.objects.filter(
        pk=product_id,
        id_tienda_id=store_id,
        activo=True,
    ).first()

    if product is None:
        raise BlueExpressCatalogError(
            "El producto no está disponible en esta tienda."
        )

    if variant_id is not None:
        variant = VarianteProducto.objects.filter(
            pk=variant_id,
            id_producto_id=product.pk,
            es_activa=True,
        ).first()

        if variant is None:
            raise BlueExpressCatalogError(
                "La variante no está disponible para este producto."
            )

        record = FichaLogistica.objects.filter(
            variante_id=variant.pk,
        ).first()
    else:
        if VarianteProducto.objects.filter(
            id_producto_id=product.pk,
            es_activa=True,
        ).exists():
            raise BlueExpressCatalogError(
                "Selecciona una variante del producto para cotizar."
            )

        record = FichaLogistica.objects.filter(
            producto_id=product.pk,
        ).first()

    if record is None:
        raise BlueExpressCatalogError(
            "Faltan el peso y las dimensiones de este producto o variante."
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
            "El producto o variante tiene medidas logísticas inválidas."
        )

    return measures