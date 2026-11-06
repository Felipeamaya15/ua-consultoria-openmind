"""Plantilla del correo de pedido entregado. Tipo de correo: order_delivered."""
import re

from apps.core.domain.plantillas_correo.base import _MARCADOR, PlantillaCorreo, PlantillaCorreoInvalida, contexto_pedido

PLANTILLA_PEDIDO_ENTREGADO = PlantillaCorreo(
    asunto='¡Tu pedido fue entregado! · {{orderNumber}}',
    preheader='Confirmamos la entrega de tu compra.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'Te confirmamos que tu pedido {{orderNumber}} ha sido entregado con éxito.\n\n'
        'Resumen de tu compra:\n'
        '{{orderSummary}}\n\n'
        'Esperamos que disfrutes tus productos. Si tienes cualquier consulta, puedes responder directamente a este correo.\n\n'
        '¡Gracias por confiar en {{storeName}}!'
    ),
)


def _sin_datos_ausentes(texto, contexto):
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


def renderizar_pedido_entregado(pedido, plantilla=None, forzar=False):
    if not forzar and pedido.estado != 'entregado':
        raise PlantillaCorreoInvalida('Solo se confirma la entrega de un pedido que está entregado.')
    base = plantilla or PLANTILLA_PEDIDO_ENTREGADO
    contexto = contexto_pedido(pedido)
    return PlantillaCorreo(
        asunto=base.asunto,
        preheader=base.preheader,
        cuerpo=_sin_datos_ausentes(base.cuerpo, contexto),
    ).renderizar(contexto)
