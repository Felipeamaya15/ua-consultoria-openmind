from django.urls import path
from . import views
from apps.core.presentation.views import (
    VarianteProductoListCreateView,
    VarianteProductoDetailView,
    RegistrarCompraView
)

urlpatterns = [
    path('', views.home, name='home'),
    path('check_profile/', views.check_profile, name='check_profile'),
    path('main_admin/', views.main_admin, name='main_admin'),
    
    # Listar y crear variantes de un producto
    path('productos/<int:id_producto>/variantes/', VarianteProductoListCreateView.as_view(), name='variantes-list-create'),
    
    # Consultar y actualizar una variante específica
    path('productos/<int:id_producto>/variantes/<int:id_variante>/', VarianteProductoDetailView.as_view(), name='variante-detail'),
    path('compras/', RegistrarCompraView.as_view(), name='registrar-compra'),
]