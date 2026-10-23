"""Plantilla del correo de pedido despachado (SCRUM-427). Tipo de correo: order_shipped."""
import re

from .base import _MARCADOR, PlantillaCorreo, PlantillaCorreoInvalida, contexto_pedido

# Estados en los que el pedido ya salió hacia el comprador.
ESTADOS_DESPACHADOS = ('enviado', 'en_reparto', 'entregado')

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
    """Quita las líneas cuyos datos no existen, para que no quede «Código de seguimiento: » vacío.

    Una línea se omite solo si usa variables y ninguna tiene valor; las líneas con texto fijo o con
    algún dato presente se conservan. Después se juntan los saltos de línea que hayan quedado de más.
    """
    lineas = []
    for linea in texto.split('\n'):
        variables = _MARCADOR.findall(linea)
        if variables and not any(contexto.get(variable) for variable in variables):
            continue
        lineas.append(linea)
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lineas)).strip('\n')


def renderizar_pedido_despachado(pedido, plantilla=None):
    if pedido.estado not in ESTADOS_DESPACHADOS:
        raise PlantillaCorreoInvalida('Solo se avisa el despacho de un pedido que ya fue enviado.')
    if (pedido.entrega or {}).get('metodo') == 'Retiro':
        raise PlantillaCorreoInvalida('Un pedido con retiro en tienda no se despacha.')
    base = plantilla or PLANTILLA_PEDIDO_DESPACHADO
    contexto = contexto_pedido(pedido)
    return PlantillaCorreo(
        asunto=base.asunto, preheader=base.preheader, cuerpo=_sin_datos_ausentes(base.cuerpo, contexto),
    ).renderizar(contexto)
