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
)

urlpatterns = [
    # Catálogo público
    path(
        'productos/',
        PublicProductListAPIView.as_view(),
        name='mongo-productos-list'
    ),

    path(
        'productos/<str:slug>/',
        PublicProductDetailAPIView.as_view(),
        name='mongo-producto-detail'
    ),

    path(
        'productos/<str:slug>/atributos/',
        PublicProductAttributesAPIView.as_view(),
        name='mongo-producto-atributos'
    ),

    # Administración de productos
    path(
        'productos/crear/',
        ProductoCreateView.as_view(),
        name='producto-crear'
    ),

    path(
        'productos/<int:id_producto>/admin/',
        ProductoAdminDetailView.as_view(),
        name='producto-admin-detail'
    ),

    path(
        'productos/<int:id_producto>/actualizar/',
        ProductoUpdateView.as_view(),
        name='producto-actualizar'
    ),

    path(
        'productos/<int:id_producto>/stock/',
        ProductoStockUpdateView.as_view(),
        name='producto-stock'
    ),

    path(
        'productos/<int:id_producto>/eliminar/',
        ProductDeleteAPIView.as_view(),
        name='producto-eliminar'
    ),

    # Validación de disponibilidad
    path(
        'productos/<int:id_producto>/disponibilidad/',
        ValidarDisponibilidadAPIView.as_view(),
        name='producto-disponibilidad'
    ),
]