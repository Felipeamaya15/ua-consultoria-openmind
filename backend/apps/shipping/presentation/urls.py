from django.urls import path
from .views import CotizarEnvioView

urlpatterns = [
    path("cotizar/", CotizarEnvioView.as_view(), name="shipping-cotizar"),
]