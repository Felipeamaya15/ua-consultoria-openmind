from django.urls import path

from apps.catalog.presentation.views import (
    PublicProductListAPIView,
    PublicProductDetailAPIView,
    PublicProductAttributesAPIView,
    ProductDeleteAPIView,
    ProductoCreateView,
    ProductoAdminDetailView,
    ProductoUpdateView,
    ProductoStockUpdateView,
    ValidarDisponibilidadAPIView,
    VarianteStockUpdateView,
    ProductVariantsView,
    VariantPurchaseView,
)

urlpatterns = [
    # Catálogo público
    path(
        "productos/",
        PublicProductListAPIView.as_view(),
        name="mongo-productos-list",
    ),
    path(
            "productos/crear/",
            ProductoCreateView.as_view(),
            name="producto-crear",
    ),
    path(
        "productos/<str:slug>/",
        PublicProductDetailAPIView.as_view(),
        name="mongo-producto-detail",
    ),
    path(
        "productos/<str:slug>/atributos/",
        PublicProductAttributesAPIView.as_view(),
        name="mongo-producto-atributos",
    ),

    # Administración de productos
    path(
        "productos/<str:id_producto>/admin/",
        ProductoAdminDetailView.as_view(),
        name="producto-admin-detail",
    ),
    path(
        "productos/<str:id_producto>/actualizar/",
        ProductoUpdateView.as_view(),
        name="producto-actualizar",
    ),
    path(
        "productos/<str:id_producto>/stock/",
        ProductoStockUpdateView.as_view(),
        name="producto-stock",
    ),
    path(
        "productos/<str:id_producto>/eliminar/",
        ProductDeleteAPIView.as_view(),
        name="producto-eliminar",
    ),

    # Validación de disponibilidad
    path(
        "productos/<str:id_producto>/disponibilidad/",
        ValidarDisponibilidadAPIView.as_view(),
        name="producto-disponibilidad",
    ),

    # Variantes
    path(
        "productos/<str:id_producto>/variantes/",
        ProductVariantsView.as_view(),
        name="producto-variantes",
    ),
    path(
        "productos/<str:id_producto>/variantes/<str:sku>/",
        ProductVariantsView.as_view(),
        name="producto-variante-detalle",
    ),
    path(
        "productos/<str:id_producto>/variantes/<str:sku>/stock/",
        VarianteStockUpdateView.as_view(),
        name="variante-stock",
    ),
    path(
        "productos/<str:id_producto>/variantes/<str:sku>/comprar/",
        VariantPurchaseView.as_view(),
        name="variante-comprar",
    ),
    path(
        "productos/<str:id_producto>/variantes/<str:sku>/compra/",
        VariantPurchaseView.as_view(),
        name="variante-compra",
    ),
]