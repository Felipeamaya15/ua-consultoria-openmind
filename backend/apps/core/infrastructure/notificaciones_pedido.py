"""Avisos por correo de un pedido (SCRUM-431).

Cuando un pedido cambia de estado, este módulo decide si corresponde un correo al comprador, lo construye con
la plantilla de la tienda (apps/core/domain/plantillas_correo) y lo envía con el servicio de correo
(apps/core/infrastructure/email_service). Nunca lanza una excepción: un correo que falla no debe impedir
el cambio de estado.

Para no enviar dos veces el mismo aviso, en el pedido queda una marca en `entrega['notificaciones'][tipo]`:

    {'enviado': True | False, 'codigo': 'enviado' | 'error_de_envio' | ..., 'fecha': ISO, 'intentos': N}

- Si el aviso ya salió (`enviado`), no se repite aunque el pedido vuelva a ese estado.
- Si falló, se reintenta la próxima vez que el pedido entre en ese estado.
- Mientras un envío está en curso (`codigo` "enviando", hace menos de 5 minutos) no se inicia otro.
"""
import logging
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.domain.plantillas_correo import PlantillaCorreoInvalida, construir_correo
from apps.core.domain.plantillas_correo.base import contexto_pedido
from apps.core.infrastructure.email_service import ResultadoEnvio, enviar_correo
from apps.core.models import Pedido

logger = logging.getLogger(__name__)

# Qué correo corresponde cuando un pedido llega a cada estado.
CORREO_POR_ESTADO = {'enviado': 'order_shipped'}
ESPERA_ENVIO_EN_CURSO = timedelta(minutes=5)

# Códigos del resultado además de los del servicio de correo (enviado, destinatario_invalido, ...).
NO_CORRESPONDE = 'no_corresponde'
PLANTILLA_DESACTIVADA = 'plantilla_desactivada'
YA_ENVIADO = 'ya_enviado'
ENVIO_EN_CURSO = 'envio_en_curso'
ERROR_INESPERADO = 'error_inesperado'
ENVIANDO = 'enviando'


def notificar_pedido(tipo, pedido):
    """Construye el correo `tipo` del pedido y lo envía. No guarda marcas ni lanza por datos del pedido."""
    try:
        correo = construir_correo(tipo, pedido)
    except PlantillaCorreoInvalida as error:
        return ResultadoEnvio(False, NO_CORRESPONDE, str(error))
    if correo is None:
        return ResultadoEnvio(False, PLANTILLA_DESACTIVADA, 'El propietario desactivó este correo.')
    contexto = contexto_pedido(pedido)
    return enviar_correo(
        contexto['customerEmail'], correo.asunto, correo.cuerpo,
        preheader=correo.preheader, nombre_remitente=contexto['storeName'],
        referencia=f"{tipo} {contexto['orderNumber']}",
    )


def _marca(pedido, tipo):
    notificaciones = (pedido.entrega or {}).get('notificaciones')
    marca = notificaciones.get(tipo) if isinstance(notificaciones, dict) else None
    return marca if isinstance(marca, dict) else {}


def _guardar_marca(pedido, tipo, marca):
    """Escribe (o borra, si `marca` es None) la marca del aviso sin tocar el resto de `entrega`."""
    entrega = dict(pedido.entrega or {})
    notificaciones = dict(entrega.get('notificaciones') or {})
    if marca is None:
        notificaciones.pop(tipo, None)
    else:
        notificaciones[tipo] = marca
    if notificaciones:
        entrega['notificaciones'] = notificaciones
    else:
        entrega.pop('notificaciones', None)
    pedido.entrega = entrega
    pedido.save(update_fields=['entrega'])


def _reciente(fecha):
    try:
        return timezone.now() - datetime.fromisoformat(fecha) < ESPERA_ENVIO_EN_CURSO
    except (TypeError, ValueError):
        return False


def _reservar(pedido, tipo):
    """Reserva el envío del aviso. Devuelve (motivo, marca_anterior); `motivo` es None si se puede enviar."""
    with transaction.atomic():
        actual = Pedido.objects.select_for_update().get(pk=pedido.pk)
        anterior = _marca(actual, tipo)
        if anterior.get('enviado'):
            return YA_ENVIADO, anterior
        if anterior.get('codigo') == ENVIANDO and _reciente(anterior.get('fecha')):
            return ENVIO_EN_CURSO, anterior
        _guardar_marca(actual, tipo, {
            'enviado': False, 'codigo': ENVIANDO, 'fecha': timezone.now().isoformat(),
            'intentos': anterior.get('intentos', 0),
        })
    pedido.entrega = actual.entrega
    return None, anterior


def notificar_cambio_de_estado(pedido, estado_anterior):
    """Envía el aviso que corresponde cuando un pedido cambió de estado. Nunca lanza.

    Devuelve un `ResultadoEnvio`, o None si ese cambio de estado no genera ningún correo.
    """
    try:
        tipo = CORREO_POR_ESTADO.get(pedido.estado)
        if tipo is None or pedido.estado == estado_anterior:
            return None
        motivo, anterior = _reservar(pedido, tipo)
        if motivo:
            return ResultadoEnvio(False, motivo)
        try:
            resultado = notificar_pedido(tipo, pedido)
        except Exception:
            logger.exception('Falló la preparación del correo %s del pedido %s', tipo, pedido.pk)
            resultado = ResultadoEnvio(False, ERROR_INESPERADO, 'Error inesperado al preparar el correo.')
        if resultado.codigo in (NO_CORRESPONDE, PLANTILLA_DESACTIVADA):
            _guardar_marca(pedido, tipo, anterior or None)  # no se intentó: se deja como estaba
        else:
            _guardar_marca(pedido, tipo, {
                'enviado': resultado.enviado, 'codigo': resultado.codigo, 'fecha': timezone.now().isoformat(),
                'intentos': anterior.get('intentos', 0) + 1,
            })
        return resultado
    except Exception:
        logger.exception('Falló el aviso por correo del pedido %s', getattr(pedido, 'pk', '?'))
        return None
