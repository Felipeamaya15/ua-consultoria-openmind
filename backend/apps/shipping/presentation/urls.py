from django.urls import path
from .views import CotizacionEnvioView

urlpatterns = [
    path("cotizar/", CotizacionEnvioView.as_view(), name="shipping-cotizar"),
]