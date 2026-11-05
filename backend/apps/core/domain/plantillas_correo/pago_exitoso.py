"""Plantilla del correo de pago exitoso (SCRUM-429, SCRUM-433). Tipo de correo: payment_success."""
import re

from .base import _MARCADOR, PlantillaCorreo, PlantillaCorreoInvalida, contexto_pedido
from apps.core.models import Pedido

PLANTILLA_PAGO_EXITOSO = PlantillaCorreo(
    asunto='Tu pago fue confirmado · {{orderNumber}}',
    preheader='Tu compra ya está en preparación.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'Confirmamos el pago de tu pedido {{orderNumber}} por {{orderTotal}}. '
        'Comenzaremos a preparar tu compra.\n\n'
        'Resumen de compra:\n'
        '{{orderSummary}}\n\n'
        'Te enviaremos otra actualización cuando tu pedido sea despachado.\n\n'
        '{{storeName}}'
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


def renderizar_pago_exitoso(pedido, plantilla=None, forzar=False):
    if not forzar and pedido.estado not in Pedido.ESTADOS_PAGADOS:
        raise PlantillaCorreoInvalida('Solo se confirma el pago de un pedido que ya está pagado.')
    base = plantilla or PLANTILLA_PAGO_EXITOSO
    contexto = contexto_pedido(pedido)
    return PlantillaCorreo(
        asunto=base.asunto,
        preheader=base.preheader,
        cuerpo=_sin_datos_ausentes(base.cuerpo, contexto),
    ).renderizar(contexto)
