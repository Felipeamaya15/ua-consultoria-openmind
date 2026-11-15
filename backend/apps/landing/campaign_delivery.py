"""Cola persistente, lotes acotados, bajas y envíos promocionales individuales."""
from uuid import UUID, uuid5
from html import escape
from urllib.parse import urlencode, urlsplit

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError, Throttled
from rest_framework.permissions import IsAuthenticated, AllowAny

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.contacts import eligible_consents
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.infrastructure.store_mail import connection_state, send_store_mail
from apps.core.models import Tienda, ConsentimientoComercial, EventoConsentimiento
from apps.core.presentation.responses import success_response, error_response
from apps.landing.activity_views import NoStoreActivityView
from apps.landing.campaigns import campaign_data
from apps.landing.campaign_rendering import render_campaign, identity, web_url
from apps.landing.models import CampanaPromocional, DestinatarioCampana
from apps.landing.models import EnvioCorreoTienda

SALT = 'scrum522-campaign-unsubscribe-v1'


def unsubscribe_link(row, recipient):
    base = settings.STORE_MAIL_PUBLIC_API_URL
    parsed = urlsplit(base)
    if not web_url(base) or (parsed.scheme != 'https' and parsed.hostname not in ('localhost', '127.0.0.1', 'testserver')):
        raise ValidationError('Configura una dirección HTTPS pública para las bajas de campañas.')
    token = signing.dumps({'tienda': row.tienda_id, 'contacto': recipient.consentimiento_id,
        'revision': recipient.revision_consentimiento, 'campana': str(row.pk)}, salt=SALT)
    return base + '/api/tienda/campanas/baja/?' + urlencode({'token': token})


def eligible(row, recipient, consent):
    return (consent.tienda_id == row.tienda_id and consent.email == recipient.email
        and consent.revision == recipient.revision_consentimiento
        and eligible_consents(row.tienda).filter(pk=consent.pk).exists())


def update_summary(row):
    states = set(row.destinatarios.values_list('estado', flat=True))
    if row.estado == 'cancelada':
        return
    row.estado = ('procesando' if 'procesando' in states else 'pendiente' if 'pendiente' in states else
        'aceptada' if states == {'aceptada'} else 'parcial' if 'aceptada' in states else 'fallida')
    row.save(update_fields=['estado', 'actualizado'])


def process_one(store, campaign_id):
    """Reservar antes de SMTP; caídas dejan procesando y nunca disparan otro envío."""
    with transaction.atomic():
        Tienda.objects.select_for_update().get(pk=store.pk)
        row = get_object_or_404(CampanaPromocional.objects.select_for_update(), pk=campaign_id, tienda=store)
        if row.estado not in ('pendiente', 'procesando'):
            return row
        if not connection_state(store)['envio_habilitado']:
            raise ValidationError('Revisa la conexión antes de continuar la campaña.')
        recipient = row.destinatarios.select_for_update().filter(estado='pendiente').first()
        if not recipient:
            update_summary(row)
            return row
        recipient.estado = 'procesando'
        recipient.save(update_fields=['estado'])
        row.estado = 'procesando'
        row.save(update_fields=['estado', 'actualizado'])
    # Same store/campaign/consent lock order in all writers. Withdrawal and cancel
    # cannot complete between the final check and submission to the provider.
    try:
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            row = CampanaPromocional.objects.select_for_update().get(pk=campaign_id, tienda=store)
            recipient = DestinatarioCampana.objects.select_for_update().get(pk=recipient.pk)
            if row.estado == 'cancelada' or recipient.estado != 'procesando':
                return row
            consent = ConsentimientoComercial.objects.select_for_update().get(pk=recipient.consentimiento_id)
            if not eligible(row, recipient, consent):
                recipient.estado, recipient.ultimo_error = 'excluido', 'consentimiento_no_vigente'
            else:
                link = unsubscribe_link(row, recipient)
                text, html = render_campaign(row, link)
                entry = send_store_mail(store, uuid5(row.pk, f'{recipient.pk}:{recipient.intentos+1}'),
                    recipient.email, row.asunto, text, category='campana', html=html,
                    reference=row.pk,
                    headers={'List-Unsubscribe': '<' + link + '>'})
                recipient.estado, recipient.ultimo_error = entry.estado, entry.codigo
                recipient.intentos += 1
            recipient.finalizado = timezone.now()
            recipient.save(update_fields=['estado', 'ultimo_error', 'intentos', 'finalizado'])
            update_summary(row)
    except (Throttled, ValueError, ValidationError):
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            row = CampanaPromocional.objects.select_for_update().get(pk=campaign_id, tienda=store)
            row.destinatarios.filter(pk=recipient.pk, estado='procesando').update(estado='pendiente')
            update_summary(row)
        raise
    return row


class ConfirmInput(StrictSerializer):
    revision = serializers.IntegerField(min_value=1)
    confirmar = serializers.BooleanField()

    def validate_confirmar(self, value):
        if not value:
            raise serializers.ValidationError('Confirma expresamente el envío promocional.')
        return value


class CampaignActionView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]
    action = 'preview'

    def get(self, request, pk):
        store = resolver_tienda(request, exigir_propietario=True)
        row = get_object_or_404(CampanaPromocional, pk=pk, tienda=store)
        if self.action == 'history':
            page = serializers.IntegerField(min_value=1, max_value=100000).run_validation(request.query_params.get('pagina', 1))
            records = EnvioCorreoTienda.objects.filter(tienda=store, referencia=row.pk).order_by('-creado', '-pk')
            total = records.count()
            return success_response(data={'total': total, 'pagina': page, 'paginas': max(1, (total+49)//50),
                'resultados': list(records.values('destinatario', 'estado', 'codigo', 'categoria', 'proveedor', 'creado', 'finalizado')[(page-1)*50:page*50])})
        if self.action != 'preview':
            return error_response('Método no permitido.', 'METODO_INVALIDO', status=405)
        _, html = render_campaign(row, '#baja-personal-en-el-envio')
        return success_response(data={'html': html, 'asunto': row.asunto, 'campana': campaign_data(row)})

    def post(self, request, pk):
        store = resolver_tienda(request, exigir_propietario=True)
        if self.action == 'process':
            if request.data:
                raise ValidationError('Procesar no admite destinatarios ni contenido adicional.')
            row = process_one(store, pk)
            return success_response(data=campaign_data(row))
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            row = get_object_or_404(CampanaPromocional.objects.select_for_update(), pk=pk, tienda=store)
            if self.action == 'test':
                from apps.core.presentation.gmail_oauth_views import MailTestInput
                data = MailTestInput(data=request.data)
                data.is_valid(raise_exception=True)
                recipient = connection_state(store)['correo'] or request.user.email
                text, html = render_campaign(row, '#prueba-sin-baja-real')
                key = data.validated_data['clave']
            elif self.action in ('confirm', 'retry'):
                data = ConfirmInput(data=request.data)
                data.is_valid(raise_exception=True)
                if row.revision != data.validated_data['revision']:
                    return error_response('La campaña cambió. Vuelve a previsualizarla.', 'REVISION_CAMBIO', status=409)
                if not connection_state(store)['envio_habilitado']:
                    return error_response('Revisa la conexión de correo antes de enviar.', 'ENVIO_DESHABILITADO', status=409)
                if self.action == 'confirm' and row.estado != 'borrador':
                    return success_response(data=campaign_data(row), mensaje='Se conserva el envío confirmado; no se duplica.')
                if self.action == 'retry' and row.estado not in ('parcial', 'fallida'):
                    return error_response('Solo se reintentan fallos definitivos de una campaña finalizada.', 'REINTENTO_INVALIDO', status=409)
                if not row.asunto.strip() or not row.cuerpo.strip():
                    raise ValidationError('Completa el asunto y el contenido antes de enviar.')
                candidates = row.destinatarios.filter(estado='seleccionado' if self.action == 'confirm' else 'fallida', intentos__lt=3)
                queued = 0
                for recipient_row in candidates.select_related('consentimiento'):
                    recipient_row.estado = 'pendiente' if eligible(row, recipient_row, recipient_row.consentimiento) else 'excluido'
                    queued += recipient_row.estado == 'pendiente'
                    recipient_row.save(update_fields=['estado'])
                if not queued:
                    raise ValidationError('No hay destinatarios autorizados y verificados disponibles para este envío.')
                if self.action == 'confirm':
                    row.diseno = {**row.diseno, '_marca': identity(store)}
                    unsubscribe_link(row, row.destinatarios.filter(estado='pendiente').first())
                    row.confirmada_en = timezone.now()
                row.estado = 'pendiente'
                row.save(update_fields=['estado', 'diseno', 'confirmada_en', 'actualizado'])
                return success_response(data=campaign_data(row), status=202)
            elif self.action == 'cancel':
                if request.data:
                    raise ValidationError('Cancelar no admite contenido adicional.')
                if row.estado in ('borrador', 'pendiente', 'procesando'):
                    row.destinatarios.filter(estado__in=['seleccionado', 'pendiente', 'procesando']).update(estado='cancelada')
                    row.estado = 'cancelada'
                    row.save(update_fields=['estado', 'actualizado'])
                return success_response(data=campaign_data(row))
            else:
                return error_response('Método no permitido.', 'METODO_INVALIDO', status=405)
        try:
            result = send_store_mail(store, key, recipient, '[Prueba] ' + row.asunto[:191], text,
                category='prueba_campana', html=html, reference=row.pk)
        except ValueError:
            return error_response('Revisa la conexión de correo antes de probar.', 'ENVIO_DESHABILITADO', status=409)
        return success_response(data={'estado': result.estado, 'codigo': result.codigo})


class CampaignUnsubscribeView(NoStoreActivityView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def response(self, message, token='', status=200):
        form = (f'<form method="post"><input type="hidden" name="token" value="{escape(token, quote=True)}"><button type="submit">Cancelar suscripción</button></form>' if token else '')
        response = HttpResponse(f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body><h1>Preferencias comerciales</h1><p>{message}</p>{form}</body></html>', status=status)
        response['Cache-Control'] = 'no-store'
        response['Referrer-Policy'] = 'no-referrer'
        response['Content-Security-Policy'] = "default-src 'none'; form-action 'self'; frame-ancestors 'none'"
        return response

    def get(self, request):
        return self.action(request, False)

    def post(self, request):
        return self.action(request, True)

    @transaction.atomic
    def action(self, request, withdraw):
        store = resolver_tienda(request)
        token = request.data.get('token', '') if withdraw else request.query_params.get('token', '')
        try:
            if not isinstance(token, str) or len(token) > 1500:
                raise ValueError()
            value = signing.loads(token, salt=SALT)
            if value['tienda'] != store.pk:
                raise ValueError()
            campaign_id = UUID(value['campana'])
            record = ConsentimientoComercial.objects.select_for_update().get(pk=value['contacto'], tienda=store)
            if record.estado == 'retirado':
                return self.response('Tu autorización ya está retirada. No recibirás nuevas campañas.')
            if record.revision != value['revision']:
                raise ValueError()
            if not withdraw:
                return self.response('Confirma que quieres dejar de recibir promociones de esta tienda.', token)
            record.estado = 'retirado'
            record.save()
            EventoConsentimiento.objects.create(consentimiento=record, tipo='retirado', revision=record.revision,
                version_texto=record.version_texto, texto='Cancelar suscripción desde una campaña',
                metodo='baja_campana', solicitud_id=campaign_id)
            return self.response('Suscripción cancelada. Ya no eres elegible para promociones de esta tienda.')
        except (signing.BadSignature, ValueError, TypeError, KeyError, ConsentimientoComercial.DoesNotExist):
            return self.response('El enlace no es válido. Solicita un nuevo enlace desde Preferencias comerciales de la tienda.', status=400)
