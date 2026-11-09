"""Información pública del negocio, editable únicamente por su propietario."""
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.models import Tienda
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response


class InformacionTiendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tienda
        fields = ['nombre', 'descripcion', 'correo_negocio', 'horas_expiracion_pedido_en_linea', 'horas_expiracion_pedido_manual']


class InformacionTiendaAPIView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def get(self, request):
        tienda = resolver_tienda(request)
        data = dict(InformacionTiendaSerializer(tienda).data)
        if not (request.user.is_authenticated and request.user.is_active and tienda.id_usuario_propietario_id == request.user.pk):
            for campo in ('correo_negocio', 'horas_expiracion_pedido_en_linea', 'horas_expiracion_pedido_manual'):
                data.pop(campo, None)
        response = success_response(data=data)
        response['Cache-Control'] = 'no-store'
        return response

    def put(self, request):
        return self._guardar(request, partial=False)

    def patch(self, request):
        return self._guardar(request, partial=True)

    def _guardar(self, request, partial):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = InformacionTiendaSerializer(tienda, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        response = success_response(data=serializer.data, mensaje='Información del negocio guardada.')
        response['Cache-Control'] = 'no-store'
        return response
