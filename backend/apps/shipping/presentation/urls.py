from django.urls import path
from .views import CotizacionEnvioView, SeguimientoLogisticoView

urlpatterns = [
    path("cotizar/", CotizacionEnvioView.as_view(), name="shipping-cotizar"),
    path("seguimiento/<str:numero_seguimiento>/", SeguimientoLogisticoView.as_view(), name="shipping-seguimiento"),
    path("seguimiento/<str:numero_seguimiento>", SeguimientoLogisticoView.as_view()),  # Soporte sin barra final
]