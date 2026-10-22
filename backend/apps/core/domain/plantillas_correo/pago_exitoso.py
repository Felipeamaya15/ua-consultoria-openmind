from .base import PlantillaCorreo, PlantillaCorreoInvalida, contexto_pedido
from apps.core.models import Pedido

PLANTILLA_PAGO_EXITOSO = PlantillaCorreo(
    asunto='Tu pago fue confirmado · {{orderNumber}}',
    preheader='Tu compra ya está en preparación.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'Confirmamos el pago de tu pedido {{orderNumber}} por {{orderTotal}}. '
        'Comenzaremos a preparar tu compra.\n\n'
        'Te enviaremos otra actualización cuando tu pedido sea despachado.\n\n'
        '{{storeName}}'
    ),
)


def renderizar_pago_exitoso(pedido, plantilla=None):
    if pedido.estado not in Pedido.ESTADOS_PAGADOS:
        raise PlantillaCorreoInvalida('Solo se confirma el pago de un pedido que ya está pagado.')
    return (plantilla or PLANTILLA_PAGO_EXITOSO).renderizar(contexto_pedido(pedido))
