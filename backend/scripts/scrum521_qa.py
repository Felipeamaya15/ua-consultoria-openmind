"""Run through manage.py shell, using config.qa_scrum521 only; synthetic data only."""
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

assert settings.DATABASES['default']['NAME'].startswith('scrum521_qa_')
assert settings.MONGO_DB_NAME.startswith('scrum521_qa_')
assert settings.EMAIL_BACKEND.endswith('locmem.EmailBackend')
output = Path(os.environ['SCRUM521_QA_OUTPUT'])
output.mkdir(parents=True, exist_ok=True)
owner, _ = get_user_model().objects.get_or_create(username='scrum521-synthetic-owner')
store, _ = Tienda.objects.get_or_create(id_usuario_propietario=owner, defaults={'nombre': 'Marketing QA SCRUM-521'})
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
product_id = get_mongo_db().productos.update_one({'tienda_id': str(store.pk), 'slug': 'bolso-qa-scrum521'}, {'$set': {
    'nombre': 'Bolso QA SCRUM-521', 'descripcion': 'Algodón para pruebas aisladas', 'categoria': 'Accesorios', 'activo': True,
    'imagenes': [data_image(image), data_image(picture('#c63750'))],
    'variantes': [{'sku': 'QA-AZUL', 'precio': 25000, 'stock': 5, 'atributos_variante': [{'clave': 'color', 'etiqueta': 'Color', 'valor': 'Azul'}]},
                  {'sku': 'QA-ROJO', 'precio': 30000, 'precio_oferta': 27000, 'stock': 4, 'atributos_variante': [{'clave': 'color', 'etiqueta': 'Color', 'valor': 'Rojo'}]}],
}}, upsert=True)
product = get_mongo_db().productos.find_one({'tienda_id': str(store.pk), 'slug': 'bolso-qa-scrum521'})
blocks = []
for index, kind in enumerate(['servicio', 'taller']):
    key = f'52100000-0000-4000-8000-00000000001{index}'
    blocks.append({'id': key, 'tipo': 'personalizada', 'titulo': f'{kind.capitalize()} QA publicado', 'subtitulo': '', 'texto': 'Contenido sintético',
        'visible': True, 'imagenes': [], 'actividad': {'tipo': kind, 'estado': 'activa', 'gratuito': True, 'zona_horaria': 'America/Santiago'},
        'componentes': [{'id': key, 'tipo': 'texto', 'visible': True, 'texto': 'Contenido sintético para preparar una publicación'},
                        {'id': f'52100000-0000-4000-8000-00000000002{index}', 'tipo': 'biblioteca', 'visible': True, 'recurso_id': str(locked.pk)}]})
ConfiguracionLanding.objects.update_or_create(tienda=store, defaults={'titulo': 'Marketing QA SCRUM-521', 'contenido': {'bloques': blocks}})
session = {'token': token.key, 'storeId': store.pk, 'productId': str(product['_id']), 'libraryId': str(resource.pk), 'lockedId': str(locked.pk)}
(output / 'qa-session.json').write_text(json.dumps(session), encoding='utf-8')
print('Fixtures SCRUM-521 preparadas exclusivamente en bases QA; sesión guardada fuera del repositorio.')
