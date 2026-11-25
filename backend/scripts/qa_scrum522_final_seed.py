"""Amplía únicamente las fixtures sintéticas para los recorridos finales."""
import json
from pathlib import Path
from datetime import datetime
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authtoken.models import Token
from apps.core.models import Tienda, ConsentimientoComercial, Pedido, VerificacionCorreoCuenta, SolicitudConsentimiento
from apps.core.email_verification import record_verified_email

if not settings.DATABASES['default']['NAME'].startswith('scrum522_qa_') or not settings.MONGO_DB_NAME.startswith('scrum522_qa_'):
    raise RuntimeError('Esta fixture requiere PostgreSQL y MongoDB sintéticos.')
store = Tienda.objects.get()
if store.id_usuario_propietario.username != 'scrum522-browser-qa' or settings.STORE_MAIL_EXTERNAL_ENABLED:
    raise RuntimeError('Tienda o transporte no autorizados para esta fixture.')
contact = ConsentimientoComercial.objects.get(tienda=store,email='cliente-sintetico@example.test')
if contact.estado != 'autorizado' or not contact.verificado:
    contact.estado='autorizado'; contact.verificado=True; contact.revision+=1
    contact.fecha_autorizacion=contact.fecha_verificacion=timezone.now()
    contact.version_texto='fixture-qa';contact.referencia_evidencia='fixture-qa-aislada';contact.save()
private = Path(settings.BASE_DIR) / '.env.scrum522.postman.json'
data = json.loads(private.read_text(encoding='utf-8'))
owner_token, _ = Token.objects.get_or_create(user=store.id_usuario_propietario)
Token.objects.filter(pk=owner_token.pk).update(created=timezone.now())
for row in data['values']:
    if row['key'] == 'ownerToken':
        row['value'] = owner_token.key
data['values'] = [row for row in data['values'] if row['key'] not in ('verifiedBuyerToken','unverifiedBuyerToken')]
for verified, key in [(True, 'verifiedBuyerToken'), (False, 'unverifiedBuyerToken')]:
    user, _ = get_user_model().objects.get_or_create(username='scrum522-final-'+key,
        defaults={'email': ('verified' if verified else 'unverified')+'-buyer@example.test'})
    if verified:
        record_verified_email(user.pk, user.email, 'fixture_qa_verificada')
    else:
        VerificacionCorreoCuenta.objects.filter(usuario=user).delete()
        previous = ConsentimientoComercial.objects.filter(tienda=store,email=user.email).first()
        if previous and previous.estado != 'retirado':
            previous.estado = 'retirado'; previous.save()
        SolicitudConsentimiento.objects.filter(consentimiento__tienda=store,
            consentimiento__email=user.email,fecha_consumida__isnull=True).update(fecha_vencimiento=timezone.now())
    token, _ = Token.objects.get_or_create(user=user)
    Token.objects.filter(pk=token.pk).update(created=timezone.now())
    data['values'].append({'key':key,'value':token.key,'enabled':True})
for index in range(24):
    email = f'qa-filter-{index:02}@example.test'
    record, _ = ConsentimientoComercial.objects.get_or_create(tienda=store,email=email,defaults={'estado':'pendiente'})
    order, _ = Pedido.objects.get_or_create(tienda=store,identificador=f'SCRUM522-FILTER-{index:02}',
        defaults={'correo_contacto':email,'monto_total':1000})
    Pedido.objects.filter(pk=order.pk).update(fecha_creacion=datetime.fromisoformat(
        '2026-11-14T15:00:00+00:00' if index < 12 else '2026-10-01T15:00:00+00:00'))
private.write_text(json.dumps(data), encoding='utf-8')
print('Clientes verificado/no verificado y 24 contactos sintéticos preparados; sin envíos.')
