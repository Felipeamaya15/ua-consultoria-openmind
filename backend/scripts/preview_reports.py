"""Evidencias PDF con fixtures identificadas, exclusivamente en SQLite en memoria.

No conecta PostgreSQL/Mongo ni modifica datos comerciales. Ejecutar desde backend:
venv/Scripts/python.exe scripts/preview_reports.py [directorio_salida]
"""
import os
import sys
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
import django
django.setup()
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from apps.core.models import Tienda, Pedido
from apps.core.infrastructure.reports import consultar_informe
from apps.core.infrastructure.report_pdf import generar_pdf

with connection.schema_editor() as schema:
    for model in apps.get_models():
        if model._meta.managed and not model._meta.proxy:
            schema.create_model(model)
owner = get_user_model().objects.create_user(username='pdf-fixture-owner')
store = Tienda.objects.create(nombre='Tienda de prueba Ñandú & amigos - evidencia de QA con datos de prueba, sin información comercial real', id_usuario_propietario=owner)
for month in (1, 3, 10, 12):
    for state, amount in [('pagado', '12345678.50'), ('pendiente', '99999'), ('entregado', '3500')]:
        order = Pedido.objects.create(tienda=store, estado=state, monto_total=amount, correo_contacto='fixture@example.test')
        Pedido.objects.filter(pk=order.pk).update(fecha_creacion=datetime(2025, month, 10, 12, tzinfo=ZoneInfo('America/Santiago')))
out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('../docs/mejoras-informes-configuracion/evidencias')
out.mkdir(parents=True, exist_ok=True)
for year, month in [(2025, None), (2025, 10), (2024, None)]:
    data = consultar_informe(store, year, month, ZoneInfo('America/Santiago'))
    suffix = str(year) + (f'-{month:02d}' if month else '')
    path = out / f'informe-ventas-pedidos-{suffix}.pdf'
    path.write_bytes(generar_pdf(data, timezone.localtime(timezone.now(), ZoneInfo('America/Santiago'))))
    path.with_suffix('.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(path.resolve())
