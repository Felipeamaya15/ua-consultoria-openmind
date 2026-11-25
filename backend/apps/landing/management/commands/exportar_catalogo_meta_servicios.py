
import csv
import re
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding
from apps.landing.activities import (
    activity_title,
    activity_schedule,
    require_paid_activity_open,
)
from apps.landing.paid_availability import occupied_seats
from apps.visual_config.models import ConfiguracionVisual


COLUMNS = [
    "item_id", "title", "description", "price_type",
    "price", "duration_type", "url", "image[0].url",
]
PENDING_COLUMNS = ["item_id", "titulo", "motivo"]


def clean(value, limit=200):
    result = re.sub(r"\s+", " ", str(value or "")).strip()[:limit]
    return "'" + result if result.startswith(("=", "+", "-", "@")) else result


def valid_url(value, local=False, image=False):
    if not isinstance(value, str) or len(value) > 2048:
        return False
    if re.search(r"[\s\\<>]", value):
        return False
    try:
        u = urlsplit(value)
        if not u.hostname or u.username or u.password or u.fragment:
            return False
        if u.scheme != "https":
            if not (
                local and u.scheme == "http"
                and u.hostname in ("localhost", "127.0.0.1")
            ):
                return False
        if image:
            return u.path.lower().endswith(
                (".jpg", ".jpeg", ".png", ".gif", ".webp")
            )
        return u.path in ("", "/") and not u.query
    except ValueError:
        return False


def image_for(section, local, api_base):
    portada = (section.get("actividad") or {}).get("portada") or ""
    if not isinstance(portada, str) or not portada:
        return ""

    if portada.startswith("/media/landing/blocks/"):
        candidate = api_base + portada
    else:
        candidate = portada

    return candidate if valid_url(candidate, local, image=True) else ""


def write_tsv(path, columns, rows):
    path = Path(path)
    if path.suffix.lower() != ".tsv" or not path.parent.is_dir():
        raise CommandError("La salida debe ser un TSV en una carpeta existente.")
    with path.open("w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(
            output, fieldnames=columns, delimiter="\t"
        )
        writer.writeheader()
        writer.writerows(rows)


class Command(BaseCommand):
    help = "Genera una vista previa local de servicios para Meta."

    def add_arguments(self, parser):
        parser.add_argument("--url", required=True)
        parser.add_argument("--api-url", required=True)
        parser.add_argument("--permitir-local", action="store_true")
        parser.add_argument(
            "--salida", default="/tmp/meta_servicios_previa.tsv"
        )
        parser.add_argument(
            "--pendientes", default="/tmp/meta_servicios_pendientes.tsv"
        )

    def handle(self, *args, **opts):
        base = opts["url"].rstrip("/")
        api_base = opts["api_url"].rstrip("/")
        local = opts["permitir_local"]

        if not valid_url(base, local) or not valid_url(api_base, local):
            raise CommandError("Indica un origen HTTPS válido.")

        try:
            store = Tienda.objects.get()
        except (Tienda.DoesNotExist, Tienda.MultipleObjectsReturned):
            raise CommandError(
                "Debe existir exactamente una tienda local."
            ) from None

        landing = ConfiguracionLanding.objects.filter(
            tienda=store
        ).first()

        if not landing:
            raise CommandError("No existe configuración de landing.")

        visual = ConfiguracionVisual.objects.filter(
            tienda=store
        ).first()

        template = {
            "editorial": 1,
            "minimal": 2,
            "visual": 3,
            "catalog": 4,
        }.get(
            visual.plantilla_seleccionada if visual else "editorial",
            1,
        )

        public_page = f"{base}/plantilla/{template}"
        now = timezone.now()
        rows = []
        pending = []

        blocks = (landing.contenido or {}).get("bloques", [])
        if not isinstance(blocks, list):
            raise CommandError("La estructura de bloques es inválida.")

        if len(blocks) > 5000:
            raise CommandError("Demasiadas secciones para esta vista previa.")

        for block in blocks:
            if not isinstance(block, dict) or not block.get("actividad"):
                continue

            identifier = str(block.get("id", ""))
            title = clean(activity_title(block))
            config = block["actividad"]
            reason = ""

            try:
                identifier = str(UUID(identifier))
            except (TypeError, ValueError, AttributeError):
                reason = "identificador_invalido"

            if not reason and (
                not block.get("visible")
                or config.get("estado") != "activa"
            ):
                reason = "no_publicada"

            price_type = ""
            price = ""

            if not reason:
                if config.get("venta") is not None:
                    try:
                        details = require_paid_activity_open(
                            block, now=now
                        )
                        available = (
                            details["cupos"]
                            - occupied_seats(store, identifier, now)
                        )
                        if available <= 0:
                            reason = "sin_cupos"
                        else:
                            price_type = "VALUE"
                            price = f'{details["precio"]} CLP'
                    except Exception:
                        reason = "venta_no_disponible"

                elif config.get("gratuito") and config.get("inscripciones"):
                    try:
                        schedule = activity_schedule(block)
                        if not schedule or schedule[0] <= now:
                            reason = "inscripcion_cerrada"
                        else:
                            capacity = config.get("cupos")
                            if capacity is not None and (
                                occupied_seats(store, identifier, now)
                                >= capacity
                            ):
                                reason = "sin_cupos"
                            else:
                                price_type = "FREE"
                    except Exception:
                        reason = "horario_invalido"
                else:
                    reason = "sin_reserva_en_linea"

            img = image_for(block, local, api_base) if not reason else ""
            if not reason and not img:
                reason = "sin_imagen_publica_compatible"

            if not title and not reason:
                reason = "sin_titulo"

            if reason:
                pending.append({
                    "item_id": identifier,
                    "titulo": title,
                    "motivo": reason,
                })
                continue

            description = next((
                clean(item.get("texto"), 3000)
                for item in block.get("componentes", [])
                if isinstance(item, dict)
                and item.get("visible")
                and item.get("tipo") in ("descripcion", "parrafo")
                and item.get("texto")
            ), title)

            rows.append({
                "item_id": identifier,
                "title": title,
                "description": description,
                "price_type": price_type,
                "price": price,
                "duration_type": "VARIES",
                "url": public_page,
                "image[0].url": img,
            })

        write_tsv(opts["salida"], COLUMNS, rows)
        write_tsv(opts["pendientes"], PENDING_COLUMNS, pending)

        self.stdout.write(
            f"Vista previa: {len(rows)} actividades exportadas."
        )
        self.stdout.write(
            f"Pendientes: {len(pending)} actividades."
        )
        self.stdout.write(
            "No se enviaron datos a Meta ni se modificó la base de datos."
        )
