"""Base de las plantillas de correo transaccional del pedido.

Cada plantilla define asunto, preheader y cuerpo con marcadores {{variable}}
"""
import re
from dataclasses import dataclass

_MARCADOR = re.compile(r'\{\{\s*(\w+)\s*\}\}')
VARIABLES_PERMITIDAS = (
    'customerName', 'customerEmail', 'orderNumber', 'orderTotal',
    'shippingMethod', 'carrier', 'trackingCode', 'storeName',
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
        'storeName': pedido.tienda.nombre if pedido.tienda_id else '',
    }
