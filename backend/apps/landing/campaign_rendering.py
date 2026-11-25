"""Un solo render para la vista previa y el MIME. Todo contenido editable es texto escapado."""
import re
import base64
from io import BytesIO
from html import escape
from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from rest_framework.exceptions import ValidationError
from PIL import Image


def web_url(value):
    if not isinstance(value, str) or len(value) > 2000 or any(c in value for c in '\r\n\x00\\'):
        return ''
    try:
        parsed = urlsplit(value)
    except ValueError:
        return ''
    if parsed.scheme not in ('https', 'http') or not parsed.netloc or parsed.username or parsed.password:
        return ''
    return value


def safe_image(value, base):
    if isinstance(value, str) and value.startswith('/media/'):
        public = urlsplit(settings.STORE_MAIL_PUBLIC_API_URL or base)
        value = f'{public.scheme}://{public.netloc}{value}'
    if web_url(value):
        return value
    if not isinstance(value, str) or len(value) > 2800000:
        return ''
    match = re.fullmatch(r'data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)', value)
    if match:
        try:
            raw = base64.b64decode(match.group(2), validate=True)
            with Image.open(BytesIO(raw)) as image:
                image.verify()
            return value
        except (ValueError, OSError, Image.DecompressionBombError):
            pass
    return ''


def identity(store):
    from apps.visual_config.models import ConfiguracionVisual
    from apps.visual_config.palettes import read_data, SYSTEM_PALETTES
    visual = ConfiguracionVisual.objects.filter(tienda=store).first()
    template = visual.plantilla_seleccionada if visual else 'editorial'
    number = {'editorial': 1, 'minimal': 2, 'visual': 3, 'catalog': 4}.get(template, 1)
    public = urlsplit(settings.STOREFRONT_PUBLIC_URL)
    if not web_url(settings.STOREFRONT_PUBLIC_URL):
        raise ValidationError('Configura la dirección pública de la tienda para generar enlaces seguros.')
    path = re.sub(r'/plantilla/[1-4]/?$', '', public.path.rstrip('/'))
    base = urlunsplit((public.scheme, public.netloc, f'{path}/plantilla/{number}', '', ''))
    color = '#1a3a6b'
    logo = visual.logo_negocio if visual else ''
    if not logo:
        from apps.landing.models import ConfiguracionLanding
        landing = ConfiguracionLanding.objects.filter(tienda=store).first()
        logo = landing.logo.url if landing and landing.logo else ''
    logo = safe_image(logo, base)
    if visual:
        data = read_data(visual)
        editor = data.get('editor', {}).get(template, {})
        palettes = [*SYSTEM_PALETTES, *data.get('paletas', [])]
        selected = next((p for p in palettes if p['id'] == editor.get('paleta_id')), {})
        candidate = selected.get('colores', {}).get('primary', '')
        candidate = editor.get('visualConfig', {}).get('global', {}).get('colors', {}).get('primary') or candidate
        if re.fullmatch(r'#[0-9a-fA-F]{6}', candidate):
            color = candidate
    return {'nombre': store.nombre, 'base': base, 'color': color, 'logo': logo}


def validate_design(store, design):
    if not isinstance(design, dict) or set(design) - {'imagen', 'boton_texto', 'boton_url', 'recurso_id', 'plantilla'}:
        raise ValidationError('El diseño de la campaña no es válido.')
    if any(not isinstance(value, str) for value in design.values()):
        raise ValidationError('Los campos del diseño deben contener texto.')
    clean = {key: str(design.get(key, '')).strip() for key in ('imagen', 'boton_texto', 'boton_url')}
    resource_id = design.get('recurso_id', '')
    if resource_id:
        from apps.landing.campaign_content import library_image
        clean['recurso_id'] = resource_id
        clean['imagen'] = library_image(store, resource_id)
    if design.get('plantilla'):
        if design['plantilla'] not in ('photo', 'feature', 'minimal'):
            raise ValidationError('Selecciona una plantilla de correo disponible.')
        clean['plantilla'] = design['plantilla']
    if clean['imagen'] and not resource_id and not web_url(clean['imagen']):
        raise ValidationError('Usa una dirección HTTP o HTTPS válida para la imagen.')
    if len(clean['boton_texto']) > 80:
        raise ValidationError('El texto del botón admite hasta 80 caracteres.')
    if clean['boton_url']:
        brand = identity(store)
        value = clean['boton_url']
        if value.startswith('/') and not value.startswith('//'):
            public = urlsplit(brand['base'])
            value = f'{public.scheme}://{public.netloc}{value}'
        try:
            target, base = urlsplit(value), urlsplit(brand['base'])
        except ValueError:
            raise ValidationError('El enlace del botón no es válido.') from None
        if not web_url(value) or target.netloc != base.netloc or target.scheme != base.scheme or not (
                target.path == base.path or target.path.startswith(base.path + '/')):
            raise ValidationError('El botón debe enlazar una página de la plantilla activa de esta tienda.')
        if target.query or '..' in target.path or '%' in target.path:
            raise ValidationError('Usa un enlace directo de la tienda, sin redirecciones ni parámetros.')
        suffix = target.path[len(base.path):]
        if suffix not in ('', '/', '/catalogo') and not re.fullmatch(r'/producto/[a-zA-Z0-9_-]+', suffix):
            raise ValidationError('Selecciona el catálogo, un producto o una página pública de la tienda.')
        if suffix.startswith('/producto/'):
            from apps.catalog.infrastructure.repositories import ProductRepository
            from pymongo.errors import PyMongoError
            try:
                product = ProductRepository().get_by_slug(str(store.pk), suffix.rsplit('/', 1)[-1])
            except PyMongoError:
                raise ValidationError('No se pudo verificar el enlace del producto.') from None
            if not product or not product.get('activo'):
                raise ValidationError('El producto del enlace ya no está publicado.')
        if target.fragment:
            from apps.landing.models import ConfiguracionLanding
            config = ConfiguracionLanding.objects.filter(tienda=store).first()
            valid = suffix in ('', '/') and any(target.fragment == 'seccion-' + block.get('id', '') and block.get('visible') and (block.get('actividad') or {}).get('estado') != 'cancelada' for block in (config.contenido.get('bloques', []) if config else []))
            if not valid:
                raise ValidationError('El enlace no corresponde a una sección publicada.')
        clean['boton_url'] = value
    return clean


def render_campaign(row, unsubscribe):
    brand = row.diseno.get('_marca') or identity(row.tienda)
    e = lambda value: escape(str(value), quote=True)
    color = brand['color']
    html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><table role="presentation" style="max-width:600px;width:100%;margin:auto;background:white"><tr><td style="padding:28px">'
    if brand['logo']:
        html += f'<img src="{e(brand["logo"])}" alt="{e(brand["nombre"])}" style="max-width:160px;max-height:80px">'
    html += f'<h1 style="color:{color};font-size:24px">{e(brand["nombre"])}</h1><h2>{e(row.asunto)}</h2>'
    html += '<p style="line-height:1.6">' + e(row.cuerpo).replace('\n', '<br>') + '</p>'
    text = row.cuerpo
    if row.diseno.get('imagen'):
        html += f'<img src="{e(row.diseno["imagen"])}" alt="Imagen de la campaña" style="max-width:100%;height:auto">'
    product = row.producto
    if product.get('id'):
        from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
        link = product.get('url')
        if not link:
            from apps.catalog.infrastructure.repositories import ProductRepository
            from pymongo.errors import PyMongoError
            link = brand['base'] + '/catalogo'
            if re.fullmatch(r'[a-fA-F0-9]{24}', product['id']):
                try:
                    current = ProductRepository().get_admin_product(str(row.tienda_id), product['id'])
                except PyMongoError:
                    current = None
                if current and current.get('activo') and current.get('slug'):
                    link = brand['base'] + '/producto/' + current['slug']
        image_urls = product.get('imagenes', [product.get('imagen', '')])
        template = row.diseno.get('plantilla', 'photo')
        html += '<table role="presentation" style="width:100%;border:1px solid #e5e7eb;border-radius:12px;margin:20px 0"><tr><td style="padding:20px">'
        title = f'<h3 style="margin:0 0 12px;color:{color}">{e(product.get("nombre", ""))}</h3>'
        if template == 'minimal':
            html += title
        for value in image_urls[:6]:
            image = safe_image(value, brand['base'])
            if image:
                html += f'<img src="{e(image)}" alt="{e(product.get("nombre", ""))}" style="display:block;max-width:100%;max-height:280px;margin:0 auto 12px;border-radius:8px">'
        if template != 'minimal':
            html += title
        description = product.get('descripcion', '')
        if description:
            html += '<p style="line-height:1.6">' + e(description).replace('\n', '<br>') + '</p>'
        price = ''
        if product.get('precio') not in ('', None):
            try:
                amount = Decimal(str(product['precio']))
                if amount.is_finite() and amount >= 0:
                    price = '$' + format(int(amount.quantize(Decimal('1'), rounding=ROUND_HALF_UP)), ',').replace(',', '.') + ' CLP'
                    if product.get('desde'):
                        price = 'Desde ' + price
            except (InvalidOperation, ValueError, OverflowError):
                pass
        if price:
            html += f'<p style="font-size:{28 if template == "feature" else 22}px;font-weight:bold;color:{color}">{e(price)}</p>'
        for variant in product.get('variantes', []):
            label = ' · '.join(str(a.get('valor', '')) for a in variant.get('atributos', [])) or variant['sku']
            variant_price = '$' + format(int(Decimal(variant['precio']).quantize(Decimal('1'), rounding=ROUND_HALF_UP)), ',').replace(',', '.')
            html += f'<p style="font-size:13px">{e(label)} · {e(variant_price)} CLP</p>'
            text += f'\n{label} · {variant_price} CLP'
        label = 'Ver contenido' if product.get('tipo') == 'seccion' else 'Ver producto'
        html += f'<a href="{e(link)}" style="color:{color}">{label}</a></td></tr></table>'
        text += f'\n\n{product.get("nombre", "")} · {price}\n{description}\n{link}'
    target = row.diseno.get('boton_url') or product.get('url') or brand['base'] + '/catalogo'
    label = row.diseno.get('boton_texto') or ('Ver contenido' if product.get('tipo') == 'seccion' else 'Ver producto' if product.get('id') else 'Visitar catálogo')
    html += f'<p><a href="{e(target)}" style="display:inline-block;background:{color};color:white;padding:14px 22px;border-radius:6px;text-decoration:none">{e(label)}</a></p>'
    html += f'<hr><p style="font-size:12px">Recibes esta promoción porque confirmaste tu autorización comercial para {e(brand["nombre"])}. <a href="{e(unsubscribe)}">Cancelar suscripción</a></p></td></tr></table></body></html>'
    text += f'\n\n{label}: {target}\n\nCancelar suscripción: {unsubscribe}'
    return text, html
