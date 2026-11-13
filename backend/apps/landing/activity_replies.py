"""Respuestas persistentes. Aceptación SMTP no equivale a entrega al buzón."""
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError, Throttled
from rest_framework.permissions import IsAuthenticated
from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.infrastructure.email_service import enviar_correo, es_entorno_local
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response, error_response
from apps.landing.activity_views import NoStoreActivityView, ActivityRequestOutput
from apps.landing.models import SolicitudActividad, RespuestaActividad, IntentoRespuestaActividad


def delivery_available():
    return settings.EMAIL_BACKEND == 'django.core.mail.backends.locmem.EmailBackend' or (
        getattr(settings, 'ACTIVITY_REPLIES_MAILPIT_ENABLED', False) and es_entorno_local()
        and settings.EMAIL_BACKEND == 'django.core.mail.backends.smtp.EmailBackend')


class ReplyInput(StrictSerializer):
    clave = serializers.UUIDField()
    asunto = serializers.CharField(max_length=200)
    cuerpo = serializers.CharField(max_length=5000)

    def validate_asunto(self, value):
        if any(char in value for char in ('\r', '\n', '\x00')):
            raise serializers.ValidationError('El asunto debe ocupar una sola línea.')
        return value

    def validate_cuerpo(self, value):
        if '\x00' in value:
            raise serializers.ValidationError('El contenido contiene caracteres no válidos.')
        return value


class AttemptOutput(serializers.ModelSerializer):
    class Meta:
        model = IntentoRespuestaActividad
        fields = ['numero', 'estado', 'codigo', 'creado', 'finalizado']


class ReplyOutput(serializers.ModelSerializer):
    intentos = AttemptOutput(many=True, read_only=True)
    class Meta:
        model = RespuestaActividad
        fields = ['id', 'clave', 'destinatario', 'asunto', 'cuerpo', 'estado', 'creado', 'actualizado', 'intentos']


def consultation(store, pk, lock=False):
    rows = SolicitudActividad.objects.filter(tienda=store, tipo='consulta')
    if lock:
        rows = rows.select_for_update()
    return get_object_or_404(rows, pk=pk)


class ActivityRepliesView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        store = resolver_tienda(request, exigir_propietario=True)
        record = consultation(store, pk)
        query = serializers.IntegerField(min_value=1, max_value=100000)
        page = query.run_validation(request.query_params.get('pagina', 1))
        rows = record.respuestas.prefetch_related('intentos')
        total = rows.count()
        return success_response(data={'solicitud': ActivityRequestOutput(record).data,
            'respuestas': ReplyOutput(rows[(page-1)*20:page*20], many=True).data,
            'pagina': page, 'paginas': max(1, (total+19)//20), 'total': total,
            'envio_habilitado': delivery_available(),
            'aviso_envio': 'Disponible solo con correo de pruebas. Aceptado no significa entregado al buzón.' if delivery_available()
                else 'El envío está deshabilitado. Puedes guardar borradores; falta habilitar Mailpit o revisar el proveedor autorizado.'})

    @transaction.atomic
    def post(self, request, pk):
        store = resolver_tienda(request, exigir_propietario=True)
        Tienda.objects.select_for_update().get(pk=store.pk)
        record = consultation(store, pk, lock=True)
        data = ReplyInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        existing = record.respuestas.filter(clave=values['clave']).first()
        if existing:
            if existing.asunto != values['asunto'] or existing.cuerpo != values['cuerpo']:
                return error_response('Esta clave ya identifica otra respuesta. Actualiza el historial.', 'CLAVE_REUTILIZADA', status=409)
            return success_response(data=ReplyOutput(existing).data)
        if record.respuestas.filter(asunto=values['asunto'], cuerpo=values['cuerpo'], estado__in=['enviando', 'indeterminada']).exists():
            return error_response('Ya existe esta respuesta con resultado pendiente o incierto. Revisa el transporte antes de crear otro intento.', 'RESULTADO_INCIERTO', status=409)
        if record.estado == 'cerrada':
            raise ValidationError('La consulta está cerrada. Pásala a En revisión antes de responder.')
        if record.respuestas.filter(creado__gte=timezone.now()-timedelta(days=1)).count() >= 50:
            raise Throttled(detail='Se alcanzó el límite diario de borradores para esta consulta.')
        reply = RespuestaActividad.objects.create(solicitud=record, autor=request.user,
            destinatario=record.email, **values)
        return success_response(data=ReplyOutput(reply).data, status=201)


class SendActivityReplyView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, reply_id):
        store = resolver_tienda(request, exigir_propietario=True)
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            record = consultation(store, pk, lock=True)
            reply = get_object_or_404(RespuestaActividad.objects.select_for_update(), pk=reply_id, solicitud=record)
            if reply.estado in ('aceptada', 'enviando', 'indeterminada'):
                return success_response(data=ReplyOutput(reply).data,
                    mensaje='Se conserva el intento existente. No se realiza otro envío.')
            if not delivery_available():
                return error_response('Envío deshabilitado. Revisa el correo de pruebas antes de enviar.', 'ENVIO_DESHABILITADO', status=409)
            if record.estado == 'cerrada':
                raise ValidationError('La consulta está cerrada.')
            if reply.destinatario != record.email:
                raise ValidationError('El destinatario de la consulta cambió. Revisa el detalle.')
            count = reply.intentos.count()
            if count >= 3:
                raise Throttled(detail='Se alcanzó el máximo de tres intentos. Revisa el historial antes de continuar.')
            if IntentoRespuestaActividad.objects.filter(respuesta__solicitud__tienda=store,
                    creado__gte=timezone.now()-timedelta(hours=1)).count() >= 20:
                raise Throttled(detail='Se alcanzó el límite de respuestas por hora de la tienda.')
            attempt = IntentoRespuestaActividad.objects.create(respuesta=reply, numero=count+1)
            reply.estado = 'enviando'
            reply.save(update_fields=['estado', 'actualizado'])
        # El intento se confirma antes de contactar SMTP. Una caída deja enviando: nunca se reintenta a ciegas.
        try:
            result = enviar_correo(reply.destinatario, reply.asunto, reply.cuerpo,
                nombre_remitente=store.nombre, reply_to=store.correo_negocio,
                referencia=f'activity_reply {reply.pk}')
            definitive = result.codigo in ('destinatario_invalido', 'contenido_invalido') or result.detalle in (
                'SMTPRecipientsRefused', 'SMTPSenderRefused', 'SMTPAuthenticationError', 'SMTPConnectError', 'ConnectionRefusedError', 'gaierror')
            state = 'aceptada' if result.enviado else 'fallida' if definitive else 'indeterminada'
            code = result.codigo
        except Exception:
            state, code = 'indeterminada', 'resultado_desconocido'
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            record = consultation(store, pk, lock=True)
            reply = RespuestaActividad.objects.select_for_update().get(pk=reply.pk)
            attempt.estado, attempt.codigo, attempt.finalizado = state, code, timezone.now()
            attempt.save(update_fields=['estado', 'codigo', 'finalizado'])
            reply.estado = state
            reply.save(update_fields=['estado', 'actualizado'])
            if state == 'aceptada' and record.estado != 'cerrada':
                record.estado = 'respondida'
                record.save(update_fields=['estado', 'actualizado'])
        return success_response(data=ReplyOutput(reply).data,
            mensaje='Respuesta aceptada por el transporte de pruebas; no confirma entrega al buzón.' if state == 'aceptada'
                else 'No se confirmó el envío. Revisa el resultado y el historial antes de reintentar.')
