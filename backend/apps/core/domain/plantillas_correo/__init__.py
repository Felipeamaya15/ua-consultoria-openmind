"""Plantillas de correo del pedido. Punto de entrada: construir_correo(tipo, pedido)."""
from .base import CorreoRenderizado, PlantillaCorreo, PlantillaCorreoInvalida, VARIABLES_PERMITIDAS
from .pago_exitoso import PLANTILLA_PAGO_EXITOSO, renderizar_pago_exitoso
from .pago_rechazado import PLANTILLA_PAGO_RECHAZADO, renderizar_pago_rechazado
from .pedido_despachado import PLANTILLA_PEDIDO_DESPACHADO, renderizar_pedido_despachado
from .pedido_entregado import PLANTILLA_PEDIDO_ENTREGADO, renderizar_pedido_entregado
from .pedido_cancelado import PLANTILLA_PEDIDO_CANCELADO, renderizar_pedido_cancelado
from .recepcion_pedido import PLANTILLA_RECEPCION_PEDIDO, renderizar_recepcion_pedido

TIPOS = {
    'order_received': (renderizar_recepcion_pedido, PLANTILLA_RECEPCION_PEDIDO),
    'payment_success': (renderizar_pago_exitoso, PLANTILLA_PAGO_EXITOSO),
    'order_shipped': (renderizar_pedido_despachado, PLANTILLA_PEDIDO_DESPACHADO),
    'order_delivered': (renderizar_pedido_entregado, PLANTILLA_PEDIDO_ENTREGADO),
    'order_cancelled': (renderizar_pedido_cancelado, PLANTILLA_PEDIDO_CANCELADO),
}

_ALIAS_TIPOS = {
    'payment_rejected': (renderizar_pago_rechazado, PLANTILLA_PAGO_RECHAZADO),
}


def plantilla_de_tienda(tienda, tipo):
    """
    Devuelve (plantilla, activa).
    """
    from apps.core.models import ConfiguracionCorreo
    config = ConfiguracionCorreo.objects.filter(tienda=tienda).first() if tienda else None
    guardada = (config.plantillas if config else {}).get(tipo)
    if not guardada:
        return None, True
    plantilla = PlantillaCorreo(
        asunto=guardada.get('subject', ''), preheader=guardada.get('preheader', ''), cuerpo=guardada.get('body', ''),
    )
    return plantilla, bool(guardada.get('enabled', True))


def construir_correo(tipo, pedido, forzar=False):
    handler = TIPOS.get(tipo) or _ALIAS_TIPOS.get(tipo)
    if handler is None:
        raise PlantillaCorreoInvalida(f'Tipo de correo desconocido: {tipo}.')
    renderizar, por_defecto = handler
    plantilla, activa = plantilla_de_tienda(pedido.tienda, tipo)
    if not activa and not forzar:
        return None
    try:
        return renderizar(pedido, plantilla or por_defecto, forzar=forzar)
    except TypeError:
        return renderizar(pedido, plantilla or por_defecto)
