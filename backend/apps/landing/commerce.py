import json
import os
from datetime import timedelta
from uuid import NAMESPACE_URL, uuid5

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.contacts import eligible_consents
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response
from apps.landing.activity_views import NoStoreActivityView, ActivityIPThrottle, ActivityEmailThrottle
from apps.landing.activities import ActivitySubmissionSerializer, CONSENT_VERSION
from apps.landing.models import ConfiguracionLanding, SolicitudActividad, RegistroCarritoAbandonado, EnvioCorreoTienda


def commerce_options(store):
    config = ConfiguracionLanding.objects.filter(tienda=store).first()
    raw = (config.contenido or {}).get('comercio', {}) if config else {}
    return {key: raw.get(key) is True for key in ('cotizaciones', 'factura', 'recordatorios')}


def reminders_allowed():
    return os.environ.get('CART_REMINDERS_ENABLED') == '1'


class CommerceInput(StrictSerializer):
    cotizaciones = serializers.BooleanField(required=False)
    factura = serializers.BooleanField(required=False)
    recordatorios = serializers.BooleanField(required=False)

    def validate_recordatorios(self, value):
        if value and not reminders_allowed():
            raise ValidationError('El administrador del sistema aún no permite los recordatorios.')
        return value


class CommerceView(NoStoreActivityView):
    permission_classes = [AllowAny]

    def get(self, request):
        return success_response(data=commerce_options(resolver_tienda(request)))

    @transaction.atomic
    def patch(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        Tienda.objects.select_for_update().get(pk=store.pk)
        data = CommerceInput(data=request.data)
        data.is_valid(raise_exception=True)
        config, _ = ConfiguracionLanding.objects.select_for_update().get_or_create(tienda=store)
        content = dict(config.contenido or {})
        content['comercio'] = {**commerce_options(store), **data.validated_data}
        config.contenido = content
        config.save(update_fields=['contenido'])
        return success_response(data=content['comercio'])


class AbandonedCartsView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.landing.abandoned_cart_jobs import completed_checkout, reminder_frequency_blocked, recovery_links
        from apps.core.infrastructure.store_mail import connection_state
        store = resolver_tienda(request, exigir_propietario=True)
        rows = RegistroCarritoAbandonado.objects.filter(tienda=store).order_by('-ultima_actividad')[:100]
        result = []
        for row in rows:
            consent = eligible_consents(store).filter(email=row.email).first()
            eligible = bool(row.estado == 'activo' and row.items and consent
                and row.ultima_actividad <= timezone.now() - timedelta(hours=2)
                and not completed_checkout(row) and not reminder_frequency_blocked(store, row)
                and recovery_links(store, row, consent))
            result.append({'id': row.pk, 'email': row.email, 'items': row.items,
                'ultima_actividad': row.ultima_actividad, 'estado': row.estado, 'elegible': eligible})
        history = list(EnvioCorreoTienda.objects.filter(tienda=store, categoria='recordatorio_carrito')
            .order_by('-creado').values('destinatario', 'estado', 'creado', 'codigo')[:100])
        return success_response(data={'opciones': commerce_options(store), 'permitido': reminders_allowed(),
            'correo': connection_state(store), 'carritos': result, 'historial': history})


class QuoteInput(ActivitySubmissionSerializer):
    producto = serializers.RegexField(r'^[0-9a-f]{24}$')
    empresa = serializers.CharField(max_length=180, allow_blank=True, default='')
    cantidad = serializers.IntegerField(min_value=1, max_value=1000000)


class WholesaleQuoteView(NoStoreActivityView):
    permission_classes = [AllowAny]
    throttle_classes = [ActivityIPThrottle, ActivityEmailThrottle]

    @transaction.atomic
    def post(self, request):
        from apps.catalog.infrastructure.repositories import ProductRepository
        from apps.landing.activity_owner_notifications import programar_aviso_consulta
        store = resolver_tienda(request)
        Tienda.objects.select_for_update().get(pk=store.pk)
        if not commerce_options(store)['cotizaciones']:
            raise NotFound('Esta tienda no recibe cotizaciones por mayor.')
        data = QuoteInput(data=request.data, context={'tipo': 'cotizacion'})
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        product_id = values.pop('producto')
        product = ProductRepository().get_by_id(str(store.pk), product_id)
        if not product or product.get('activo') is not True:
            raise NotFound('El producto no está disponible.')
        section_id = uuid5(NAMESPACE_URL, f'openmind:cotizacion:{store.pk}:{product_id}')
        values.pop('consentimiento')
        request_id = values.pop('solicitud_id')
        company, quantity = values.pop('empresa'), values.pop('cantidad')
        values['mensaje'] = f"Producto: {product.get('nombre', '')} ({product_id})\nCantidad: {quantity}\nEmpresa: {company or 'No indicada'}\n\n{values['mensaje']}"
        fingerprint = salted_hmac('wholesale_quote', json.dumps({'producto': product_id,
            'dia': timezone.localdate().isoformat(), **values}, sort_keys=True)).hexdigest()
        previous = SolicitudActividad.objects.filter(tienda=store, solicitud_id=request_id).first()
        if previous and (previous.seccion_id != section_id or any(getattr(previous, key) != value for key, value in values.items())):
            raise ValidationError('Esta clave de reintento pertenece a otra solicitud.')
        if not previous and not SolicitudActividad.objects.filter(tienda=store, huella=fingerprint).exists():
            record = SolicitudActividad.objects.create(tienda=store, seccion_id=section_id,
                titulo_actividad=f"Cotización por mayor · {product.get('nombre', '')}"[:255],
                tipo_actividad='producto', tipo='consulta', estado='nueva', solicitud_id=request_id, huella=fingerprint,
                usuario=request.user if request.user.is_authenticated else None,
                consentimiento_version=CONSENT_VERSION + '-cotizacion', consentimiento_fecha=timezone.now(), **values)
            if store.correo_negocio:
                programar_aviso_consulta(record.pk)
        return success_response(data={'recibida': True}, mensaje='Cotización guardada. La tienda podrá responder desde su panel.', status=202)


class InvoiceInput(StrictSerializer):
    rut = serializers.CharField(max_length=14)
    razon_social = serializers.CharField(max_length=180)
    giro = serializers.CharField(max_length=180)
    direccion = serializers.CharField(max_length=240)
    comuna = serializers.CharField(max_length=100)
    email = serializers.EmailField(max_length=254)

    def validate_rut(self, value):
        value = value.replace('.', '').replace(' ', '').upper()
        parts = value.split('-')
        if len(parts) != 2 or not parts[0].isascii() or not parts[0].isdigit() or not 1 <= len(parts[0]) <= 8 or int(parts[0]) == 0:
            raise ValidationError('Ingresa un RUT válido con dígito verificador.')
        total = sum(int(digit) * (2 + index % 6) for index, digit in enumerate(reversed(parts[0])))
        check = 11 - total % 11
        if parts[1] != ('K' if check == 10 else '0' if check == 11 else str(check)):
            raise ValidationError('El dígito verificador del RUT no es válido.')
        return f'{int(parts[0])}-{parts[1]}'
