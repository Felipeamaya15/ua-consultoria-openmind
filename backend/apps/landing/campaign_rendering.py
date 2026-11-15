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
        public = urlsplit(base)
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
    if not isinstance(design, dict) or set(design) - {'imagen', 'boton_texto', 'boton_url'}:
        raise ValidationError('El diseño de la campaña no es válido.')
    if any(not isinstance(value, str) for value in design.values()):
        raise ValidationError('Los campos del diseño deben contener texto.')
    clean = {key: str(design.get(key, '')).strip() for key in ('imagen', 'boton_texto', 'boton_url')}
    if clean['imagen'] and not web_url(clean['imagen']):
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
        if target.query or target.fragment or '..' in target.path or '%' in target.path:
            raise ValidationError('Usa un enlace directo de la tienda, sin redirecciones ni parámetros.')
        suffix = target.path[len(base.path):]
        if suffix not in ('', '/', '/catalogo') and not re.fullmatch(r'/producto/[a-fA-F0-9]{24}', suffix):
            raise ValidationError('Selecciona el catálogo, un producto o una página pública de la tienda.')
        if suffix.startswith('/producto/'):
            from apps.landing.campaigns import product_snapshot
            product_snapshot(store, suffix.rsplit('/', 1)[-1], {})
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
        link = brand['base'] + '/producto/' + product['id']
        image = safe_image(product.get('imagen', ''), brand['base'])
        if image:
            html += f'<img src="{e(image)}" alt="{e(product.get("nombre", ""))}" style="max-width:100%;max-height:260px">'
        html += f'<h3>{e(product.get("nombre", ""))}</h3><p>{e(product.get("precio", ""))} CLP</p><a href="{e(link)}">Ver producto</a>'
        text += f'\n\n{product.get("nombre", "")} · {product.get("precio", "")} CLP\n{link}'
    target = row.diseno.get('boton_url') or brand['base'] + '/catalogo'
    label = row.diseno.get('boton_texto') or 'Visitar catálogo'
    html += f'<p><a href="{e(target)}" style="display:inline-block;background:{color};color:white;padding:14px 22px;border-radius:6px;text-decoration:none">{e(label)}</a></p>'
    html += f'<hr><p style="font-size:12px">Recibes esta promoción porque confirmaste tu autorización comercial para {e(brand["nombre"])}. <a href="{e(unsubscribe)}">Cancelar suscripción</a></p></td></tr></table></body></html>'
    text += f'\n\n{label}: {target}\n\nCancelar suscripción: {unsubscribe}'
    return text, html
