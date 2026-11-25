import logging
import signal
import threading

from django.core.management.base import BaseCommand
from apps.landing.abandoned_cart_jobs import process_reminders

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Procesa carritos abandonados con consentimiento comercial."

    def add_arguments(self, parser):
        parser.add_argument("--daemon", action="store_true")
        parser.add_argument("--intervalo", type=int, default=300)
        parser.add_argument("--lote", type=int, default=25)

    def handle(self, *args, **options):
        if options["lote"] < 1 or options["intervalo"] < 30:
            raise ValueError("Parámetros de procesamiento inválidos.")

        if not options["daemon"]:
            self.stdout.write(
                str(process_reminders(options["lote"]))
            )
            return

        stop = threading.Event()

        def shutdown(*_):
            stop.set()

        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)

        while not stop.is_set():
            try:
                self.stdout.write(
                    str(process_reminders(options["lote"]))
                )
            except Exception:
                logger.exception(
                    "Error en procesamiento de carritos."
                )

            stop.wait(options["intervalo"])
