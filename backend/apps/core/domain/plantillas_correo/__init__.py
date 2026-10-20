"""Plantillas de correo del pedido. Punto de entrada: construir_correo(tipo, pedido)."""
from .base import PlantillaCorreo, PlantillaCorreoInvalida
from .recepcion_pedido import PLANTILLA_RECEPCION_PEDIDO, renderizar_recepcion_pedido

TIPOS = {
    'order_received': (renderizar_recepcion_pedido, PLANTILLA_RECEPCION_PEDIDO),
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


def construir_correo(tipo, pedido):
    if tipo not in TIPOS:
        raise PlantillaCorreoInvalida(f'Tipo de correo desconocido: {tipo}.')
    renderizar, _ = TIPOS[tipo]
    plantilla, activa = plantilla_de_tienda(pedido.tienda, tipo)
    if not activa:
        return None
    return renderizar(pedido, plantilla)
