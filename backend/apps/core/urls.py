from apps.core.presentation.customer_orders import CustomerOrdersAPIView
from apps.core.presentation.checkout import CheckoutOrderAPIView
from django.urls import path
from . import views
from apps.core.presentation.views import (
    ConfiguracionPagoAPIView,
    MetodosPagoActivosAPIView,
    RegistrarCompraView,
)

urlpatterns = [
    path('checkout/pedidos/', CheckoutOrderAPIView.as_view(), name='checkout-order'),
    path('mi-cuenta/pedidos/', CustomerOrdersAPIView.as_view(), name='customer-orders'),
    path('mi-cuenta/pedidos/<int:pedido_id>/', CustomerOrdersAPIView.as_view(), name='customer-order-detail'),
    path('', views.home, name='home'),
    path('check_profile/', views.check_profile, name='check_profile'),
    path('main_admin/', views.main_admin, name='main_admin'),
    path('pagos/configuracion/', ConfiguracionPagoAPIView.as_view(), name='pagos-configuracion'),
    path('pagos/activos/', MetodosPagoActivosAPIView.as_view(), name='pagos-activos'),
    path('pedidos/registrar/', RegistrarCompraView.as_view(), name='pedidos-registrar'),
]
