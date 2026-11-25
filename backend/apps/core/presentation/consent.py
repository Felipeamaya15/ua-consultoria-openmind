from django.db import OperationalError, ProgrammingError
from django.utils.crypto import salted_hmac
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, Throttled
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.core import commercial_consent as consent
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda, ConsentimientoComercial, SolicitudConsentimiento, VerificacionCorreoCuenta, EventoConsentimiento
from apps.core.email_verification import record_verified_email, email_is_verified
from apps.authentication.presentation.profile import StrictSerializer, IsCustomer
from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from uuid import uuid4
from apps.core.infrastructure.contacts import eligible_consents
from apps.core.presentation.responses import success_response, error_response


class RequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=320)
    proposito = serializers.ChoiceField(choices=['confirmar', 'gestionar'])
    version_texto = serializers.ChoiceField(choices=[consent.VERSION])
    plantilla = serializers.IntegerField(min_value=1, max_value=4, default=1)


class ActionSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=1000, trim_whitespace=False, write_only=True)
    accion = serializers.ChoiceField(choices=['confirmar', 'consultar', 'retirar'])


class ConsentIPThrottle(SimpleRateThrottle):
    scope = 'commercial_consent_ip'
    rate = '20/hour'

    def get_cache_key(self, request, view):
        return 'consent:ip:' + salted_hmac(self.scope, self.get_ident(request)).hexdigest()


class ConsentRecipientThrottle(ConsentIPThrottle):
    scope = 'commercial_consent_recipient'
    rate = '3/hour'

    def get_cache_key(self, request, view):
        if request.method != 'POST' or not request.path.endswith('/solicitar/'):
            return None
        value = str(request.data.get('email', '')).strip().lower()
        return 'consent:recipient:' + salted_hmac(self.scope, value).hexdigest()


class ConsentView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ConsentIPThrottle, ConsentRecipientThrottle]

    def handle_exception(self, exc):
        if isinstance(exc, (ProgrammingError, OperationalError)):
            return error_response('Preferencias comerciales temporalmente no disponibles.', 'CONSENTIMIENTO_NO_DISPONIBLE', status=503)
        return super().handle_exception(exc)

    def throttled(self, request, wait):
        raise Throttled(detail='Has solicitado varios enlaces. Espera antes de reintentar.')

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        response['Referrer-Policy'] = 'no-referrer'
        return response


class ConsentRequestView(ConsentView):
    def get(self, request):
        resolver_tienda(request)
        return success_response(data={'version_texto': consent.VERSION, 'texto': consent.TEXT})

    def post(self, request):
        store = resolver_tienda(request)
        data = RequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if data.validated_data['proposito'] == 'confirmar' and request.user.is_authenticated and Tienda.objects.del_propietario(request.user).exists():
            raise PermissionDenied('El propietario no puede autorizar contactos por otras personas.')
        email = data.validated_data['email'].strip().lower()
        try:
            consent.request_link(store, email, data.validated_data['proposito'], data.validated_data['plantilla'])
        except consent.DeliveryUnavailable:
            return error_response('No pudimos enviar el enlace. Tu compra o registro pueden continuar. Reintenta desde Preferencias comerciales.', 'CONSENTIMIENTO_NO_DISPONIBLE', status=503)
        except (OperationalError, ProgrammingError):
            return error_response('Preferencias comerciales temporalmente no disponibles.', 'CONSENTIMIENTO_NO_DISPONIBLE', status=503)
        return success_response(mensaje=consent.GENERIC, status=202)


class ConsentActionView(ConsentView):
    def post(self, request):
        store = resolver_tienda(request)
        data = ActionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        action = data.validated_data['accion']
        try:
            result = consent.use_link(store, data.validated_data['token'],
                'confirmar' if action == 'confirmar' else 'gestionar', action)
        except consent.InvalidLink:
            return error_response('El enlace no es válido o venció. Solicita uno nuevo.', 'ENLACE_INVALIDO')
        except (OperationalError, ProgrammingError):
            return error_response('Preferencias comerciales temporalmente no disponibles.', 'CONSENTIMIENTO_NO_DISPONIBLE', status=503)
        if action == 'confirmar' and result.get('estado') == 'autorizado' and request.user.is_authenticated:
            record = SolicitudConsentimiento.objects.select_related('consentimiento').get(
                pk=consent.decode(data.validated_data['token'], 'confirmar')).consentimiento
            if record.email == request.user.email.strip().lower():
                record_verified_email(request.user.pk, record.email, 'enlace_email')
        message = {'confirmar': 'Autorización confirmada. Puedes retirarla cuando quieras.',
                   'retirar': 'Autorización retirada. Ya no eres elegible para publicidad de esta tienda.',
                   'consultar': 'Preferencias consultadas.'}[action]
        return success_response(data=result, mensaje=message)


class OwnPreferenceInput(StrictSerializer):
    recibir = serializers.BooleanField()
    version_texto = serializers.ChoiceField(choices=[consent.VERSION])


def own_state(store, user):
    record = ConsentimientoComercial.objects.filter(tienda=store, email=user.email.strip().lower()).first()
    eligible = bool(record and eligible_consents(store).filter(pk=record.pk).exists())
    return {'email': user.email, 'correo_verificado': email_is_verified(user),
        'estado': 'sin_registro' if not record else 'autorizado' if eligible else
            'pendiente' if record.estado == 'autorizado' else record.estado,
        'recibir': eligible, 'version_texto': consent.VERSION, 'texto': consent.TEXT,
        'fecha_autorizacion': record.fecha_autorizacion if record else None,
        'fecha_actualizacion': record.fecha_actualizacion if record else None,
        'fecha_retirada': record.fecha_retirada if record else None}


class OwnConsentThrottle(SimpleRateThrottle):
    scope = 'commercial_consent_account'
    rate = '60/hour'

    def get_cache_key(self, request, view):
        return 'consent:account:' + str(request.user.pk)


class OwnConsentView(ConsentView):
    permission_classes = [IsAuthenticated, IsCustomer]
    throttle_classes = [OwnConsentThrottle]

    def get(self, request):
        store = resolver_tienda(request)
        return success_response(data=own_state(store, request.user))

    def post(self, request):
        store = resolver_tienda(request)
        values = OwnPreferenceInput(data=request.data)
        values.is_valid(raise_exception=True)
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
            if not email_is_verified(user):
                raise PermissionDenied('Primero confirma el correo de tu cuenta mediante el enlace enviado a su titular.')
            email = user.email.strip().lower()
            record, _ = ConsentimientoComercial.objects.get_or_create(tienda=store, email=email,
                defaults={'estado': 'pendiente'})
            record = ConsentimientoComercial.objects.select_for_update().get(pk=record.pk)
            receive = values.validated_data['recibir']
            current = eligible_consents(store).filter(pk=record.pk).exists()
            if (receive and current) or (not receive and record.estado == 'retirado'):
                return success_response(data=own_state(store, user), mensaje='Preferencia guardada.')
            now = timezone.now()
            evidence = uuid4()
            record.version_texto = consent.VERSION
            record.referencia_evidencia = f'cuenta-verificada:{user.pk}:{evidence}'
            record.fecha_actualizacion = now
            if receive:
                record.estado = 'autorizado'
                record.verificado = True
                record.fecha_autorizacion = now
                record.fecha_verificacion = VerificacionCorreoCuenta.objects.get(usuario=user).fecha
                record.revision += 1
            else:
                record.estado = 'retirado'
            record.save()
            EventoConsentimiento.objects.create(consentimiento=record, tipo=record.estado,
                revision=record.revision, version_texto=consent.VERSION,
                texto=consent.TEXT if receive else 'Retirar autorización comercial',
                metodo='cuenta_correo_verificado', solicitud_id=evidence)
        return success_response(data=own_state(store, user), mensaje='Preferencia guardada.')
