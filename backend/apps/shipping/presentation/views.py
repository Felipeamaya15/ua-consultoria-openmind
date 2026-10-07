from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.shipping.presentation.serializers import CotizacionEnvioRequestSerializer
from apps.shipping.infrastructure.adapters import StandardLogisticsAdapter
from apps.shipping.application.use_cases import CotizarDespachoEcommerceUseCase
from apps.shipping.domain.exceptions import LogisticaException

class CotizarEnvioView(APIView):
    """
    Endpoint para cotizar alternativas de despacho antes del pago.
    """
    def post(self, request):
        serializer = CotizacionEnvioRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "exito": False,
                "mensaje": "Parámetros de dirección o carrito inválidos.",
                "errores": serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            datos = serializer.validated_data
            # Inyección de dependencia del puerto con su adaptador activo
            adaptador = StandardLogisticsAdapter()
            caso_uso = CotizarDespachoEcommerceUseCase(logistics_port=adaptador)
            
            opciones = caso_uso.execute(
                datos_destino=datos,
                total_carrito=datos["total_carrito"],
                total_items=datos["total_items"]
            )

            return Response({
                "exito": True,
                "mensaje": "Tarifas de despacho obtenidas correctamente.",
                "data": opciones
            }, status=status.HTTP_200_OK)

        except LogisticaException as e:
            return Response({
                "exito": False,
                "mensaje": str(e),
                "error": {"codigo": "ERROR_LOGISTICA"}
            }, status=status.HTTP_400_BAD_REQUEST)