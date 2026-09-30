from django.contrib import admin
from django.urls import path, include
from apps.catalog.presentation.views import ProductVariantsView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.authentication.urls')),
    path('api/catalog/', include('apps.catalog.urls')),
    path('api/', include('apps.core.urls')),  
    path('api/visual-config/', include('apps.visual_config.urls')),
    path('api/landing/', include('apps.landing.urls')),

    path('api/productos/<int:id_producto>/variantes/', ProductVariantsView.as_view(), name='qa-variantes'),
    path('api/productos/<int:id_producto>/variantes/<str:sku>/', ProductVariantsView.as_view(), name='qa-variantes-sku'),
]