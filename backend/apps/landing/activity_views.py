import json
from collections.abc import Mapping

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response
from apps.landing.activities import (ActivitySubmissionSerializer, CONSENT_VERSION, CONSULT_STATES,
    ENROLL_STATES, activity_title, find_activity, require_enrollment)
from apps.landing.models import ConfiguracionLanding, SolicitudActividad


class ActivityIPThrottle(SimpleRateThrottle):
    scope = 'activity_ip'
    rate = '15/hour'

    def get_cache_key(self, request, view):
        return self.scope + ':' + salted_hmac(self.scope, self.get_ident(request)).hexdigest()


class ActivityEmailThrottle(ActivityIPThrottle):
    scope = 'activity_email'
    rate = '5/hour'

    def get_cache_key(self, request, view):
        email = str(request.data.get('email', '')).strip().lower() if isinstance(request.data, Mapping) else ''
        return self.scope + ':' + salted_hmac(self.scope, email).hexdigest()


class NoStoreActivityView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        response['Referrer-Policy'] = 'no-referrer'
        return response


class ActivitySubmissionView(NoStoreActivityView):
    permission_classes = [AllowAny]
    throttle_classes = [ActivityIPThrottle, ActivityEmailThrottle]
    tipo = 'consulta'

    @transaction.atomic
    def post(self, request, pk):
        store = resolver_tienda(request)
        # Same lock order as landing writes; capacity/status cannot race a publication edit.
        Tienda.objects.select_for_update().get(pk=store.pk)
        config = ConfiguracionLanding.objects.select_for_update().filter(tienda=store).first()
        section = find_activity(config, pk)
        if not any(item.get('tipo') == self.tipo and item.get('visible') for item in section.get('componentes', [])):
            from rest_framework.exceptions import NotFound
            raise NotFound('El formulario de esta actividad no está publicado.')
        data = ActivitySubmissionSerializer(data=request.data, context={'tipo': self.tipo})
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        values.pop('consentimiento')
        request_id = values.pop('solicitud_id')
        fingerprint = salted_hmac('activity_submission', json.dumps({'seccion': str(pk), 'tipo': self.tipo,
            'dia': timezone.localdate().isoformat(), **values}, sort_keys=True, ensure_ascii=True)).hexdigest()
        existing_key = SolicitudActividad.objects.filter(tienda=store, solicitud_id=request_id).first()
        if existing_key and existing_key.huella != fingerprint:
            # Reuse after midnight remains safe if the immutable submitted payload matches.
            same = existing_key.seccion_id == pk and existing_key.tipo == self.tipo and all(getattr(existing_key, key) == value for key, value in values.items())
            if not same:
                raise ValidationError('La clave de reintento ya pertenece a otra solicitud. Actualiza el formulario.')
        duplicate = existing_key or SolicitudActividad.objects.filter(tienda=store, huella=fingerprint).first()
        if self.tipo == 'inscripcion':
            require_enrollment(section)
            duplicate = duplicate or SolicitudActividad.objects.filter(tienda=store, seccion_id=pk, tipo=self.tipo, email=values['email']).first()
        if not duplicate:
            state = 'nueva'
            if self.tipo == 'inscripcion':
                capacity = section['actividad']['cupos']
                if capacity is not None and SolicitudActividad.objects.filter(tienda=store, seccion_id=pk, tipo=self.tipo).exclude(estado='cancelada').count() >= capacity:
                    raise ValidationError('No quedan cupos disponibles para este taller.')
                state = 'confirmada' if section['actividad']['confirmacion'] == 'automatica' else 'pendiente'
            SolicitudActividad.objects.create(tienda=store, seccion_id=pk, titulo_actividad=activity_title(section),
                tipo_actividad=section['actividad']['tipo'], tipo=self.tipo,
                usuario=request.user if request.user.is_authenticated else None,
                estado=state, solicitud_id=request_id, huella=fingerprint,
                consentimiento_version=CONSENT_VERSION + ('-consulta' if self.tipo == 'consulta' else '-inscripcion'),
                consentimiento_fecha=timezone.now(), **values)
        # Same response for new/duplicate, no personal data or enrollment-status oracle.
        return success_response(data={'recibida': True}, mensaje='Recibimos tus datos. Si ya existía una solicitud, se conserva sin duplicarla. La tienda gestionará tu solicitud; esto no acredita pagos.', status=202)


class ActivityEnrollmentView(ActivitySubmissionView):
    tipo = 'inscripcion'


class ActivityManagementQuery(StrictSerializer):
    tipo = serializers.ChoiceField(choices=('consulta', 'inscripcion'), required=False)
    estado = serializers.ChoiceField(choices=CONSULT_STATES + ENROLL_STATES, required=False)
    seccion = serializers.UUIDField(required=False)
    pagina = serializers.IntegerField(min_value=1, max_value=100000, default=1)
    archivada = serializers.BooleanField(required=False, default=False)


class ActivityStateSerializer(StrictSerializer):
    estado = serializers.ChoiceField(choices=CONSULT_STATES + ENROLL_STATES, required=False)
    archivada = serializers.BooleanField(required=False)

    def validate(self, attrs):
        # Only one operation per PATCH; status changes never archive automatically.
        if ('estado' in attrs) == ('archivada' in attrs):
            raise serializers.ValidationError('Envía solamente el estado o la opción de archivar.')
        return attrs


class ActivityRequestOutput(serializers.ModelSerializer):
    class Meta:
        model = SolicitudActividad
        fields = ['id', 'seccion_id', 'titulo_actividad', 'tipo_actividad', 'tipo', 'nombre', 'apellido', 'email',
                  'telefono', 'mensaje', 'estado', 'archivada', 'archivada_en', 'creado', 'actualizado',
                  'consentimiento_version', 'consentimiento_fecha']


class ActivityRequestsView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        query = ActivityManagementQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        filters = query.validated_data
        # By default the inbox excludes archived consultations.
        records = SolicitudActividad.objects.filter(tienda=store, archivada=filters['archivada'])
        for field in ('tipo', 'estado'):
            if field in filters:
                records = records.filter(**{field: filters[field]})
        if 'seccion' in filters:
            records = records.filter(seccion_id=filters['seccion'])
        total = records.count()
        offset = (filters['pagina'] - 1) * 20
        return success_response(data={'resultados': ActivityRequestOutput(records[offset:offset + 20], many=True).data,
            'total': total, 'pagina': filters['pagina'], 'paginas': max(1, (total + 19) // 20)})


class ActivityRequestView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, pk):
        store = resolver_tienda(request, exigir_propietario=True)
        Tienda.objects.select_for_update().get(pk=store.pk)
        config = ConfiguracionLanding.objects.select_for_update().filter(tienda=store).first()
        record = get_object_or_404(SolicitudActividad.objects.select_for_update(), tienda=store, pk=pk)
        data = ActivityStateSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        if 'archivada' in data.validated_data:
            if record.tipo != 'consulta':
                raise ValidationError({'archivada': 'Solo se pueden archivar consultas, no inscripciones.'})
            archived = data.validated_data['archivada']
            record.archivada = archived
            record.archivada_en = timezone.now() if archived else None
            record.save(update_fields=['archivada', 'archivada_en', 'actualizado'])
            return success_response(data=ActivityRequestOutput(record).data)

        state = data.validated_data['estado']
        if state not in (CONSULT_STATES if record.tipo == 'consulta' else ENROLL_STATES):
            raise ValidationError('El estado no corresponde a este tipo de solicitud.')
        if record.tipo == 'consulta' and state == 'respondida' and state != record.estado and not record.respuestas.filter(estado='aceptada').exists():
            raise ValidationError('Respondida se establece tras aceptar una respuesta enviada. Usa En revisión o Cerrada para la gestión manual.')
        if record.tipo == 'inscripcion' and state != 'cancelada' and state != record.estado:
            section = find_activity(config, record.seccion_id)
            require_enrollment(section)
            capacity = section['actividad']['cupos']
            if record.estado == 'cancelada' and capacity is not None and SolicitudActividad.objects.filter(tienda=store, seccion_id=record.seccion_id, tipo='inscripcion').exclude(estado='cancelada').count() >= capacity:
                raise ValidationError('No quedan cupos para reactivar esta inscripción.')
        record.estado = state
        record.save(update_fields=['estado', 'actualizado'])
        return success_response(data=ActivityRequestOutput(record).data)
