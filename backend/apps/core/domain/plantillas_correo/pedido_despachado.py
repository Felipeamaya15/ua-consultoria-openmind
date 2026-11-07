"""Plantilla del correo de pedido despachado / en camino (SCRUM-427, 431 y 434). Tipo de correo: order_shipped."""
import re

from apps.core.domain.plantillas_correo.base import _MARCADOR, PlantillaCorreo, PlantillaCorreoInvalida, contexto_pedido

ESTADOS_DESPACHADOS = ('en_camino', 'entregado', 'enviado', 'en_reparto')

PLANTILLA_PEDIDO_DESPACHADO = PlantillaCorreo(
    asunto='Tu pedido ya fue despachado · {{orderNumber}}',
    preheader='Tu compra va en camino.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'Tu pedido {{orderNumber}} ya fue despachado y va en camino.\n\n'
        'Transportista: {{carrier}}\n'
        'Código de seguimiento: {{trackingCode}}\n\n'
        'Revisa el estado de tu pedido aquí (te pediremos el correo con el que compraste): {{trackingLink}}\n\n'
        'Gracias por comprar en {{storeName}}.'
    ),
)


def _sin_datos_ausentes(texto, contexto):
    """Quita las líneas con variables vacías (ej. transportista o código cuando no hay datos)."""
    lineas = []
    for linea in texto.split('\n'):
        variables = _MARCADOR.findall(linea)
        if variables and not any(contexto.get(variable) for variable in variables):
            continue
        lineas.append(linea)
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lineas)).strip('\n')


def renderizar_pedido_despachado(pedido, plantilla=None, forzar=False):
    if not forzar and pedido.estado not in ESTADOS_DESPACHADOS:
        raise PlantillaCorreoInvalida('Solo se avisa el despacho de un pedido que ya fue enviado.')
    if not forzar and (pedido.entrega or {}).get('metodo') == 'Retiro':
        raise PlantillaCorreoInvalida('Un pedido con retiro en tienda no se despacha.')
    base = plantilla or PLANTILLA_PEDIDO_DESPACHADO
    contexto = contexto_pedido(pedido)
    return PlantillaCorreo(
        asunto=base.asunto, preheader=base.preheader, cuerpo=_sin_datos_ausentes(base.cuerpo, contexto),
    ).renderizar(contexto)
