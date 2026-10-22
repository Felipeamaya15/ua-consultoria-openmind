"""Plantillas de correo de la tienda, editables únicamente por su propietario."""
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.domain.plantillas_correo import TIPOS, VARIABLES_PERMITIDAS, plantilla_de_tienda
from apps.core.domain.plantillas_correo.base import _MARCADOR
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import ConfiguracionCorreo
from apps.core.presentation.responses import success_response


def _variables_validas(texto):
    desconocidas = {v for v in _MARCADOR.findall(texto) if v not in VARIABLES_PERMITIDAS}
    if desconocidas:
        raise serializers.ValidationError(
            f'Variables no permitidas: {", ".join(sorted(desconocidas))}. Permitidas: {", ".join(VARIABLES_PERMITIDAS)}.'
        )
    return texto


class PlantillaSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    subject = serializers.CharField(max_length=200, validators=[_variables_validas])
    preheader = serializers.CharField(max_length=200, allow_blank=True, validators=[_variables_validas])
    body = serializers.CharField(max_length=5000, validators=[_variables_validas])


class PlantillasCorreoSerializer(serializers.Serializer):
    plantillas = serializers.DictField(child=PlantillaSerializer())

    def validate_plantillas(self, valor):
        desconocidos = set(valor) - set(TIPOS)
        if desconocidos:
            raise serializers.ValidationError(f'Tipos de correo desconocidos: {", ".join(sorted(desconocidos))}.')
        return valor


def _plantillas_de(tienda):
    resultado = {}
    for tipo, (_, por_defecto) in TIPOS.items():
        personalizada, activa = plantilla_de_tienda(tienda, tipo)
        plantilla = personalizada or por_defecto
        resultado[tipo] = {
            'enabled': activa, 'subject': plantilla.asunto,
            'preheader': plantilla.preheader, 'body': plantilla.cuerpo,
        }
    return resultado


def _por_defecto():
    """Plantillas por defecto del sistema: lo que devuelve el botón «Restaurar plantilla»."""
    return {
        tipo: {'enabled': True, 'subject': p.asunto, 'preheader': p.preheader, 'body': p.cuerpo}
        for tipo, (_, p) in TIPOS.items()
    }


def _datos(tienda):
    return {'plantillas': _plantillas_de(tienda), 'por_defecto': _por_defecto()}


class PlantillasCorreoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        response = success_response(data=_datos(tienda))
        response['Cache-Control'] = 'no-store'
        return response

    def put(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = PlantillasCorreoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config, _ = ConfiguracionCorreo.objects.get_or_create(tienda=tienda)
        config.plantillas = {**config.plantillas, **serializer.validated_data['plantillas']}
        config.save()
        response = success_response(data=_datos(tienda), mensaje='Plantillas de correo guardadas.')
        response['Cache-Control'] = 'no-store'
        return response
