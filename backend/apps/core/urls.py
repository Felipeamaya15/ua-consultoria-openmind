from apps.core.presentation.customer_orders import CustomerOrdersAPIView
from apps.core.presentation.order_tracking import OrderTrackingAPIView
from apps.core.presentation.checkout import CheckoutOrderAPIView
from apps.core.presentation.shipping import ShippingQuoteAPIView
from apps.core.presentation.linkify_notificacion import LinkifyNotificacionView
from apps.core.presentation.legal import (
    ConfiguracionLegalAPIView,
    ConsultaVersionVigenteAPIView,
    PaginaLegalDetalleAPIView,
    PaginasLegalesPublicasAPIView,
    PublicarContenidoLegalAPIView,
)
from apps.core.presentation.software_version import SoftwareVersionAPIView
from apps.core.presentation.recent_orders import UltimasOrdenesAPIView, ActualizarEstadoPedidoAPIView
from apps.core.presentation.historial import HistorialPedidosAPIView, HistorialVentasAPIView
from apps.core.presentation.dashboard import DashboardAPIView
from apps.core.presentation.pickup_address import PickupAddressAPIView
from apps.core.presentation.promotions import PromocionesAPIView, PromocionDetalleAPIView, ValidarPromocionAPIView
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
    RechazarTransferenciaManualAPIView,
    TiendaPedidosAPIView,
)

urlpatterns = [
    path('promociones/', PromocionesAPIView.as_view(), name='promotions'),
    path('promociones/validar/', ValidarPromocionAPIView.as_view(), name='promotion-validate'),
    path('promociones/<int:promotion_id>/', PromocionDetalleAPIView.as_view(), name='promotion-detail'),
    path('entregas/retiro/direcciones/', PickupAddressAPIView.as_view(), name='pickup-address'),
    path('tienda/dashboard/', DashboardAPIView.as_view(), name='tienda-dashboard'),
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
    path('pagos/transferencias/<int:pedido_id>/rechazar/', RechazarTransferenciaManualAPIView.as_view(), name='rechazar-transferencia-manual'),
    path('tienda/pedidos/', TiendaPedidosAPIView.as_view(), name='tienda-pedidos'),
    path('tienda/pedidos/historial/', HistorialPedidosAPIView.as_view(), name='tienda-pedidos-historial'),
    path('tienda/ventas/historial/', HistorialVentasAPIView.as_view(), name='tienda-ventas-historial'),
    path('tienda/pedidos/ultimos/', UltimasOrdenesAPIView.as_view(), name='tienda-pedidos-ultimos'),
    path('tienda/pedidos/<int:id_pedido>/estado/', ActualizarEstadoPedidoAPIView.as_view(), name='actualizar-estado-pedido'),
    path('legal/', PaginasLegalesPublicasAPIView.as_view(), name='legal-publico'),
    path('legal/vigente/', ConsultaVersionVigenteAPIView.as_view(), name='legal-version-vigente-todos'),
    path('legal/vigente/<str:tipo>/', ConsultaVersionVigenteAPIView.as_view(), name='legal-version-vigente-tipo'),
    path('legal/version-vigente/', ConsultaVersionVigenteAPIView.as_view(), name='legal-version-vigente-alias'),
    path('legal/version-vigente/<str:tipo>/', ConsultaVersionVigenteAPIView.as_view(), name='legal-version-vigente-alias-tipo'),
    path('legal/configuracion/', ConfiguracionLegalAPIView.as_view(), name='legal-configuracion'),
    path('legal/configuracion/publicar/', PublicarContenidoLegalAPIView.as_view(), name='legal-publicar'),
    path('legal/<str:tipo>/publicar/', PublicarContenidoLegalAPIView.as_view(), name='legal-publicar-tipo'),
    path('legal/<str:tipo>/vigente/', ConsultaVersionVigenteAPIView.as_view(), name='legal-tipo-vigente'),
    path('legal/<str:tipo>/', PaginaLegalDetalleAPIView.as_view(), name='legal-detalle'),
    # Consulta de la versión vigente del software
    path('software/version-vigente/', SoftwareVersionAPIView.as_view(), name='software-version-vigente'),
    path('software/version/', SoftwareVersionAPIView.as_view(), name='software-version'),
    path('version-vigente/', SoftwareVersionAPIView.as_view(), name='version-vigente-raiz'),
    path('version/', SoftwareVersionAPIView.as_view(), name='version-raiz'),
    path('sistema/version-vigente/', SoftwareVersionAPIView.as_view(), name='sistema-version-vigente'),
    path('sistema/version/', SoftwareVersionAPIView.as_view(), name='sistema-version'),
]
