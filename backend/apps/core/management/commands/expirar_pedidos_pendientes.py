"""Expira los pedidos pendientes vencidos y devuelve su stock (SCRUM-509).
"""
import logging
import signal
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections, connection, connections

from apps.core.infrastructure.expiracion_pedidos import ejecutar_ciclo_de_expiracion

logger = logging.getLogger(__name__)

CLAVE_BLOQUEO = 509_001  # identifica a este proceso en pg_advisory_lock
INTERVALO_MINIMO = 30
LATIDO_POR_DEFECTO = '/tmp/expirador_pedidos.heartbeat'


@contextmanager
def exclusion_mutua(clave=CLAVE_BLOQUEO):
    if connection.vendor != 'postgresql':
        yield True
        return
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_try_advisory_lock(%s)', [clave])
        obtenido = bool(cursor.fetchone()[0])
    try:
        yield obtenido
    finally:
        if obtenido:
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_advisory_unlock(%s)', [clave])
            except Exception:
                logger.warning('No se pudo liberar el bloqueo del expirador; se libera al cerrar la sesion.')


class Command(BaseCommand):
    help = ('Cancela los pedidos pendientes vencidos segun el plazo de cada tienda y devuelve su stock; en PayPal y '
            'Mercado Pago concilia antes con la pasarela. Una pasada, o servicio permanente con --daemon.')

    def add_arguments(self, parser):
        parser.add_argument('--daemon', action='store_true', help='Repite la pasada hasta recibir SIGTERM/SIGINT.')
        parser.add_argument('--intervalo', type=int, default=300,
                            help=f'Segundos entre pasadas en modo --daemon (minimo {INTERVALO_MINIMO}, por defecto 300).')
        parser.add_argument('--lote', type=int, default=500,
                            help='Maximo de pedidos por pasada, los mas antiguos primero (por defecto 500).')
        parser.add_argument('--latido', default=LATIDO_POR_DEFECTO,
                            help='Archivo que se actualiza tras cada pasada correcta en modo --daemon (healthcheck).')

    def handle(self, *args, **options):
        if options['lote'] < 1:
            raise CommandError('--lote debe ser mayor que 0.')
        if options['daemon']:
            if options['intervalo'] < INTERVALO_MINIMO:
                raise CommandError(f'--intervalo debe ser de al menos {INTERVALO_MINIMO} segundos.')
            return self._servicio(options)
        resumen = self._pasada(options['lote'])
        if resumen is None or resumen.get('error'):
            raise CommandError('La pasada de expiracion no termino correctamente; revisa el log.')

    def _pasada(self, lote):
        """Ejecuta una pasada. Devuelve el resumen, o None si fallo. Nunca lanza."""
        inicio = time.monotonic()
        try:
            with exclusion_mutua() as obtenido:
                if not obtenido:
                    self.stdout.write('Expiracion omitida: otra pasada esta en curso.')
                    return {}
                resumen = ejecutar_ciclo_de_expiracion(limite=lote)
        except Exception:
            logger.exception('Fallo la pasada de expiracion de pedidos.')
            connections.close_all()  # la proxima pasada abre una conexion nueva
            return None
        detalle = ', '.join(f'{clave}={valor}' for clave, valor in sorted(resumen.items())) or 'sin pedidos vencidos'
        self.stdout.write(f'Expiracion de pedidos: {detalle} ({time.monotonic() - inicio:.1f} s).')
        if resumen.get('indeterminado') or resumen.get('error'):
            logger.warning('Expiracion de pedidos con casos sin resolver: %s', dict(resumen))
        return resumen

    # ------------------------------------------------------------------ servicio permanente
    def _servicio(self, options):
        parar = threading.Event()

        def solicitar_parada(numero, _marco):
            self.stdout.write(f'Senal {signal.Signals(numero).name} recibida: el expirador se detendra al terminar la pasada.')
            parar.set()

        signal.signal(signal.SIGTERM, solicitar_parada)
        signal.signal(signal.SIGINT, solicitar_parada)

        intervalo, lote, latido = options['intervalo'], options['lote'], Path(options['latido'])
        self.stdout.write(f'Expirador de pedidos iniciado: cada {intervalo} s, hasta {lote} pedidos por pasada.')
        proxima = time.monotonic()
        while not parar.is_set():
            close_old_connections()
            resumen = self._pasada(lote)
            if resumen is not None:
                self._latir(latido)
            proxima += intervalo
            ahora = time.monotonic()
            if proxima < ahora:
                proxima = ahora
            parar.wait(proxima - ahora)
        connections.close_all()
        self.stdout.write('Expirador de pedidos detenido.')

    @staticmethod
    def _latir(ruta):
        try:
            ruta.touch()
        except OSError:
            logger.warning('No se pudo escribir el latido del expirador en %s.', ruta)
