"""Preparación de campañas: no hay endpoint de envío ni llamadas a SMTP."""
import re
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.infrastructure.contacts import eligible_consents
from apps.core.models import Tienda, ConsentimientoComercial
from apps.core.presentation.responses import success_response, error_response
from apps.landing.activity_views import NoStoreActivityView
from apps.landing.models import CampanaPromocional, DestinatarioCampana

LIMIT = 1000
DISABLED_REASON = 'El envío de campañas aún no está habilitado. Puedes guardar y revisar borradores sin enviar mensajes.'


class CampaignInput(StrictSerializer):
    clave = serializers.UUIDField()
    revision = serializers.IntegerField(min_value=1, required=False)
    nombre = serializers.CharField(max_length=150)
    asunto = serializers.CharField(max_length=200, allow_blank=True)
    cuerpo = serializers.CharField(max_length=5000, allow_blank=True)
    destinatarios = serializers.ListField(child=serializers.IntegerField(min_value=1), max_length=LIMIT)
    producto_id = serializers.RegexField(r'^[a-fA-F0-9]{24}$', allow_blank=True, required=False, default='')

    def validate_asunto(self, value):
        if any(char in value for char in ('\r', '\n', '\x00')):
            raise serializers.ValidationError('El asunto debe ocupar una sola línea.')
        return value

    def validate_cuerpo(self, value):
        if '\x00' in value:
            raise serializers.ValidationError('El contenido contiene caracteres no válidos.')
        return value

    def validate_destinatarios(self, value):
        return list(dict.fromkeys(value))


def product_snapshot(store, product_id, previous):
    if not product_id:
        return {}
    if previous.get('id') == product_id:
        return previous  # Conservar el producto ya elegido aunque cambie el catálogo.
    from apps.catalog.infrastructure.repositories import ProductRepository
    from pymongo.errors import PyMongoError
    try:
        product = ProductRepository().get_admin_product(str(store.pk), product_id)
    except PyMongoError:
        raise ValidationError('No se pudo consultar el producto. El borrador se conserva.') from None
    if not product or str(product.get('tienda_id')) != str(store.pk) or not product.get('activo'):
        raise ValidationError('Selecciona un producto activo de esta tienda.')
    variants = product.get('variantes', [])
    prices = [v.get('precio_oferta') if v.get('precio_oferta') is not None and v['precio_oferta'] < v.get('precio', 0) else v.get('precio', 0) for v in variants]
    image = next(iter(product.get('imagenes', [])), '')
    if not isinstance(image, str) or len(image) > 2800000 or not (image.startswith(('https://','http://','/media/')) or re.match(r'^data:image/(?:png|jpeg|webp|gif);base64,', image)):
        image = ''
    return {'id': product_id, 'nombre': product.get('nombre', ''), 'precio': str(min(prices)) if prices else '', 'imagen': image}


def campaign_data(row, detail=True):
    result = {'id': str(row.pk), 'clave': str(row.clave), 'nombre': row.nombre, 'asunto': row.asunto,
        'cuerpo': row.cuerpo, 'producto': row.producto, 'estado': row.estado, 'revision': row.revision,
        'creado': row.creado, 'actualizado': row.actualizado, 'envio_habilitado': False, 'aviso_envio': DISABLED_REASON}
    if detail:
        selected = list(row.destinatarios.select_related('consentimiento'))
        current_ids = set(eligible_consents(row.tienda).filter(pk__in=[r.consentimiento_id for r in selected]).values_list('pk', flat=True))
        result['destinatarios'] = [{'id': record.consentimiento_id, 'email': record.email,
            'elegible': record.consentimiento_id in current_ids and record.revision_consentimiento == record.consentimiento.revision and record.email == record.consentimiento.email,
            'intentos': record.intentos} for record in selected]
        result['elegibles'] = sum(record['elegible'] for record in result['destinatarios'])
        result['excluidos'] = len(selected)-result['elegibles']
    return result


class CampaignAudienceView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        query = serializers.CharField(max_length=100, allow_blank=True).run_validation(request.query_params.get('q', ''))
        rows = eligible_consents(store).filter(email__icontains=query).order_by('email')
        total = rows.count()
        return success_response(data={'total': total, 'limite': LIMIT, 'limite_excedido': total > LIMIT,
            'resultados': list(rows.values('id','email')[:LIMIT])})


class CampaignsView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        store = resolver_tienda(request, exigir_propietario=True)
        if pk:
            return success_response(data=campaign_data(get_object_or_404(CampanaPromocional, pk=pk, tienda=store)))
        page = serializers.IntegerField(min_value=1, max_value=100000).run_validation(request.query_params.get('pagina', 1))
        rows = CampanaPromocional.objects.filter(tienda=store)
        total = rows.count()
        return success_response(data={'resultados': [campaign_data(row, False) for row in rows[(page-1)*20:page*20]],
            'pagina': page, 'paginas': max(1,(total+19)//20), 'total': total, 'envio_habilitado': False})

    def post(self, request, pk=None):
        if pk:
            return error_response('Método no permitido.', 'METODO_INVALIDO', status=405)
        return self.save(request)

    def put(self, request, pk=None):
        if not pk:
            return error_response('Indica el borrador que quieres guardar.', 'METODO_INVALIDO', status=405)
        return self.save(request, pk)

    @transaction.atomic
    def save(self, request, pk=None):
        store = resolver_tienda(request, exigir_propietario=True)
        Tienda.objects.select_for_update().get(pk=store.pk)
        serializer = CampaignInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        row = get_object_or_404(CampanaPromocional.objects.select_for_update(), pk=pk, tienda=store) if pk else CampanaPromocional.objects.filter(tienda=store, clave=values['clave']).first()
        if row and not pk:
            if (row.nombre, row.asunto, row.cuerpo, row.producto.get('id', '')) != (values['nombre'], values['asunto'], values['cuerpo'], values['producto_id']) or set(row.destinatarios.values_list('consentimiento_id', flat=True)) != set(values['destinatarios']):
                return error_response('Esta clave ya identifica otro borrador. Actualiza la campaña antes de guardar.', 'CLAVE_REUTILIZADA', status=409)
            return success_response(data=campaign_data(row))
        if row and (row.revision != values.get('revision') or row.clave != values['clave']):
            return error_response('El borrador cambió. Vuelve a abrirlo antes de guardar.', 'REVISION_CAMBIO', status=409)
        ids = values['destinatarios']
        records = list(ConsentimientoComercial.objects.filter(tienda=store, pk__in=ids))
        if len(records) != len(ids):
            raise ValidationError('La selección contiene contactos que no pertenecen a esta tienda.')
        snapshot = product_snapshot(store, values['producto_id'], row.producto if row else {})
        if row is None:
            if CampanaPromocional.objects.filter(tienda=store).count() >= 500:
                raise ValidationError('Se alcanzó el límite de 500 borradores. Revisa las campañas existentes.')
            row = CampanaPromocional(tienda=store, autor=request.user, clave=values['clave'])
        else:
            row.revision += 1
        row.nombre, row.asunto, row.cuerpo, row.producto = values['nombre'], values['asunto'], values['cuerpo'], snapshot
        row.save()
        valid = set(eligible_consents(store).filter(pk__in=ids).values_list('pk', flat=True))
        # Solo sustituye la selección del borrador; nunca borra contactos, consentimientos ni envíos.
        row.destinatarios.all().delete()
        DestinatarioCampana.objects.bulk_create([DestinatarioCampana(campana=row, consentimiento=record,
            revision_consentimiento=record.revision, email=record.email,
            estado='seleccionado' if record.pk in valid else 'excluido') for record in records])
        return success_response(data=campaign_data(row), status=200 if pk else 201)
