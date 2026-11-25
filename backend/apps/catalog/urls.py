from django.urls import path
from apps.catalog.presentation.product_media import PublicProductVideoView
from apps.catalog.presentation.product_feed_images import PublicProductMetaImageView

from apps.catalog.presentation.views import (
    PublicProductListAPIView,
    PublicProductDetailAPIView,
    PublicProductAttributesAPIView,
    ValidarDisponibilidadAPIView,
    ProductoCreateView,
    ProductoAdminDetailView,
    ProductoUpdateView,
    ProductoStockUpdateView,
    ProductDeleteAPIView,
    ProductPermanentDeleteAPIView,
    ProductoAdminListView,
    ProductVariantsView,
    VarianteStockUpdateView,
    VariantPurchaseView,
    CarritoItemsView,
    ModificarCantidadItemAPIView,
    ConfiguracionTransbankView,
    IniciarPagoTransbankView,
    ConfirmarPagoTransbankView,
    PagoAbortadoTransbankView,
    RetornoTransbankView,
    ConfiguracionPayPalView,
    ConfiguracionMercadoPagoView,
)

urlpatterns = [
    path('productos/<str:slug>/imagen-meta/<int:index>/', PublicProductMetaImageView.as_view(), name='producto-imagen-meta'),
    path('productos/<str:slug>/video/', PublicProductVideoView.as_view(), name='producto-video-publico'),
    path('productos/admin/listado/', ProductoAdminDetailView.as_view(), name='producto-admin-list'),
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
        "productos/admin/",
        ProductoAdminListView.as_view(),
        name="producto-admin-listado",
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
    path(
        "productos/<str:id_producto>/disponibilidad/",
        ValidarDisponibilidadAPIView.as_view(),
        name="producto-disponibilidad",
    ),

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
    path(
        "productos/<str:id_producto>/eliminar-definitivo/",
        ProductPermanentDeleteAPIView.as_view(),
        name="producto-eliminar-definitivo",
    ),

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

    path(
        "carrito/items/",
        CarritoItemsView.as_view(),
        name="carrito-items-collection",
    ),
    path(
        "carrito/items/<int:id_item_carrito>/",
        ModificarCantidadItemAPIView.as_view(),
        name="modificar-cantidad-item",
    ),


    path(
        "tiendas/<int:id_tienda>/configuracion/transbank/",
        ConfiguracionTransbankView.as_view(),
        name="tienda-configuracion-transbank",
    ),

    path(
        "pagos/transbank/iniciar/",
        IniciarPagoTransbankView.as_view(),
        name="pago-transbank-iniciar",
    ),
    path(
        "pagos/transbank/confirmar/",
        ConfirmarPagoTransbankView.as_view(),
        name="pago-transbank-confirmar",
    ),
    path(
        "pagos/transbank/retorno/",
        RetornoTransbankView.as_view(),
        name="pago-transbank-retorno",
    ),
    path(
        "pagos/transbank/abortado/",
        PagoAbortadoTransbankView.as_view(),
        name="pago-transbank-abortado",
    ),

    path(
        "tiendas/<int:id_tienda>/configuracion/paypal/",
        ConfiguracionPayPalView.as_view(),
        name="configuracion-paypal",
    ),

    path(
        "tiendas/<int:id_tienda>/configuracion/mercadopago/",
        ConfiguracionMercadoPagoView.as_view(),
        name="configuracion-mercadopago",
    ),
]
