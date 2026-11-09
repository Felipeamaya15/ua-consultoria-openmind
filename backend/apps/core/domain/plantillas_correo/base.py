"""Base de las plantillas de correo transaccional del pedido.

Cada plantilla define asunto, preheader y cuerpo con marcadores {{variable}}
"""
import re
from dataclasses import dataclass
from urllib.parse import quote

from apps.core.infrastructure.email_service import correo_valido

_MARCADOR = re.compile(r'\{\{\s*(\w+)\s*\}\}')
VARIABLES_PERMITIDAS = (
    'customerName', 'customerEmail', 'orderNumber', 'orderTotal', 'orderSummary',
    'shippingMethod', 'carrier', 'trackingCode', 'trackingLink', 'storeName',
)


class PlantillaCorreoInvalida(ValueError):
    """El pedido no permite generar el correo solicitado."""


@dataclass(frozen=True)
class CorreoRenderizado:
    asunto: str
    preheader: str
    cuerpo: str


@dataclass(frozen=True)
class PlantillaCorreo:
    asunto: str
    preheader: str
    cuerpo: str

    def renderizar(self, contexto):
        def sustituir(texto):
            return _MARCADOR.sub(lambda m: str(contexto.get(m.group(1), '')), texto)

        return CorreoRenderizado(
            asunto=sustituir(self.asunto),
            preheader=sustituir(self.preheader),
            cuerpo=sustituir(self.cuerpo),
        )


def enlace_seguimiento(pedido):
    """Enlace al portal de seguimiento con el número de orden ya escrito (SCRUM-434).

    El correo del comprador nunca va en la dirección: quien abre el enlace debe escribirlo para consultar el pedido.
    Devuelve '' si no hay una dirección pública http(s) configurada (STOREFRONT_PUBLIC_URL) o el pedido no tiene número.
    """
    from django.conf import settings

    base = (getattr(settings, 'STOREFRONT_PUBLIC_URL', '') or '').strip().rstrip('/')
    orden = pedido.identificador
    if not orden or not base.startswith(('http://', 'https://')):
        return ''
    return f'{base}/seguimiento?orden={quote(orden, safe="")}'


def correo_comprador(pedido):
    """Correo al que se avisa al comprador de este pedido (SCRUM-435); '' si ninguno es válido.
    Primero el correo de contacto que dio al comprar y, si no sirve, el de su cuenta (si compró con sesión iniciada).
    """
    contacto = pedido.contacto or {}
    comprador = pedido.comprador
    candidatos = (
        pedido.correo_contacto, contacto.get('correo'), contacto.get('email'),
        getattr(comprador, 'email', '') if comprador else '',
    )
    return next((valido for valido in map(correo_valido, candidatos) if valido), '')


def formato_monto(monto):
    entero = int(monto)
    if monto == entero:
        return f'${entero:,}'.replace(',', '.')
    return f'${monto:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def resumen_compra(pedido):
    """Resumen de la compra: lista de productos, cantidades y precios (SCRUM-433).

    Detalla cada ítem con su nombre, variante (si aplica), cantidad, monto de la línea
    y precio unitario si la cantidad es mayor a 1. También incluye costo de envío y descuento.
    """
    if not getattr(pedido, 'pk', None) or not hasattr(pedido, 'itempedido_set'):
        return ''
    try:
        items = list(pedido.itempedido_set.all())
    except Exception:
        return ''
    if not items:
        return ''

    lineas = []
    for item in items:
        nombre = item.nombre_producto or (item.id_producto.nombre if item.id_producto else '') or item.sku or 'Producto'
        variante = ''
        if getattr(item, 'atributos', None) and isinstance(item.atributos, dict):
            partes = [f'{k}: {v}' for k, v in item.atributos.items() if v]
            if partes:
                variante = f" ({', '.join(partes)})"
        elif getattr(item, 'atributos_variante', None) and isinstance(item.atributos_variante, list):
            partes = [f"{a.get('etiqueta') or a.get('clave')}: {a.get('valor')}" for a in item.atributos_variante if a.get('valor')]
            if partes:
                variante = f" ({', '.join(partes)})"

        cant = item.cantidad
        precio_u = item.precio_unitario
        subtotal = precio_u * cant
        precio_u_fmt = formato_monto(precio_u)
        subtotal_fmt = formato_monto(subtotal)

        if cant > 1:
            lineas.append(f'- {nombre}{variante} x {cant}: {subtotal_fmt} ({precio_u_fmt} c/u)')
        else:
            lineas.append(f'- {nombre}{variante} x 1: {subtotal_fmt}')

    if getattr(pedido, 'costo_envio', None) and pedido.costo_envio > 0:
        lineas.append(f'- Envío: {formato_monto(pedido.costo_envio)}')

    if getattr(pedido, 'descuento', None) and pedido.descuento > 0:
        lineas.append(f'- Descuento: -{formato_monto(pedido.descuento)}')

    return '\n'.join(lineas)


def contexto_pedido(pedido):
    entrega = pedido.entrega or {}
    contacto = pedido.contacto or {}
    comprador = pedido.comprador
    nombre = (
        pedido.nombre_contacto
        or contacto.get('nombre', '')
        or (getattr(comprador, 'first_name', '') if comprador else '')
        or 'cliente'
    )
    metodo = entrega.get('metodo', '')
    return {
        'orderNumber': pedido.identificador or str(pedido.pk),
        'customerName': nombre,
        'customerEmail': correo_comprador(pedido),
        'orderTotal': f'${int(pedido.monto_total):,}'.replace(',', '.'),
        'orderSummary': resumen_compra(pedido),
        'shippingMethod': metodo,
        'carrier': metodo if metodo != 'Retiro' else '',
        'trackingCode': entrega.get('codigo_seguimiento', ''),
        'trackingLink': enlace_seguimiento(pedido),
        'storeName': pedido.tienda.nombre if pedido.tienda_id else '',
    }
def fecha_limite_de_pago(pedido):
    """Texto con la fecha limite para pagar (hora de Chile), o '' si el pedido no vence."""
    from apps.core.infrastructure.expiracion_pedidos import vence_en

    limite = vence_en(pedido)
    if limite is None:
        return ''
    try:
        from zoneinfo import ZoneInfo
        local, zona = limite.astimezone(ZoneInfo('America/Santiago')), 'hora de Chile'
    except Exception:  # sin base de zonas horarias en el servidor
        local, zona = limite, 'UTC'
    return f'{local:%d-%m-%Y %H:%M} ({zona})'


def con_aviso_de_plazo(cuerpo, aviso):
    """Inserta `aviso` como parrafo propio despues del primero (tras el saludo y la frase inicial)."""
    if not aviso:
        return cuerpo
    partes = cuerpo.split('\n\n')
    posicion = 2 if len(partes) > 2 else len(partes)
    partes.insert(posicion, aviso)
    return '\n\n'.join(partes)
