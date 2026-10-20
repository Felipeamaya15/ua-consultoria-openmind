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
        fields = ['nombre', 'descripcion']


class InformacionTiendaAPIView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def get(self, request):
        tienda = resolver_tienda(request)
        response = success_response(data=InformacionTiendaSerializer(tienda).data)
        response['Cache-Control'] = 'no-store'
        return response

    def put(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = InformacionTiendaSerializer(tienda, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        response = success_response(data=serializer.data, mensaje='Información del negocio guardada.')
        response['Cache-Control'] = 'no-store'
        return response
