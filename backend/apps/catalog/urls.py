from django.urls import path

from apps.catalog.presentation.views import (
    # Catálogo público
    PublicProductListAPIView,
    PublicProductDetailAPIView,
    PublicProductAttributesAPIView,
    ValidarDisponibilidadAPIView,
    # Administración de productos
    ProductoCreateView,
    ProductoAdminDetailView,
    ProductoUpdateView,
    ProductoStockUpdateView,
    ProductDeleteAPIView,
    ProductoAdminListView,
    # Gestión de variantes
    ProductVariantsView,
    VarianteStockUpdateView,
    VariantPurchaseView,
    # Carrito de compras
    CarritoItemsView,
    ModificarCantidadItemAPIView,
    # Pasarelas de pago
    ConfiguracionTransbankView,
    IniciarPagoTransbankView,
    ConfirmarPagoTransbankView,
    ConfiguracionPayPalView,
    ConfiguracionMercadoPagoView,
)

urlpatterns = [
    path('productos/admin/listado/', ProductoAdminDetailView.as_view(), name='producto-admin-list'),
    # ==========================================
    # 1. Catálogo Público
    # ==========================================
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

    # ==========================================
    # 2. Administración de Productos
    # ==========================================
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

    # ==========================================
    # 3. Variantes de Producto
    # ==========================================
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

    # ==========================================
    # 4. Flujo de Carrito de Compras
    # ==========================================
    # POST: Agregar producto o variante al carrito
    path(
        "carrito/items/",
        CarritoItemsView.as_view(),
        name="carrito-items-collection",
    ),
    # PATCH: Modificar cantidad de un ítem existente
    path(
        "carrito/items/<int:id_item_carrito>/",
        ModificarCantidadItemAPIView.as_view(),
        name="modificar-cantidad-item",
    ),


    # ==========================================
    # 5. Configuración y Pasarelas de Pagos
    # ==========================================
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
