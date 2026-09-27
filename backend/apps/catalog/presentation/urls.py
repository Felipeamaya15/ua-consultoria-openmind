from django.urls import path
from .views import PublicProductListAPIView, PublicProductDetailAPIView,PublicProductAttributesAPIView,ProductDeleteAPIView, ProductoCreateView, ProductoAdminDetailView

urlpatterns = [
    path('productos/', PublicProductListAPIView.as_view(), name='api_public_product_list'),
    path('productos/crear/', ProductoCreateView.as_view(), name='crear_producto'),
    path('productos/<int:id_producto>/', ProductoAdminDetailView.as_view(), name='admin_producto_detalle'),
    path('productos/<slug:slug>/', PublicProductDetailAPIView.as_view(), name='api_public_product_detail'),
    path('productos/<slug:slug>/atributos/', PublicProductAttributesAPIView.as_view(), name='api_public_product_attributes'),
    path('productos/<int:producto_id>/', ProductDeleteAPIView.as_view(), name='eliminar-producto'),
]
