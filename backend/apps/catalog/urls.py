from django.urls import path
from apps.catalog.presentation.views import (
    ProductListView,
    ProductVariantsView, 
    PurchaseVariantView
)

urlpatterns = [
    # Ruta base para listar productos
    path('productos/', ProductListView.as_view(), name='mongo-productos-list'),
    
    # Rutas de variantes
    path('productos/<str:product_id>/variantes/', ProductVariantsView.as_view(), name='mongo-variantes-create'),
    path('productos/<str:product_id>/variantes/<str:sku>/', ProductVariantsView.as_view(), name='mongo-variantes-update'),
    path('compras/', PurchaseVariantView.as_view(), name='mongo-compras'),
]
