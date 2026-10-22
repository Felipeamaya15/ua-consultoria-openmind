from copy import deepcopy
from django.db import transaction
"""Dominio y lógica de negocio para las páginas legales de la tienda."""

from django.utils import timezone

TERMS_DEFAULT = """**1. Aceptación de los términos**

Al acceder y utilizar esta plataforma de comercio electrónico, usted acepta cumplir y quedar vinculado por los presentes Términos y Condiciones. Si no acepta estos términos, no debe utilizar el servicio.

**2. Descripción del servicio**

Esta plataforma permite a emprendedores comercializar sus productos a través de una tienda en línea. La Universidad Autónoma de Chile provee la infraestructura tecnológica a través de su programa de emprendimiento.

**3. Registro y cuenta de usuario**

Para realizar compras puede requerirse la creación de una cuenta. Usted es responsable de mantener la confidencialidad de sus credenciales de acceso.

**4. Política de compras**

Los precios mostrados incluyen IVA cuando corresponde. El vendedor es responsable de la descripción y disponibilidad de los productos.

**5. Limitación de responsabilidad**

La plataforma actúa como intermediario tecnológico. La responsabilidad directa sobre los productos recae en el emprendedor/vendedor.

**6. Modificaciones**

Nos reservamos el derecho de modificar estos términos con previo aviso a los usuarios registrados."""

PRIVACY_DEFAULT = """**1. Información que recopilamos**

Recopilamos información que usted nos proporciona directamente al crear una cuenta, realizar una compra o contactarnos, incluyendo nombre, correo electrónico, dirección y datos de pago (procesados de forma segura por proveedores externos).

**2. Uso de la información**

Utilizamos su información para procesar pedidos, comunicar el estado de sus compras, mejorar nuestros servicios y cumplir con obligaciones legales.

**3. Compartir información**

No vendemos ni cedemos su información personal a terceros, salvo cuando sea necesario para procesar su pedido (por ejemplo, empresas de despacho) o cuando la ley lo requiera.

**4. Seguridad**

Implementamos medidas de seguridad técnicas y organizativas para proteger su información personal contra acceso no autorizado.

**5. Derechos del titular**

Tiene derecho a acceder, rectificar o eliminar sus datos personales contactándonos a través de los canales habilitados.

**6. Cookies**

Utilizamos cookies para mejorar la experiencia de navegación. Puede configurar su navegador para rechazarlas, aunque esto puede afectar la funcionalidad del sitio."""

REFUND_DEFAULT = """**1. Derecho a devolución**

Según la Ley del Consumidor chilena, tiene derecho a devolver un producto dentro de los 10 días hábiles desde la recepción si este no corresponde a lo ofertado.

**2. Condiciones de devolución**

Para solicitar un reembolso el producto debe: estar en su estado original sin uso, con embalaje original cuando corresponda, y acompañado de la boleta o comprobante de compra.

**3. Proceso de reembolso**

Contacte al vendedor a través de los medios indicados en la tienda. El vendedor tiene 10 días hábiles para procesar la solicitud. Los reembolsos se realizan por el mismo medio de pago utilizado en la compra.

**4. Excepciones**

No aplican reembolsos para: productos personalizados creados específicamente para el comprador, productos digitales una vez descargados, productos de higiene personal sin sellar.

**5. Productos defectuosos**

Si el producto presenta defectos de fabricación, tiene derecho a reparación, reemplazo o devolución del dinero según la garantía legal correspondiente."""

COOKIES_DEFAULT = """**1. ¿Qué son las cookies?**

Las cookies son pequeños archivos de texto que los sitios web almacenan en su navegador o dispositivo para recordar información sobre su visita, facilitar la navegación y mejorar su experiencia de usuario.

**2. Tipos de cookies que utilizamos**

- **Cookies técnicas y necesarias:** Esenciales para el funcionamiento básico del e-commerce, como mantener su sesión iniciada, recordar los artículos en su carrito de compras y procesar el pago de forma segura.
- **Cookies de personalización:** Permiten recordar sus preferencias de navegación (como idioma o moneda seleccionada).
- **Cookies de análisis y rendimiento:** Nos ayudan a comprender cómo interactúan los usuarios con nuestra tienda, qué productos son más visitados y optimizar el rendimiento técnico del sitio.

**3. Finalidad del tratamiento**

Utilizamos estas tecnologías únicamente para brindarle un servicio seguro, eficiente y adaptado a sus necesidades comerciales. No utilizamos cookies para vender sus datos a terceros con fines publicitarios no autorizados.

**4. Gestión y configuración de cookies**

Usted puede configurar o deshabilitar el uso de cookies en cualquier momento a través de la configuración de su navegador web (Google Chrome, Mozilla Firefox, Safari, Microsoft Edge). Tenga en cuenta que bloquear ciertas cookies necesarias puede afectar el funcionamiento correcto de la tienda y del proceso de compra.

**5. Actualizaciones de la política**

Podemos actualizar esta Política de Cookies para reflejar cambios tecnológicos o normativos. Se informará a los usuarios sobre cambios relevantes a través de nuestro sitio web."""

LEGAL_META = {
    'terms': {
        'title': 'Términos y Condiciones',
        'short': 'Términos',
        'description': 'Reglas de uso de la tienda, compras y responsabilidades.',
        'content': TERMS_DEFAULT,
    },
    'privacy': {
        'title': 'Política de Privacidad',
        'short': 'Privacidad',
        'description': 'Cómo recopilas, usas y proteges los datos de tus clientes.',
        'content': PRIVACY_DEFAULT,
    },
    'refund': {
        'title': 'Política de Reembolso',
        'short': 'Reembolsos',
        'description': 'Condiciones de devolución y reembolso según la Ley del Consumidor.',
        'content': REFUND_DEFAULT,
    },
    'cookies': {
        'title': 'Política de Cookies',
        'short': 'Cookies',
        'description': 'Información sobre el uso de cookies y tecnologías de seguimiento en la tienda.',
        'content': COOKIES_DEFAULT,
    },
}

TYPE_ALIASES = {
    'terms': 'terms',
    'terminos': 'terms',
    'privacy': 'privacy',
    'privacidad': 'privacy',
    'refund': 'refund',
    'reembolso': 'refund',
    'reembolsos': 'refund',
    'cookies': 'cookies',
    'cookie': 'cookies',
    'galletas': 'cookies',
    'politica-cookies': 'cookies',
    'politica-de-cookies': 'cookies',
}

CANONICAL_TYPES = ('terms', 'privacy', 'refund', 'cookies')


def normalize_legal_type(tipo: str) -> str | None:
    if not isinstance(tipo, str):
        return None
    cleaned = tipo.strip().lower()
    return TYPE_ALIASES.get(cleaned)


def get_default_legal_pages() -> dict:
    now_iso = timezone.now().isoformat()
    return {
        key: {
            'title': meta['title'],
            'draft': meta['content'],
            'published': meta['content'],
            'lastPublished': now_iso,
            'version': 1,
            'fecha_vigencia': now_iso,
            'vigente': True,
            'estado': 'vigente',
        }
        for key, meta in LEGAL_META.items()
    }


DEFAULT_COOKIE_BANNER = {
    'title': 'Aviso de Cookies',
    'message': 'Utilizamos cookies propias y de terceros para garantizar el funcionamiento seguro de la tienda, recordar tus preferencias y analizar la navegación.',
    'acceptText': 'Aceptar cookies',
    'declineText': 'Solo necesarias',
    'enabled': True,
}


def legal_for_store(tienda, *, for_admin=False) -> dict:
    from apps.core.models import ConfiguracionLegal

    configuracion = ConfiguracionLegal.objects.filter(tienda=tienda).first()
    stored_data = configuracion.datos if (configuracion and isinstance(configuracion.datos, dict)) else {}

    defaults = get_default_legal_pages()
    result = {}

    for key in CANONICAL_TYPES:
        stored_item = stored_data.get(key, {})
        if not isinstance(stored_item, dict):
            stored_item = {}

        title = str(stored_item.get('title') or defaults[key]['title'])
        draft = str(stored_item.get('draft') if stored_item.get('draft') is not None else defaults[key]['draft'])
        published = str(stored_item.get('published') if stored_item.get('published') is not None else defaults[key]['published'])
        last_published = stored_item.get('lastPublished') or defaults[key]['lastPublished']
        version = int(stored_item.get('version') or defaults[key].get('version', 1))
        fecha_vigencia = stored_item.get('fecha_vigencia') or last_published
        vigente = True
        estado = 'vigente'

        if for_admin:
            result[key] = {
                'title': title,
                'draft': draft,
                'published': published,
                'lastPublished': last_published,
                'version': version,
                'fecha_vigencia': fecha_vigencia,
                'vigente': vigente,
                'estado': estado,
            }
        else:
            result[key] = {
                'title': title,
                'published': published,
                'lastPublished': last_published,
                'version': version,
                'fecha_vigencia': fecha_vigencia,
                'vigente': vigente,
                'estado': estado,
            }

        if for_admin:
            result[key]['historial'] = deepcopy(stored_item.get('historial', []))

        if key == 'cookies':
            banner_data = stored_item.get('banner') if isinstance(stored_item.get('banner'), dict) else {}
            result[key]['banner'] = {**DEFAULT_COOKIE_BANNER, **banner_data}

    return result


@transaction.atomic
def create_legal_for_store(tienda, payload: dict) -> dict:
    """Implementa la creación de contenido legal para la tienda."""
    from apps.core.models import ConfiguracionLegal
    from rest_framework.exceptions import ValidationError

    if not isinstance(payload, dict):
        raise ValidationError('Los datos deben enviarse como un objeto JSON.')

    ConfiguracionLegal.objects.get_or_create(tienda=tienda)
    configuracion = ConfiguracionLegal.objects.select_for_update().get(tienda=tienda)
    current_stored = configuracion.datos if isinstance(configuracion.datos, dict) else {}
    current_pages = legal_for_store(tienda, for_admin=True)

    now_iso = timezone.now().isoformat()

    type_key = next((key for key in ('tipo', 'type', 'pageType', 'page') if key in payload), None)
    if type_key is not None:
        raw_type = payload[type_key]
        canonical = normalize_legal_type(raw_type)
        if not canonical:
            raise ValidationError({'tipo': f"Tipo inválido. Opciones válidas: {', '.join(CANONICAL_TYPES)}"})

        content_key = next((key for key in ('draft', 'content') if key in payload), None)
        if content_key is None:
            raise ValidationError({'content': 'El contenido legal es obligatorio.'})
        initial_content = payload[content_key]
        if not isinstance(initial_content, str) or not initial_content.strip():
            raise ValidationError({'content': 'El contenido legal no puede estar vacío.'})
        if len(initial_content) > 50000:
            raise ValidationError({'content': 'El texto excede el límite máximo permitido (50.000 caracteres).'})

        title = payload.get('title') or LEGAL_META[canonical]['title']
        if not isinstance(title, str) or not title.strip():
            raise ValidationError({'title': 'El título no puede estar vacío.'})

        page = current_pages[canonical]
        page['title'] = title.strip()
        page['draft'] = initial_content
        if 'published' in payload:
            published = payload['published']
            if not isinstance(published, str) or not published.strip():
                raise ValidationError({'published': 'El contenido publicado no puede estar vacío.'})
            if len(published) > 50000:
                raise ValidationError({'published': 'El texto excede el límite máximo permitido (50.000 caracteres).'})
            page['published'] = published
            page['lastPublished'] = now_iso

        current_stored[canonical] = page
    else:
        requested_pages = [key for key in CANONICAL_TYPES if key in payload]
        if not requested_pages:
            raise ValidationError({'tipo': 'Debes indicar una página legal válida.'})

        for key in requested_pages:
            item = payload[key]
            if not isinstance(item, dict):
                raise ValidationError({key: 'Cada página debe ser un objeto con sus campos.'})

            page = current_pages[key]
            content_key = next((field for field in ('draft', 'content') if field in item), None)
            if content_key is None:
                raise ValidationError({key: {'content': 'El contenido legal es obligatorio.'}})
            draft = item[content_key]
            if not isinstance(draft, str) or not draft.strip():
                raise ValidationError({key: {'content': 'El contenido no puede estar vacío.'}})
            if len(draft) > 50000:
                raise ValidationError({key: {'draft': 'El texto excede el límite máximo permitido (50.000 caracteres).'}})
            page['draft'] = draft

            if 'published' in item:
                published = item['published']
                if not isinstance(published, str) or not published.strip():
                    raise ValidationError({key: {'published': 'El contenido publicado no puede estar vacío.'}})
                if len(published) > 50000:
                    raise ValidationError({key: {'published': 'El texto excede el límite máximo permitido (50.000 caracteres).'}})
                page['published'] = published
                page['lastPublished'] = now_iso

            title = item.get('title') or LEGAL_META[key]['title']
            if not isinstance(title, str) or not title.strip():
                raise ValidationError({key: {'title': 'El título no puede estar vacío.'}})
            page['title'] = title.strip()

            current_stored[key] = page

    configuracion.datos = current_stored
    configuracion.save(update_fields=['datos', 'fecha_actualizacion'])

    return legal_for_store(tienda, for_admin=True)


def update_legal_for_store(tienda, payload: dict) -> dict:
    """Implementa la actualización del contenido legal (borrador y metadatos)."""
    return save_legal_for_store(tienda, payload)


@transaction.atomic
def publish_legal_for_store(tienda, tipo: str, content: str = None) -> dict:
    """Implementa la publicación de contenido legal en la tienda."""
    from apps.core.models import ConfiguracionLegal
    from rest_framework.exceptions import ValidationError

    ConfiguracionLegal.objects.get_or_create(tienda=tienda)
    configuracion = ConfiguracionLegal.objects.select_for_update().get(tienda=tienda)
    current_stored = configuracion.datos if isinstance(configuracion.datos, dict) else {}
    current_pages = legal_for_store(tienda, for_admin=True)

    now_iso = timezone.now().isoformat()

    target_types = []
    if not tipo or tipo == 'all':
        target_types = list(CANONICAL_TYPES)
    else:
        canonical = normalize_legal_type(tipo)
        if not canonical:
            raise ValidationError({'tipo': f"Tipo inválido. Opciones válidas: {', '.join(CANONICAL_TYPES)}"})
        target_types = [canonical]

    for key in target_types:
        page = current_pages[key]
        text_to_publish = content if (content is not None and len(target_types) == 1) else page['draft']

        if not isinstance(text_to_publish, str) or not text_to_publish.strip():
            raise ValidationError({'content': f"El contenido a publicar para {page['title']} no puede estar vacío."})
        if len(text_to_publish) > 50000:
            raise ValidationError({'content': f"El texto de {page['title']} excede el límite máximo permitido (50.000 caracteres)."})

        stored_page = current_stored.get(key, {})
        current_version = int(stored_page.get('version') or page.get('version') or 1)
        new_version = current_version + 1

        page['draft'] = text_to_publish
        page['published'] = text_to_publish
        page['lastPublished'] = now_iso
        page['version'] = new_version
        page['fecha_vigencia'] = now_iso
        page['vigente'] = True
        page['estado'] = 'vigente'

        historial = stored_page.get('historial') if isinstance(stored_page.get('historial'), list) else []
        historial.append({
            'version': new_version,
            'fecha_vigencia': now_iso,
            'content': text_to_publish,
        })
        page['historial'] = historial

        current_stored[key] = page

    configuracion.datos = current_stored
    configuracion.save(update_fields=['datos', 'fecha_actualizacion'])

    return legal_for_store(tienda, for_admin=True)


@transaction.atomic
def save_legal_for_store(tienda, payload: dict) -> dict:
    from apps.core.models import ConfiguracionLegal
    from rest_framework.exceptions import ValidationError

    if not isinstance(payload, dict):
        raise ValidationError('Los datos deben enviarse como un objeto JSON.')

    ConfiguracionLegal.objects.get_or_create(tienda=tienda)
    configuracion = ConfiguracionLegal.objects.select_for_update().get(tienda=tienda)
    current_stored = configuracion.datos if isinstance(configuracion.datos, dict) else {}
    current_pages = legal_for_store(tienda, for_admin=True)

    now_iso = timezone.now().isoformat()

    # Caso 1: Actualización de un único tipo
    if 'tipo' in payload or 'type' in payload:
        raw_type = payload.get('tipo') or payload.get('type')
        canonical = normalize_legal_type(raw_type)
        if not canonical:
            raise ValidationError({'tipo': f"Tipo inválido. Opciones válidas: {', '.join(CANONICAL_TYPES)}"})

        accion = payload.get('accion') or payload.get('action') or 'draft'
        page = current_pages[canonical]

        if accion == 'restore':
            page['draft'] = LEGAL_META[canonical]['content']
        elif accion == 'publish':
            content_to_publish = payload.get('published') or payload.get('draft') or page['draft']
            if not isinstance(content_to_publish, str) or not content_to_publish.strip():
                raise ValidationError({'content': 'El contenido legal a publicar no puede estar vacío.'})
            if len(content_to_publish) > 50000:
                raise ValidationError({'content': 'El texto excede el límite máximo permitido (50.000 caracteres).'})

            stored_page = current_stored.get(canonical, {})
            current_version = int(stored_page.get('version') or page.get('version') or 1)
            new_version = current_version + 1

            page['draft'] = content_to_publish
            page['published'] = content_to_publish
            page['lastPublished'] = now_iso
            page['version'] = new_version
            page['fecha_vigencia'] = now_iso
            page['vigente'] = True
            page['estado'] = 'vigente'

            historial = stored_page.get('historial') if isinstance(stored_page.get('historial'), list) else []
            historial.append({
                'version': new_version,
                'fecha_vigencia': now_iso,
                'content': content_to_publish,
            })
            page['historial'] = historial
        else:  # accion == 'draft' o update regular
            draft_content = payload.get('draft')
            if draft_content is not None:
                if not isinstance(draft_content, str):
                    raise ValidationError({'draft': 'El borrador debe ser texto.'})
                if len(draft_content) > 50000:
                    raise ValidationError({'draft': 'El texto excede el límite máximo permitido (50.000 caracteres).'})
                page['draft'] = draft_content

            if 'published' in payload:
                published_content = payload['published']
                if not isinstance(published_content, str):
                    raise ValidationError({'published': 'El contenido publicado debe ser texto.'})
                if len(published_content) > 50000:
                    raise ValidationError({'published': 'El texto excede el límite máximo permitido (50.000 caracteres).'})

                stored_page = current_stored.get(canonical, {})
                current_version = int(stored_page.get('version') or page.get('version') or 1)
                new_version = current_version + 1

                page['published'] = published_content
                page['lastPublished'] = now_iso
                page['version'] = new_version
                page['fecha_vigencia'] = now_iso
                page['vigente'] = True
                page['estado'] = 'vigente'

        if 'title' in payload and isinstance(payload['title'], str) and payload['title'].strip():
            page['title'] = payload['title'].strip()

        if canonical == 'cookies' and 'banner' in payload and isinstance(payload['banner'], dict):
            existing_banner = page.get('banner') if isinstance(page.get('banner'), dict) else DEFAULT_COOKIE_BANNER
            page['banner'] = {**existing_banner, **payload['banner']}

        current_stored[canonical] = page

    # Caso 2: Objeto completo con claves terms/privacy/refund/cookies
    else:
        for key in CANONICAL_TYPES:
            if key in payload:
                item = payload[key]
                if not isinstance(item, dict):
                    raise ValidationError({key: 'Cada página debe ser un objeto con sus campos.'})

                page = current_pages[key]
                if 'draft' in item:
                    if not isinstance(item['draft'], str):
                        raise ValidationError({key: {'draft': 'El borrador debe ser texto.'}})
                    if len(item['draft']) > 50000:
                        raise ValidationError({key: {'draft': 'El texto excede el límite máximo permitido (50.000 caracteres).'}} )
                    page['draft'] = item['draft']

                if 'published' in item:
                    if not isinstance(item['published'], str):
                        raise ValidationError({key: {'published': 'El contenido publicado debe ser texto.'}})
                    if len(item['published']) > 50000:
                        raise ValidationError({key: {'published': 'El texto excede el límite máximo permitido (50.000 caracteres).'}} )
                    if item['published'] != page['published']:
                        stored_page = current_stored.get(key, {})
                        current_version = int(stored_page.get('version') or page.get('version') or 1)
                        new_version = current_version + 1
                        page['lastPublished'] = now_iso
                        page['version'] = new_version
                        page['fecha_vigencia'] = now_iso
                        page['vigente'] = True
                        page['estado'] = 'vigente'
                    page['published'] = item['published']

                if 'title' in item and isinstance(item['title'], str) and item['title'].strip():
                    page['title'] = item['title'].strip()

                if key == 'cookies' and 'banner' in item and isinstance(item['banner'], dict):
                    existing_banner = page.get('banner') if isinstance(page.get('banner'), dict) else DEFAULT_COOKIE_BANNER
                    page['banner'] = {**existing_banner, **item['banner']}

                current_stored[key] = page

    configuracion.datos = current_stored
    configuracion.save(update_fields=['datos', 'fecha_actualizacion'])

    return legal_for_store(tienda, for_admin=True)


def get_version_vigente(tienda, tipo: str = None) -> dict:
    """Implementa la consulta de la versión vigente de las páginas legales.

    Permite consultar la versión vigente de un tipo específico (terms, privacy, refund, cookies)
    o de todas las políticas vigentes de la tienda para su despliegue y validación.
    """
    from rest_framework.exceptions import ValidationError

    pages = legal_for_store(tienda, for_admin=False)

    if tipo and tipo != 'all':
        canonical = normalize_legal_type(tipo)
        if not canonical:
            raise ValidationError({'tipo': f"Tipo de página legal no encontrado. Opciones válidas: {', '.join(CANONICAL_TYPES)}"})

        item = pages[canonical]
        version_data = {
            'tipo': canonical,
            'title': item['title'],
            'content': item['published'],
            'published': item['published'],
            'version': item.get('version', 1),
            'fecha_vigencia': item.get('fecha_vigencia') or item.get('lastPublished'),
            'lastPublished': item.get('lastPublished'),
            'vigente': True,
            'estado': 'vigente',
        }
        if canonical == 'cookies' and 'banner' in item:
            version_data['banner'] = item['banner']
        return version_data

    result = {}
    for key in CANONICAL_TYPES:
        item = pages[key]
        item_data = {
            'tipo': key,
            'title': item['title'],
            'content': item['published'],
            'published': item['published'],
            'version': item.get('version', 1),
            'fecha_vigencia': item.get('fecha_vigencia') or item.get('lastPublished'),
            'lastPublished': item.get('lastPublished'),
            'vigente': True,
            'estado': 'vigente',
        }
        if key == 'cookies' and 'banner' in item:
            item_data['banner'] = item['banner']
        result[key] = item_data

    return result
