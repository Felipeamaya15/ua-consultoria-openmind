"""Plantilla del correo de recepción de pedido (SCRUM-428, SCRUM-432). Tipo de correo: order_received."""
import re

from .base import (
    _MARCADOR, PlantillaCorreo, PlantillaCorreoInvalida, con_aviso_de_plazo, contexto_pedido, fecha_limite_de_pago,
)

PLANTILLA_RECEPCION_PEDIDO = PlantillaCorreo(
    asunto='Recibimos tu pedido {{orderNumber}}',
    preheader='Estamos preparando tu solicitud.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'Recibimos tu pedido {{orderNumber}}. Te avisaremos cuando se confirme el pago '
        'y avance la preparación.\n\n'
        'Resumen de compra:\n'
        '{{orderSummary}}\n\n'
        'Total del pedido: {{orderTotal}}\n'
        'Método de entrega: {{shippingMethod}}\n\n'
        'Gracias por comprar en {{storeName}}.'
    ),
)


def _sin_datos_ausentes(texto, contexto):
    """Quita las líneas con variables vacías y sus títulos precedentes (ej. Resumen de compra:)."""
    lineas = []
    lineas_raw = texto.split('\n')
    i = 0
    while i < len(lineas_raw):
        linea = lineas_raw[i]
        variables = _MARCADOR.findall(linea)
        if variables and not any(contexto.get(variable) for variable in variables):
            if lineas and re.match(r'^\s*Resumen de (?:tu )?compra:\s*$', lineas[-1], re.IGNORECASE):
                lineas.pop()
            i += 1
            continue
        lineas.append(linea)
        i += 1
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lineas)).strip('\n')


def renderizar_recepcion_pedido(pedido, plantilla=None, forzar=False):
    if not forzar and pedido.estado == 'cancelado':
        raise PlantillaCorreoInvalida('No se confirma la recepción de un pedido cancelado.')
    base = plantilla or PLANTILLA_RECEPCION_PEDIDO
    contexto = contexto_pedido(pedido)
    correo = PlantillaCorreo(
        asunto=base.asunto,
        preheader=base.preheader,
        cuerpo=_sin_datos_ausentes(base.cuerpo, contexto),
    ).renderizar(contexto)
    limite = fecha_limite_de_pago(pedido)
    if limite and pedido.estado == 'pendiente':
        aviso = (f'Tienes hasta el {limite} para pagar. Pasado ese plazo el pedido se cancela '
                 'automáticamente y los productos vuelven al inventario.')
        correo = type(correo)(asunto=correo.asunto, preheader=correo.preheader,
                              cuerpo=con_aviso_de_plazo(correo.cuerpo, aviso))
    return correo
