from django.contrib import admin
from django.urls import path, include
from apps.catalog.presentation.views import ProductVariantsView, VariantPurchaseView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.authentication.urls')),
    path('api/catalog/', include('apps.catalog.urls')),
    path('api/', include('apps.core.urls')),  
    path('api/visual-config/', include('apps.visual_config.urls')),
    path('api/landing/', include('apps.landing.urls')),
]

# Servir las imágenes de landing durante desarrollo local.
from django.conf import settings
from django.conf.urls.static import static

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

    path('api/productos/<str:id_producto>/variantes/', ProductVariantsView.as_view(), name='qa-variantes'),
    path('api/productos/<str:id_producto>/variantes/<str:sku>/', ProductVariantsView.as_view(), name='qa-variantes-sku'),
    path('api/productos/<str:id_producto>/variantes/<str:sku>/comprar/', VariantPurchaseView.as_view(), name='qa-variante-comprar'),
    path('api/productos/<str:id_producto>/variantes/<str:sku>/compra/', VariantPurchaseView.as_view(), name='qa-variante-compra'),
]
