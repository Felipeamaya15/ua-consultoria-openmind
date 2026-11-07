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
from apps.core.models import Tienda
from apps.landing.social_profiles import SocialProfilesSerializer, read_profiles
from apps.landing.section_elements import public_section_content


class ConfiguracionLandingAPIView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response

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
        data = serializer.data
        owner = request.user.is_authenticated and Tienda.objects.del_propietario(request.user).filter(pk=tienda.pk).exists()
        if not owner:
            data['contenido'] = public_section_content(data.get('contenido', {}), tienda)

        return success_response(
            data=data,
            mensaje="Configuración de landing obtenida correctamente",
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def put(self, request):
        tienda = resolver_tienda(
            request,
            exigir_propietario=True,
        )
        # Serialize first creation with the social editor as well as later writes.
        Tienda.objects.select_for_update().get(pk=tienda.pk)

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


class RedesSocialesAPIView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        config = ConfiguracionLanding.objects.filter(tienda=tienda).first()
        contact = config.contenido.get('contacto', {}) if config else {}
        return success_response(data=read_profiles(contact), mensaje='Perfiles sociales obtenidos.')

    @transaction.atomic
    def patch(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = SocialProfilesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Tienda.objects.select_for_update().get(pk=tienda.pk)
        config = ConfiguracionLanding.objects.select_for_update().filter(tienda=tienda).first()
        if config is None:
            config = ConfiguracionLanding(tienda=tienda, titulo='', texto_boton='')
        content = dict(config.contenido)
        contact = dict(content.get('contacto', {}))
        metadata = dict(contact.get('redes_sociales', {}))
        for network, profile in serializer.validated_data.items():
            contact[network] = profile['perfil'] if profile else ''
            metadata[network] = {'activo': profile['activo'] if profile else False}
            if network == 'whatsapp' and profile:
                metadata[network]['mensaje'] = profile['mensaje']
        contact['redes_sociales'] = metadata
        content['contacto'] = contact
        config.contenido = content
        config.save()
        return success_response(data=read_profiles(contact), mensaje='Perfiles sociales guardados.')
