from rest_framework import status
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response
from apps.landing.models import ConfiguracionLanding
from apps.landing.serializers import ConfiguracionLandingSerializer


class ConfiguracionLandingAPIView(APIView):
    def put(self, request):
        tienda = resolver_tienda(
            request,
            exigir_propietario=True,
        )

        configuracion = ConfiguracionLanding.objects.filter(
            tienda=tienda
        ).first()

        creada = configuracion is None

        serializer = ConfiguracionLandingSerializer(
            instance=configuracion,
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        serializer.save(tienda=tienda)

        return success_response(
            data=serializer.data,
            mensaje=(
                "Configuración de landing creada correctamente"
                if creada
                else "Configuración de landing actualizada correctamente"
            ),
            status=(
                status.HTTP_201_CREATED
                if creada
                else status.HTTP_200_OK
            ),
        )
