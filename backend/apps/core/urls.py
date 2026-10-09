from apps.core.presentation.customer_orders import CustomerOrdersAPIView
from apps.core.presentation.order_tracking import OrderTrackingAPIView
from apps.core.presentation.checkout import CheckoutOrderAPIView
from apps.core.presentation.shipping import ShippingQuoteAPIView
from apps.core.presentation.linkify_notificacion import LinkifyNotificacionView
from django.urls import path
from . import views
from apps.core.presentation.views import (
    ConfiguracionPagoAPIView,
    ConfiguracionEntregaAPIView,
    AlternativasEntregaAPIView,
    MetodosPagoActivosAPIView,
    RegistrarCompraView,
    TiendaPagoActualAPIView,
    IniciarPagoPayPalView, 
    CapturarPagoPayPalView,
    WebhookLinkifyAPIView, 
    VerificarTransferenciaLinkifyAPIView,
    TransferenciasPendientesAPIView,
    AprobarTransferenciaManualAPIView,
    TiendaPedidosAPIView
)

urlpatterns = [
    path('pedidos/registrar/', RegistrarCompraView.as_view(), name='pedidos-registrar'),
    path('checkout/pedidos/', CheckoutOrderAPIView.as_view(), name='checkout-order'),
    path('pedidos/seguimiento/', OrderTrackingAPIView.as_view(), name='order-tracking'),
    path('mi-cuenta/pedidos/', CustomerOrdersAPIView.as_view(), name='customer-orders'),
    path('mi-cuenta/pedidos/<int:pedido_id>/', CustomerOrdersAPIView.as_view(), name='customer-order-detail'),
    path('', views.home, name='home'),
    path('check_profile/', views.check_profile, name='check_profile'),
    path('main_admin/', views.main_admin, name='main_admin'),
    path('pagos/mi-tienda/', TiendaPagoActualAPIView.as_view(), name='pagos-mi-tienda'),
    path('pagos/configuracion/', ConfiguracionPagoAPIView.as_view(), name='pagos-configuracion'),
    path('entregas/configuracion/', ConfiguracionEntregaAPIView.as_view(), name='entregas-configuracion'),
    path('entregas/alternativas/', AlternativasEntregaAPIView.as_view(), name='entregas-alternativas'),
    path('entregas/cotizacion/', ShippingQuoteAPIView.as_view(), name='entregas-cotizacion'),
    path('pagos/activos/', MetodosPagoActivosAPIView.as_view(), name='pagos-activos'),
    path('pagos/paypal/iniciar/', IniciarPagoPayPalView.as_view(), name='paypal_iniciar'),
    path('pagos/paypal/capturar/', CapturarPagoPayPalView.as_view(), name='paypal_capturar'),
    path('pagos/linkify/notificacion/', LinkifyNotificacionView.as_view(), name='linkify_notificacion'),
    path('pagos/linkify/webhook/', WebhookLinkifyAPIView.as_view(), name='linkify_webhook'),
    path('pagos/linkify/verificar/', VerificarTransferenciaLinkifyAPIView.as_view(), name='linkify_verificar'),
    path('pagos/transferencias/pendientes/', TransferenciasPendientesAPIView.as_view(), name='transferencias-pendientes'),
    path('pagos/transferencias/<int:pedido_id>/aprobar/', AprobarTransferenciaManualAPIView.as_view(), name='aprobar-transferencia-manual'),
    path('tienda/pedidos/', TiendaPedidosAPIView.as_view(), name='tienda-pedidos'),
]
