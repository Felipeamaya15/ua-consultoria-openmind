from django.urls import path
from .views import CoberturasChilexpressAdminView, CoberturasChilexpressView, CotizacionEnvioView, SeguimientoLogisticoView

urlpatterns = [
    path("chilexpress/coberturas/", CoberturasChilexpressView.as_view(), name="shipping-coberturas-chilexpress"),
    path("chilexpress/coberturas/admin/", CoberturasChilexpressAdminView.as_view(), name="shipping-coberturas-chilexpress-admin"),
    path("cotizar/", CotizacionEnvioView.as_view(), name="shipping-cotizar"),
    path("cotizar/chilexpress/", CotizacionEnvioView.as_view(proveedor_fijo="chilexpress"), name="shipping-cotizar-chilexpress"),
    path("cotizar/chilexpress", CotizacionEnvioView.as_view(proveedor_fijo="chilexpress")),
    path("cotizar/starken/", CotizacionEnvioView.as_view(proveedor_fijo="starken"), name="shipping-cotizar-starken"),
    path("cotizar/starken", CotizacionEnvioView.as_view(proveedor_fijo="starken")),
    path("seguimiento/chilexpress/<str:numero_seguimiento>/", SeguimientoLogisticoView.as_view(proveedor_fijo="chilexpress"), name="shipping-seguimiento-chilexpress"),
    path("seguimiento/chilexpress/<str:numero_seguimiento>", SeguimientoLogisticoView.as_view(proveedor_fijo="chilexpress")),
    path("seguimiento/starken/<str:numero_seguimiento>/", SeguimientoLogisticoView.as_view(proveedor_fijo="starken"), name="shipping-seguimiento-starken"),
    path("seguimiento/starken/<str:numero_seguimiento>", SeguimientoLogisticoView.as_view(proveedor_fijo="starken")),
    path("seguimiento/<str:numero_seguimiento>/", SeguimientoLogisticoView.as_view(), name="shipping-seguimiento"),
    path("seguimiento/<str:numero_seguimiento>", SeguimientoLogisticoView.as_view()),
]
