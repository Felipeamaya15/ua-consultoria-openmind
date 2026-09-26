from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response
from apps.landing.models import ConfiguracionLanding
from apps.landing.serializers import ConfiguracionLandingSerializer


class ConfiguracionLandingAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        tienda = resolver_tienda(request)

        configuracion = ConfiguracionLanding.objects.filter(
            tienda=tienda
        ).first()

        if configuracion is None:
            return success_response(
                data=None,
                mensaje="La landing todavía no tiene configuración",
                status=status.HTTP_200_OK,
            )

        serializer = ConfiguracionLandingSerializer(
            configuracion,
            context={'request': request},
        )

        return success_response(
            data=serializer.data,
            mensaje="Configuración de landing obtenida correctamente",
            status=status.HTTP_200_OK,
        )
