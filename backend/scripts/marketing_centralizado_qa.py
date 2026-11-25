"""Fixtures reutilizables: ejecutar con config.qa_marketing, datos sintéticos y salida externa."""
import base64
import json
import os
from io import BytesIO
from pathlib import Path
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from PIL import Image
from rest_framework.authtoken.models import Token
from apps.core.models import Tienda
from apps.core.image_processing import process_image
from apps.core.infrastructure.mongo_client import get_mongo_db
from apps.landing.media_library import store_media_image
from apps.landing.models import ConfiguracionLanding, RecursoMultimedia

assert settings.DATABASES['default']['NAME'].startswith('marketing_qa_')
assert settings.MONGO_DB_NAME.startswith('marketing_qa_')
assert settings.STORE_MAIL_TRANSPORT == 'mailpit' and not settings.STORE_MAIL_EXTERNAL_ENABLED
output = Path(os.environ['MARKETING_QA_OUTPUT']).resolve()
checkout = settings.BASE_DIR.parent if (settings.BASE_DIR.parent / '.git').exists() else settings.BASE_DIR
assert not output.is_relative_to(checkout.resolve()), 'Las evidencias deben estar fuera del checkout.'
output.mkdir(parents=True, exist_ok=True)
owner, _ = get_user_model().objects.get_or_create(username='marketing-centralizado-synthetic-owner')
store, _ = Tienda.objects.get_or_create(id_usuario_propietario=owner, defaults={'nombre': 'Marketing QA Centralizado'})
token, _ = Token.objects.get_or_create(user=owner)

def picture(color):
    stream = BytesIO()
    Image.new('RGB', (320, 240), color).save(stream, 'PNG')
    return stream.getvalue()

image = picture('#315ba8')
asset = store_media_image(process_image(image, name='qa.png', mime='image/png'), store)
resource, _ = RecursoMultimedia.objects.get_or_create(pk=UUID('52100000-0000-4000-8000-000000000001'), defaults={
    'tienda': store, 'titulo': 'Imagen privada QA', 'descripcion': 'Colección azul de prueba', 'tipo': 'imagen', 'archivo': asset})
locked, _ = RecursoMultimedia.objects.get_or_create(pk=UUID('52100000-0000-4000-8000-000000000002'), defaults={
    'tienda': store, 'titulo': 'Imagen en uso QA', 'tipo': 'imagen', 'archivo': asset})
RecursoMultimedia.objects.get_or_create(pk=UUID('52100000-0000-4000-8000-000000000003'), defaults={
    'tienda': store, 'titulo': 'Enlace desactivado QA', 'tipo': 'enlace', 'url': 'https://example.test/recurso', 'activo': False})
for index in range(25):
    RecursoMultimedia.objects.get_or_create(tienda=store, titulo=f'Archivo QA {index:02}', defaults={'tipo': 'enlace', 'url': 'https://example.test/qa'})
data_image = lambda data: 'data:image/png;base64,' + base64.b64encode(data).decode()
product_id = get_mongo_db().productos.update_one({'tienda_id': str(store.pk), 'slug': 'bolso-qa-marketing-centralizado'}, {'$set': {
    'nombre': 'Bolso QA Centralizado', 'descripcion': 'Algodón para pruebas aisladas', 'categoria': 'Accesorios', 'activo': True,
    'imagenes': [data_image(image), data_image(picture('#c63750'))],
    'variantes': [{'sku': 'QA-AZUL', 'precio': 25000, 'stock': 5, 'atributos_variante': [{'clave': 'color', 'etiqueta': 'Color', 'valor': 'Azul'}]},
                  {'sku': 'QA-ROJO', 'precio': 30000, 'precio_oferta': 27000, 'stock': 4, 'atributos_variante': [{'clave': 'color', 'etiqueta': 'Color', 'valor': 'Rojo'}]}],
}}, upsert=True)
product = get_mongo_db().productos.find_one({'tienda_id': str(store.pk), 'slug': 'bolso-qa-marketing-centralizado'})
blocks = []
for index, kind in enumerate(['servicio', 'taller']):
    key = f'52100000-0000-4000-8000-00000000001{index}'
    blocks.append({'id': key, 'tipo': 'personalizada', 'titulo': f'{kind.capitalize()} QA publicado', 'subtitulo': '', 'texto': 'Contenido sintético',
        'visible': True, 'imagenes': [], 'actividad': {'tipo': kind, 'estado': 'activa', 'gratuito': True, 'zona_horaria': 'America/Santiago'},
        'componentes': [{'id': key, 'tipo': 'texto', 'visible': True, 'texto': 'Contenido sintético para preparar una publicación'},
                        {'id': f'52100000-0000-4000-8000-00000000002{index}', 'tipo': 'biblioteca', 'visible': True, 'recurso_id': str(locked.pk)}]})
ConfiguracionLanding.objects.update_or_create(tienda=store, defaults={'titulo': 'Marketing QA Centralizado', 'contenido': {'bloques': blocks}})

from django.utils import timezone
from apps.core.models import ConsentimientoComercial
from apps.landing.models import CampanaPromocional
from apps.visual_config.models import ConfiguracionVisual
owner.email='owner-marketing@example.test';owner.save()
ConsentimientoComercial.objects.get_or_create(tienda=store,email='cliente-marketing@example.test',defaults={'estado':'autorizado','verificado':True,'fecha_autorizacion':timezone.now(),'fecha_verificacion':timezone.now(),'version_texto':'qa-v1','referencia_evidencia':'fixture-sintetica'})
ConsentimientoComercial.objects.get_or_create(tienda=store,email='pendiente-marketing@example.test',defaults={'estado':'pendiente'})
CampanaPromocional.objects.get_or_create(tienda=store,nombre='Campaña histórica conservada',defaults={'clave':UUID('52200000-0000-4000-8000-000000000001'),'autor':owner,'asunto':'Historia QA','cuerpo':'Texto histórico conservado','producto':{'nombre':'Producto histórico'},'diseno':{}})
ConfiguracionVisual.objects.get_or_create(tienda=store,defaults={'plantilla_seleccionada':'editorial','logo_negocio':data_image(picture('#23645a')),'personalizacion':{'editor':{'editorial':{'visualConfig':{'global':{'colors':{'primary':'#23645a','secondary':'#f1eadc'}}}}}}})
config=ConfiguracionLanding.objects.get(tienda=store)
config.contenido['productos_destacados']=[str(product['_id'])]
config.save()
contact=ConsentimientoComercial.objects.get(tienda=store,email='cliente-marketing@example.test')
if contact.estado!='autorizado':
    contact.estado='autorizado';contact.verificado=True;contact.revision+=1
    contact.fecha_autorizacion=contact.fecha_verificacion=timezone.now();contact.save()
session = {'token': token.key, 'storeId': store.pk, 'productId': str(product['_id']), 'libraryId': str(resource.pk), 'lockedId': str(locked.pk)}
(output / 'qa-session.json').write_text(json.dumps(session), encoding='utf-8')
print('Fixtures de Marketing preparadas exclusivamente en QA; sesión fuera del repositorio.')
