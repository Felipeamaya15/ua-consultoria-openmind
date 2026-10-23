"""Base de las plantillas de correo transaccional del pedido.

Cada plantilla define asunto, preheader y cuerpo con marcadores {{variable}}
"""
import re
from dataclasses import dataclass
from urllib.parse import quote

_MARCADOR = re.compile(r'\{\{\s*(\w+)\s*\}\}')
VARIABLES_PERMITIDAS = (
    'customerName', 'customerEmail', 'orderNumber', 'orderTotal',
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
    correo = (
        pedido.correo_contacto
        or contacto.get('correo', '')
        or contacto.get('email', '')
        or (getattr(comprador, 'email', '') if comprador else '')
    )
    return {
        'orderNumber': pedido.identificador or str(pedido.pk),
        'customerName': nombre,
        'customerEmail': correo,
        'orderTotal': f'${int(pedido.monto_total):,}'.replace(',', '.'),
        'shippingMethod': metodo,
        'carrier': metodo if metodo != 'Retiro' else '',
        'trackingCode': entrega.get('codigo_seguimiento', ''),
        'trackingLink': enlace_seguimiento(pedido),
        'storeName': pedido.tienda.nombre if pedido.tienda_id else '',
    }
