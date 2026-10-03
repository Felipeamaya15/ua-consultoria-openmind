from django.urls import path
from .views import PublicProductListAPIView, PublicProductDetailAPIView,PublicProductAttributesAPIView,ProductDeleteAPIView, ProductoCreateView, ProductoAdminDetailView, ProductoUpdateView, ProductoStockUpdateView, ValidarDisponibilidadAPIView, ModificarCantidadItemAPIView

urlpatterns = [
    path('productos/', PublicProductListAPIView.as_view(), name='api_public_product_list'),
    path('productos/crear/', ProductoCreateView.as_view(), name='crear_producto'),
    path('productos/<int:id_producto>/actualizar/', ProductoUpdateView.as_view(), name='admin_producto_actualizar'),
    path('productos/<int:id_producto>/stock/', ProductoStockUpdateView.as_view(), name='admin_producto_stock'),
    path('productos/<int:id_producto>/validar-compra/', ValidarDisponibilidadAPIView.as_view(), name='api_validar_compra'),
    path('productos/<int:id_producto>/', ProductoAdminDetailView.as_view(), name='admin_producto_detalle'),
    path('productos/<int:producto_id>/', ProductDeleteAPIView.as_view(), name='eliminar-producto'),
    path('productos/<slug:slug>/', PublicProductDetailAPIView.as_view(), name='api_public_product_detail'),
    path('productos/<slug:slug>/atributos/', PublicProductAttributesAPIView.as_view(), name='api_public_product_attributes'),
]
