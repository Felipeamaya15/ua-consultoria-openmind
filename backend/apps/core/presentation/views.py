# Vistas del módulo Core (PostgreSQL)
# La lógica de variantes y catálogo fue migrada a apps/catalog (MongoDB)
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.core.models import ConfiguracionPago
from apps.core.presentation.responses import success_response, error_response
from apps.core.models import ItemPedido, Pedido, Producto, Usuario
from apps.catalog.infrastructure.repositories import ProductRepository
from .serializers import RegistrarCompraSerializer
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id

from apps.core.presentation.checkout import GuestCheckoutOrderAPIView


class RegistrarCompraView(GuestCheckoutOrderAPIView):
    """Compatibilidad SCRUM-289: reutiliza la creación y seguridad de SCRUM-291."""


class ConfiguracionPagoAPIView(APIView):
    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            config_pago, _ = ConfiguracionPago.objects.get_or_create(id_tienda=tienda)
            return success_response(data=config_pago.configuracion)
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=400)

    def put(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            config_pago, _ = ConfiguracionPago.objects.get_or_create(id_tienda=tienda)
            config_pago.configuracion = request.data
            config_pago.save()
            return success_response(
                mensaje="Métodos de pago guardados exitosamente.",
                data=config_pago.configuracion
            )
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=400)

class MetodosPagoActivosAPIView(APIView):
    """ Endpoint público para el Checkout: devuelve SOLO los métodos habilitados """
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            tienda_id = resolver_tienda_id(request)
            config = ConfiguracionPago.objects.get(tienda_id=tienda_id)

            # Filtramos para enviar al checkout solo los activos (enabled: true)
            metodos_activos = {
                key: method_data
                for key, method_data in config.datos.items()
                if isinstance(method_data, dict) and method_data.get('enabled', False)
            }
            return success_response(data=metodos_activos)
        except ConfiguracionPago.DoesNotExist:
            return success_response(data={})
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_METODOS_PAGO", status=400)