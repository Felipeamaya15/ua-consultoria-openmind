"""Plantilla del correo de pedido cancelado. Tipo de correo: order_cancelled."""
import re

from apps.core.domain.plantillas_correo.base import (
    _MARCADOR, PlantillaCorreo, PlantillaCorreoInvalida, con_aviso_de_plazo, contexto_pedido,
)

PLANTILLA_PEDIDO_CANCELADO = PlantillaCorreo(
    asunto='Tu pedido fue cancelado · {{orderNumber}}',
    preheader='Información sobre la cancelación de tu pedido.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'Te informamos que tu pedido {{orderNumber}} ha sido cancelado.\n\n'
        'Detalle del pedido cancelado:\n'
        '{{orderSummary}}\n\n'
        'Total: {{orderTotal}}\n\n'
        'Si tienes dudas sobre esta cancelación o requieres asistencia, puedes responder directamente a este correo.\n\n'
        '{{storeName}}'
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
            if lineas and re.match(r'^\s*Detalle del pedido cancelado:\s*$', lineas[-1], re.IGNORECASE):
                lineas.pop()
            i += 1
            continue
        lineas.append(linea)
        i += 1
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lineas)).strip('\n')


def renderizar_pedido_cancelado(pedido, plantilla=None, forzar=False):
    if not forzar and pedido.estado != 'cancelado':
        raise PlantillaCorreoInvalida('Solo se avisa la cancelación de un pedido que está cancelado.')
    base = plantilla or PLANTILLA_PEDIDO_CANCELADO
    contexto = contexto_pedido(pedido)
    correo = PlantillaCorreo(
        asunto=base.asunto,
        preheader=base.preheader,
        cuerpo=_sin_datos_ausentes(base.cuerpo, contexto),
    ).renderizar(contexto)
    if (pedido.entrega or {}).get('motivo_cancelacion') == 'plazo_vencido':
        aviso = ('El pedido se canceló porque venció el plazo para pagarlo. '
                 'Si ya realizaste el pago, responde a este correo para que lo revisemos.')
        correo = type(correo)(asunto=correo.asunto, preheader=correo.preheader,
                              cuerpo=con_aviso_de_plazo(correo.cuerpo, aviso))
    return correo
