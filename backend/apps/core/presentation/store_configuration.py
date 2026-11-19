"""Información pública del negocio, editable únicamente por su propietario."""
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from django.db import transaction, ProgrammingError, OperationalError

from apps.core.models import Tienda
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response, error_response


class InformacionTiendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tienda
        fields = ['nombre', 'descripcion', 'correo_negocio', 'horas_expiracion_pedido_en_linea', 'horas_expiracion_pedido_manual']


class InformacionTiendaAPIView(APIView):
    def handle_exception(self, exc):
        if isinstance(exc, (ProgrammingError, OperationalError)):
            return error_response('No se pudo guardar la información del negocio. Reintenta.', 'NEGOCIO_NO_DISPONIBLE', status=503)
        return super().handle_exception(exc)

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
        with transaction.atomic():
            tienda = Tienda.objects.select_for_update().get(pk=tienda.pk)
            serializer = InformacionTiendaSerializer(tienda, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            changed = ('correo_negocio' in serializer.validated_data and
                serializer.validated_data['correo_negocio'].strip().lower() != tienda.correo_negocio.strip().lower())
            if changed:
                try:
                    with transaction.atomic():
                        from apps.core.models import ConexionGmailTienda
                        from apps.core.mail_authorization import invalidate
                        connection = ConexionGmailTienda.objects.select_for_update().filter(tienda=tienda).first()
                        if connection:
                            invalidate(connection, request.user, 'cuenta_cambiada')
                except ProgrammingError as exc:
                    if getattr(exc.__cause__, 'sqlstate', None) not in ('42703', '42P01'):
                        raise
            serializer.save()
        response = success_response(data=serializer.data, mensaje='Información del negocio guardada.')
        response['Cache-Control'] = 'no-store'
        return response
