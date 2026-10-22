from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response
from apps.landing.models import ConfiguracionLanding
from apps.landing.serializers import ConfiguracionLandingSerializer
from apps.landing.block_appearance import BlockAppearanceSerializer
from django.db import transaction
from rest_framework.exceptions import ValidationError


class ConfiguracionLandingAPIView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return super().get_permissions()

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
            context={'request': request, 'tienda': tienda},
        )

        return success_response(
            data=serializer.data,
            mensaje="Configuración de landing obtenida correctamente",
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def put(self, request):
        tienda = resolver_tienda(
            request,
            exigir_propietario=True,
        )

        configuracion = ConfiguracionLanding.objects.select_for_update().filter(
            tienda=tienda
        ).first()

        creada = configuracion is None

        serializer = ConfiguracionLandingSerializer(
            instance=configuracion,
            data=request.data,
            context={'request': request, 'tienda': tienda},
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


class AparienciaBloquesAPIView(APIView):
    def patch(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = BlockAppearanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            config = ConfiguracionLanding.objects.select_for_update().filter(tienda=tienda).first()
            if config is None:
                raise ValidationError('Guarda primero el contenido desde Página principal.')
            content = dict(config.contenido)
            styles = dict(content.get('apariencia_bloques', {}))
            styles[serializer.validated_data['plantilla']] = serializer.validated_data['bloques']
            content['apariencia_bloques'] = styles
            config.contenido = content
            config.save(update_fields=['contenido'])
        return success_response(data={'tienda': tienda.pk}, mensaje='Apariencia de secciones guardada.')
