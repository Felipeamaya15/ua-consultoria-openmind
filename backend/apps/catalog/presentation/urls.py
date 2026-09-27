from django.urls import path
from .views import (
    PublicProductListAPIView,
    PublicProductDetailAPIView,
    PublicProductAttributesAPIView,
    ProductCreateAPIView,
)

urlpatterns = [
    path('productos/', PublicProductListAPIView.as_view(), name='api_public_product_list'),
    path('productos/crear/', ProductCreateAPIView.as_view(), name='api_product_create'),
    path('productos/<slug:slug>/', PublicProductDetailAPIView.as_view(), name='api_public_product_detail'),
    path('productos/<slug:slug>/atributos/', PublicProductAttributesAPIView.as_view(), name='api_public_product_attributes'),
]