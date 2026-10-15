"""Protección del seguimiento de pedidos para compradores invitados (SCRUM-365).

El comprador invitado se identifica con número de orden y correo. Además del límite por IP
que ya existe, se cuentan los intentos fallidos por número de orden y por correo, para que
nadie pueda adivinar el correo de una orden ni recorrer números de orden con un correo conocido.

- Se cuentan solo los intentos que llegan a buscar el pedido y no lo encuentran. Un formato
  inválido (400) no cuenta, y un intento correcto borra los contadores de esa orden y ese correo.
- Existe o no la orden, el conteo es el mismo: el bloqueo no permite saber si una orden existe.
- Mientras una orden o un correo están bloqueados, ni siquiera las credenciales correctas
  pasan: si pasaran, el bloqueo no frenaría a quien está adivinando.
- Las claves de la cache llevan un resumen (SHA-256) del dato, nunca el correo ni el número.
"""
import hashlib
import logging
import math
import time

from django.conf import settings
from django.core.cache import cache
from rest_framework.exceptions import Throttled

from apps.core.presentation.exceptions import custom_exception_handler

logger = logging.getLogger(__name__)

# Valores por defecto; se pueden cambiar en settings con estos mismos nombres.
MAX_FALLOS_POR_ORDEN = 5
MAX_FALLOS_POR_CORREO = 10
VENTANA_SEGUNDOS = 15 * 60


def describir_espera(segundos):
    """30 -> '30 segundos', 60 -> '1 minuto', 61 -> '2 minutos' (siempre redondea hacia arriba)."""
    segundos = max(1, math.ceil(segundos))
    if segundos < 60:
        return f'{segundos} segundo' + ('' if segundos == 1 else 's')
    minutos = math.ceil(segundos / 60)
    return f'{minutos} minuto' + ('' if minutos == 1 else 's')


class TrackingLocked(Throttled):
    """Demasiados intentos fallidos para esta orden o este correo."""

    def __init__(self, espera):
        # No se pasa `wait` al constructor: DRF le agregaria al mensaje su propio texto
        # ("Se espera que esté disponible en N segundos") y el tiempo quedaría repetido.
        super().__init__(
            detail=f'Demasiados intentos fallidos. Vuelve a intentarlo en {describir_espera(espera)}.',
        )
        self.wait = math.ceil(espera)  # lo usa DRF para la cabecera Retry-After


class _ContadorDeFallos:
    """Intentos fallidos de un dato (orden o correo) en una ventana fija guardada en la cache."""

    def __init__(self, ambito, valor, maximo, ventana):
        resumen = hashlib.sha256(valor.encode('utf-8')).hexdigest()
        self.ambito = ambito
        self.referencia = resumen[:12]
        self.clave = f'tracking:fallos:{ambito}:{resumen}'
        self.clave_fin = f'{self.clave}:fin'
        self.maximo = maximo
        self.ventana = ventana

    def espera(self, ahora):
        """Segundos que faltan para que se libere, o 0 si no está bloqueado."""
        if (cache.get(self.clave) or 0) < self.maximo:
            return 0
        fin = cache.get(self.clave_fin)
        return max(1, math.ceil(fin - ahora)) if fin else self.ventana

    def sumar(self, ahora):
        cache.add(self.clave_fin, ahora + self.ventana, self.ventana)
        cache.add(self.clave, 0, self.ventana)
        try:
            return cache.incr(self.clave)
        except ValueError:
            # La ventana venció justo entre las dos operaciones: se empieza una nueva.
            cache.set(self.clave_fin, ahora + self.ventana, self.ventana)
            cache.set(self.clave, 1, self.ventana)
            return 1

    def borrar(self):
        cache.delete_many([self.clave, self.clave_fin])


class TrackingAttemptGuard:
    """Lleva el control de los intentos fallidos de una consulta de seguimiento."""

    def __init__(self, identificador, email):
        ventana = getattr(settings, 'TRACKING_LOCK_WINDOW_SECONDS', VENTANA_SEGUNDOS)
        self.contadores = (
            _ContadorDeFallos('orden', identificador.upper(),
                              getattr(settings, 'TRACKING_MAX_FAILED_PER_ORDER', MAX_FALLOS_POR_ORDEN), ventana),
            _ContadorDeFallos('correo', email.casefold(),
                              getattr(settings, 'TRACKING_MAX_FAILED_PER_EMAIL', MAX_FALLOS_POR_CORREO), ventana),
        )

    def check(self):
        """Corta la consulta (429) si la orden o el correo están bloqueados."""
        ahora = time.time()
        esperas = [contador.espera(ahora) for contador in self.contadores]
        if any(esperas):
            raise TrackingLocked(max(esperas))

    def register_failure(self):
        ahora = time.time()
        for contador in self.contadores:
            if contador.sumar(ahora) == contador.maximo:
                logger.warning(
                    'Seguimiento de invitado bloqueado por intentos fallidos: ambito=%s referencia=%s',
                    contador.ambito, contador.referencia,
                )

    def register_success(self):
        for contador in self.contadores:
            contador.borrar()


def tracking_exception_handler(exc, context):
    """Igual que el manejador del proyecto, pero los 429 salen en español y con los segundos de espera."""
    response = custom_exception_handler(exc, context)
    if response is not None and isinstance(exc, Throttled):
        espera = math.ceil(exc.wait) if exc.wait else None
        if not isinstance(exc, TrackingLocked):
            # El límite por IP de DRF trae su texto en inglés ("Request was throttled...").
            response.data['mensaje'] = (
                f'Demasiadas consultas seguidas. Vuelve a intentarlo en {describir_espera(espera)}.'
                if espera else 'Demasiadas consultas seguidas. Inténtalo de nuevo en unos minutos.'
            )
        response.data['error']['detalles'] = {'reintentar_en_segundos': espera} if espera else None
    return response
