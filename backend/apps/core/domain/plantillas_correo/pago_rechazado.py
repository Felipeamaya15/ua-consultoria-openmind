from .base import PlantillaCorreo, PlantillaCorreoInvalida, contexto_pedido

PLANTILLA_PAGO_RECHAZADO = PlantillaCorreo(
    asunto='No pudimos confirmar tu pago · {{orderNumber}}',
    preheader='Puedes intentar nuevamente con otro medio de pago.',
    cuerpo=(
        'Hola {{customerName}},\n\n'
        'No pudimos confirmar el pago de tu pedido {{orderNumber}}. No se realizó ningún cobro.\n\n'
        'Puedes volver a intentarlo usando otro medio de pago o contactarnos si necesitas ayuda.\n\n'
        '{{storeName}}'
    ),
)


def renderizar_pago_rechazado(pedido, plantilla=None):
    if pedido.estado != 'pendiente':
        raise PlantillaCorreoInvalida('Solo se informa un pago rechazado en un pedido pendiente de pago.')
    return (plantilla or PLANTILLA_PAGO_RECHAZADO).renderizar(contexto_pedido(pedido))
