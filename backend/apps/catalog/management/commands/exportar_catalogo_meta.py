import csv
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlsplit, quote

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Tienda
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.domain.stock import is_variant_active
from apps.core.image_processing import process_data_url
from django.core.exceptions import ValidationError as ImageValidationError
from apps.visual_config.models import ConfiguracionVisual

COLUMNAS = [
    "id", "title", "description", "availability",
    "condition", "price", "sale_price", "link",
    "image_link", "brand",
]


def texto(value, size=250):
    value = re.sub(r"\s+", " ", str(value or "")).strip()[:size]
    if value.startswith(("=", "+", "-", "@")):
        value = "'" + value
    return value


def monto(value):
    if isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
        if (number.is_finite() and number > 0
                and number == number.to_integral_value()):
            return number
    except (InvalidOperation, ValueError, TypeError):
        pass
    return None


def url_publica(value, permitir_local=False):
    if not isinstance(value, str) or len(value) > 2048:
        return ""
    if any(c in value for c in "\r\n\t\\ "):
        return ""
    try:
        parsed = urlsplit(value)
        if (not parsed.hostname or parsed.username
                or parsed.password or parsed.fragment):
            return ""
        if parsed.scheme == "https":
            return value
        if (permitir_local and parsed.scheme == "http"
                and parsed.hostname in ("localhost", "127.0.0.1")):
            return value
    except ValueError:
        pass
    return ""


def generar(producto, tienda, base_url, plantilla, permitir_local, api_base):
    pid = str(producto.get("_id", ""))
    slug = str(producto.get("slug") or "")
    nombre = texto(producto.get("nombre"), 150)

    if (not re.fullmatch(r"[0-9a-f]{24}", pid)
            or not re.fullmatch(r"[a-zA-Z0-9_-]+", slug)
            or not nombre):
        return None, "identificacion"

    variantes = []
    for v in producto.get("variantes") or []:
        if not isinstance(v, dict) or not is_variant_active(v):
            continue

        precio = monto(v.get("precio"))
        stock = v.get("stock")

        if (precio is None or not str(v.get("sku") or "").strip()
                or isinstance(stock, bool)
                or not isinstance(stock, int) or stock < 0):
            continue

        oferta = monto(v.get("precio_oferta"))
        if oferta is not None and oferta >= precio:
            oferta = None

        efectivo = oferta if oferta is not None else precio
        variantes.append((stock > 0, efectivo, precio, oferta))

    if not variantes:
        return None, "sin_variantes_validas"

    disponibles = [v for v in variantes if v[0]]
    seleccionado = min(
        disponibles or variantes,
        key=lambda v: v[1],
    )

    imagen = ""
    for index, candidate in enumerate(producto.get("imagenes") or []):
        imagen = url_publica(candidate, permitir_local)

        if imagen:
            break

        if (
            index <= 9
            and isinstance(candidate, str)
            and candidate.startswith("data:image/")
        ):
            try:
                process_data_url(candidate, max_mb=2)
            except (ImageValidationError, ValueError, TypeError):
                continue

            imagen = (
                f"{api_base}/api/catalog/productos/"
                f"{quote(slug, safe='')}/imagen-meta/{index}/"
            )
            break

    if not imagen:
        return None, "sin_imagen_publica"

    return {
        "id": pid,
        "title": nombre,
        "description": texto(
            producto.get("descripcion") or nombre, 3000
        ),
        "availability": "in stock" if disponibles else "out of stock",
        "condition": "new",
        "price": f"{seleccionado[2]} CLP",
        "sale_price": (
            f"{seleccionado[3]} CLP"
            if seleccionado[3] is not None else ""
        ),
        "link": (
            f"{base_url}/plantilla/{plantilla}/producto/"
            f"{quote(slug, safe='')}"
        ),
        "image_link": imagen,
        "brand": texto(tienda.nombre, 100),
    }, None


class Command(BaseCommand):
    help = "Exporta una vista previa TSV del catálogo para Meta."

    def add_arguments(self, parser):
        parser.add_argument(
            "--salida", default="/tmp/catalogo_meta_previa.tsv"
        )
        parser.add_argument("--url", default="")
        parser.add_argument("--api-url", default="")
        parser.add_argument("--permitir-local", action="store_true")

    def handle(self, *args, **options):
        try:
            tienda = Tienda.objects.get()
        except (Tienda.DoesNotExist, Tienda.MultipleObjectsReturned):
            raise CommandError(
                "Debe existir exactamente una tienda local."
            ) from None

        url = options["url"] or settings.STOREFRONT_PUBLIC_URL
        permitir_local = options["permitir_local"]
        api_url = options["api_url"] or getattr(
            settings, "STORE_MAIL_PUBLIC_API_URL", ""
        )

        if not url_publica(api_url, permitir_local):
            raise CommandError("Configura la URL pública del backend.")

        api_parsed = urlsplit(api_url)
        if api_parsed.path not in ("", "/") or api_parsed.query:
            raise CommandError("La URL del backend debe ser su origen.")

        api_base = (
            f"{api_parsed.scheme}://{api_parsed.netloc}"
        )

        if not url_publica(url, permitir_local):
            raise CommandError(
                "Se requiere una URL pública HTTPS, o "
                "--permitir-local para una vista previa local."
            )

        parsed = urlsplit(url)
        if parsed.query:
            raise CommandError("La URL no admite parámetros.")

        raiz = re.sub(
            r"/plantilla/[1-4]/?$", "",
            parsed.path.rstrip("/")
        )
        base_url = (
            f"{parsed.scheme}://{parsed.netloc}{raiz}"
        ).rstrip("/")

        visual = ConfiguracionVisual.objects.filter(
            tienda=tienda
        ).first()

        nombre_plantilla = (
            visual.plantilla_seleccionada if visual else "editorial"
        )
        plantilla = {
            "editorial": 1, "minimal": 2,
            "visual": 3, "catalog": 4,
        }.get(nombre_plantilla, 1)

        repo = ProductRepository()
        productos = list(
            repo.collection.find(
                {
                    "tienda_id": str(tienda.pk),
                    "activo": True,
                },
                {
                    "_id": 1, "slug": 1, "nombre": 1,
                    "descripcion": 1, "variantes": 1,
                    "imagenes": 1,
                },
            ).limit(5001)
        )

        if len(productos) > 5000:
            raise CommandError(
                "Más de 5000 productos: se requiere paginación."
            )

        filas = []
        omitidos = {}

        for producto in productos:
            fila, motivo = generar(
                producto, tienda, base_url,
                plantilla, permitir_local, api_base
            )
            if fila:
                filas.append(fila)
            else:
                omitidos[motivo] = omitidos.get(motivo, 0) + 1

        salida = Path(options["salida"])

        if salida.suffix.lower() != ".tsv":
            raise CommandError("La salida debe terminar en .tsv.")

        if not salida.parent.is_dir():
            raise CommandError("No existe la carpeta de destino.")

        with salida.open(
            "w", newline="", encoding="utf-8-sig"
        ) as archivo:
            writer = csv.DictWriter(
                archivo, fieldnames=COLUMNAS,
                delimiter="\t"
            )
            writer.writeheader()
            writer.writerows(filas)

        self.stdout.write(f"Catálogo generado: {salida}")
        self.stdout.write(
            f"Activos: {len(productos)} | "
            f"Exportados: {len(filas)}"
        )
        self.stdout.write(f"Omitidos: {omitidos}")
        self.stdout.write(
            "Vista previa local: no se enviaron datos a Meta."
        )
