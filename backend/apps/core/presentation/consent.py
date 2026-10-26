from django.db import OperationalError, ProgrammingError
from django.utils.crypto import salted_hmac
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.core import commercial_consent as consent
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
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
        if not request.path.endswith('/solicitar/'):
            return None
        value = str(request.data.get('email', '')).strip().lower()
        return 'consent:recipient:' + salted_hmac(self.scope, value).hexdigest()


class ConsentView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ConsentIPThrottle, ConsentRecipientThrottle]

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
        if request.user.is_authenticated and Tienda.objects.del_propietario(request.user).exists():
            raise PermissionDenied('El propietario no puede autorizar contactos por otras personas.')
        # Account email/password registration is not proof of mailbox control.
        # Authenticated users also complete double opt-in, including changed email.
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
        message = {'confirmar': 'Autorización confirmada. Puedes retirarla cuando quieras.',
                   'retirar': 'Autorización retirada. Ya no eres elegible para publicidad de esta tienda.',
                   'consultar': 'Preferencias consultadas.'}[action]
        return success_response(data=result, mensaje=message)
