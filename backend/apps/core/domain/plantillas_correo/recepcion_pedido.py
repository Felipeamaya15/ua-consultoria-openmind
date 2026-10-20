from .base import PlantillaCorreo, PlantillaCorreoInvalida, contexto_pedido

PLANTILLA_RECEPCION_PEDIDO = PlantillaCorreo(
    asunto='Recibimos tu pedido {{orderNumber}}',
    preheader='Estamos preparando tu solicitud.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'Recibimos tu pedido {{orderNumber}}. Te avisaremos cuando se confirme el pago '
        'y avance la preparación.\n\n'
        'Total del pedido: {{orderTotal}}\n'
        'Método de entrega: {{shippingMethod}}\n\n'
        'Gracias por comprar en {{storeName}}.'
    ),
)


def renderizar_recepcion_pedido(pedido, plantilla=None):
    if pedido.estado == 'cancelado':
        raise PlantillaCorreoInvalida('No se confirma la recepción de un pedido cancelado.')
    return (plantilla or PLANTILLA_RECEPCION_PEDIDO).renderizar(contexto_pedido(pedido))
