from django.urls import path
from .views import CotizacionEnvioView, SeguimientoLogisticoView

urlpatterns = [
    path("cotizar/", CotizacionEnvioView.as_view(), name="shipping-cotizar"),
    path("cotizar/chilexpress/", CotizacionEnvioView.as_view(proveedor_fijo="chilexpress"), name="shipping-cotizar-chilexpress"),
    path("cotizar/chilexpress", CotizacionEnvioView.as_view(proveedor_fijo="chilexpress")),
    path("cotizar/starken/", CotizacionEnvioView.as_view(proveedor_fijo="starken"), name="shipping-cotizar-starken"),
    path("cotizar/starken", CotizacionEnvioView.as_view(proveedor_fijo="starken")),
    path("seguimiento/<str:numero_seguimiento>/", SeguimientoLogisticoView.as_view(), name="shipping-seguimiento"),
    path("seguimiento/<str:numero_seguimiento>", SeguimientoLogisticoView.as_view()),  # Soporte sin barra final
]