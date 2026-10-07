from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.shipping.presentation.serializers import CotizacionEnvioSerializer
from apps.shipping.infrastructure.adapters import StandardLogisticsAdapter
from apps.shipping.application.use_cases import ShippingQuotationService
from apps.shipping.domain.exceptions import LogisticaException

class CotizacionEnvioView(APIView):
    """
    Servicio de cotizacion de envios para el flujo de Checkout del e-commerce.
    """

    def post(self, request):
        serializer = CotizacionEnvioSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "exito": False,
                "mensaje": "Parametros de cotizacion invalidos.",
                "errores": serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Resolucion del adaptador e inyeccion al servicio de cotizacion
            adaptador_logistico = StandardLogisticsAdapter()
            servicio_cotizacion = ShippingQuotationService(logistics_port=adaptador_logistico)

            resultado = servicio_cotizacion.cotizar(serializer.validated_data)

            return Response({
                "exito": True,
                "mensaje": "Cotizacion generada exitosamente.",
                "data": resultado
            }, status=status.HTTP_200_OK)

        except LogisticaException as e:
            return Response({
                "exito": False,
                "mensaje": str(e),
                "error": {"codigo": "ERROR_LOGISTICA_CALCULO"}
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                "exito": False,
                "mensaje": "Error interno al procesar la cotizacion.",
                "error": {"detalle": str(e)}
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)