import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.shipping.presentation.serializers import (
    CotizacionEnvioSerializer,
    DetalleSeguimientoResponseSerializer
)
from apps.shipping.infrastructure.adapters import (
    StandardLogisticsAdapter,
    ChilexpressAdapter,
    StarkenAdapter,
    MultiCarrierLogisticsAdapter,
    get_logistics_adapter,
)
from apps.shipping.application.use_cases import (
    ShippingQuotationService,
    ConsultarSeguimientoUseCase
)
from apps.shipping.domain.exceptions import (
    LogisticaException,
    DireccionFueraDeCoberturaException,
    ProveedorLogisticoError,
    NumeroSeguimientoNoEncontradoException,
    FormatoSeguimientoInvalidoException
)

logger = logging.getLogger(__name__)


class SeguimientoLogisticoView(APIView):
    """
    Endpoint para consultar el estado en tiempo real de un envío en el e-commerce.
    """
    proveedor_fijo = None

    def get(self, request, numero_seguimiento):
        try:
            # La ruta dedicada permite consultar ordenes de flete numericas sin
            # confundirlas con numeros de transporte de otros operadores.
            adaptador = get_logistics_adapter(self.proveedor_fijo or numero_seguimiento)
            caso_uso = ConsultarSeguimientoUseCase(logistics_port=adaptador)

            resultado = caso_uso.execute(numero_seguimiento=numero_seguimiento)
            serializer = DetalleSeguimientoResponseSerializer(resultado)

            return Response({
                "exito": True,
                "mensaje": "Información de seguimiento obtenida exitosamente.",
                "data": serializer.data
            }, status=status.HTTP_200_OK)

        except FormatoSeguimientoInvalidoException as e:
            return Response({
                "exito": False,
                "mensaje": str(e),
                "error": {"codigo": "FORMATO_TRACKING_INVALIDO"}
            }, status=status.HTTP_400_BAD_REQUEST)

        except NumeroSeguimientoNoEncontradoException as e:
            return Response({
                "exito": False,
                "mensaje": str(e),
                "error": {"codigo": "TRACKING_NO_ENCONTRADO"}
            }, status=status.HTTP_404_NOT_FOUND)

        except LogisticaException as e:
            return Response({
                "exito": False,
                "mensaje": str(e),
                "error": {"codigo": "ERROR_LOGISTICA"}
            }, status=status.HTTP_400_BAD_REQUEST)




class CotizacionEnvioView(APIView):
    """
    Servicio de cotizacion de envios para el flujo de Checkout del e-commerce.
    """
    proveedor_fijo = None

    def post(self, request, *args, **kwargs):
        serializer = CotizacionEnvioSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "exito": False,
                "mensaje": "Parametros de cotizacion invalidos.",
                "errores": serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            proveedor_param = str(
                self.proveedor_fijo or
                kwargs.get("proveedor") or
                serializer.validated_data.get("proveedor", "todos")
            ).strip().lower()
            if proveedor_param in ["starken", "stk"]:
                adaptador_logistico = StarkenAdapter()
            elif proveedor_param in ["chilexpress", "chilex"]:
                adaptador_logistico = ChilexpressAdapter()
            elif proveedor_param in ["standard", "central"]:
                adaptador_logistico = StandardLogisticsAdapter()
            else:
                adaptador_logistico = MultiCarrierLogisticsAdapter()

            servicio_cotizacion = ShippingQuotationService(logistics_port=adaptador_logistico)

            resultado = servicio_cotizacion.cotizar(serializer.validated_data)

            return Response({
                "exito": True,
                "mensaje": "Cotizacion generada exitosamente.",
                "data": resultado
            }, status=status.HTTP_200_OK)

        except DireccionFueraDeCoberturaException as e:
            return Response({
                "exito": False,
                "mensaje": str(e),
                "error": {"codigo": "SIN_COBERTURA"}
            }, status=status.HTTP_400_BAD_REQUEST)
        except ProveedorLogisticoError:
            logger.warning("Cotizacion: los transportistas no respondieron", exc_info=True)
            return Response({
                "exito": False,
                "mensaje": "Los transportistas no están disponibles en este momento. Intenta nuevamente.",
                "error": {"codigo": "PROVEEDOR_NO_DISPONIBLE"}
            }, status=status.HTTP_502_BAD_GATEWAY)
        except LogisticaException as e:
            return Response({
                "exito": False,
                "mensaje": str(e),
                "error": {"codigo": "ERROR_LOGISTICA_CALCULO"}
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            # No se expone el texto del error: puede contener datos internos.
            logger.exception("Cotizacion: error inesperado")
            return Response({
                "exito": False,
                "mensaje": "Error interno al procesar la cotizacion.",
                "error": {"codigo": "ERROR_INTERNO"}
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
