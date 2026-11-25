"""Catálogo y carrusel sintéticos para comprobar campañas y las cuatro plantillas."""
from io import BytesIO
import base64
from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageDraw
from apps.core.models import Tienda
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.landing.models import ConfiguracionLanding, ImagenCarruselLanding

if not settings.DATABASES['default']['NAME'].startswith('scrum522_qa_') or not settings.MONGO_DB_NAME.startswith('scrum522_qa_'):
    raise RuntimeError('Esta fixture solo admite PostgreSQL y MongoDB dedicados a QA.')
store = Tienda.objects.get(id_usuario_propietario__username='scrum522-browser-qa')
repository = ProductRepository()
for index, color in enumerate(('#1a3a6b', '#23645a')):
    buffer = BytesIO()
    image = Image.new('RGB', (1200, 700), color)
    drawing = ImageDraw.Draw(image)
    drawing.rectangle((280, 140, 920, 560), outline='white', width=8)
    drawing.text((500, 330), 'OpenMind QA ' + str(index+1), fill='white')
    image.save(buffer, format='PNG')
    data = buffer.getvalue()
    if not repository.collection.find_one({'tienda_id': str(store.pk), 'slug': f'producto-qa-{index}'}):
        repository.create(str(store.pk), {'nombre': f'Producto sintético QA {index+1}',
            'slug': f'producto-qa-{index}', 'descripcion': 'Producto exclusivo de pruebas locales.',
            'categoria': 'Pruebas', 'activo': True, 'stock': 5,
            'imagenes': ['data:image/png;base64,' + base64.b64encode(data).decode()],
            'variantes': [{'sku': f'QA-SCRUM522-{index}', 'precio': 9900, 'stock': 5, 'es_activa': True}]})
    config, _ = ConfiguracionLanding.objects.get_or_create(tienda=store,
        defaults={'titulo': 'Emprendimiento QA', 'texto_boton': 'Ver catálogo'})
    if not ImagenCarruselLanding.objects.filter(configuracion=config, orden=index).exists():
        slide = ImagenCarruselLanding(configuracion=config, orden=index, texto_alternativo=f'Portada sintética {index+1}')
        slide.archivo.save(f'qa-scrum522-{index}.png', ContentFile(data))
print('Catálogo y carrusel sintéticos preparados sin modificar datos habituales.')
