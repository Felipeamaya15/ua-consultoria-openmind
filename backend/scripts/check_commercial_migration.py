"""Comprueba 0023 → 0024 con datos existentes en una BD nueva test_* y luego la elimina."""
import os
import sys
from pathlib import Path
from uuid import uuid4
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.db import connection, connections
from django.core.management import call_command
from django.contrib.auth import get_user_model
from apps.core.models import Tienda, Pedido, ItemPedido, ConsentimientoComercial

original = connection.settings_dict['NAME']
name = 'test_commercial_migration_' + uuid4().hex
created = False
try:
    with connection._nodb_cursor() as cursor:
        cursor.execute('CREATE DATABASE ' + connection.ops.quote_name(name))
    created = True
    connection.close(); connection.settings_dict['NAME'] = name
    call_command('migrate', 'auth', verbosity=0, interactive=False)
    call_command('migrate', 'core', '0023', verbosity=0, interactive=False)
    owner = get_user_model().objects.create_user(username='migration-qa')
    store = Tienda.objects.create(nombre='Migración QA temporal', id_usuario_propietario=owner)
    order = Pedido.objects.create(tienda=store, estado='pagado', correo_contacto='qa@example.test', monto_total='1234.50', descuento='100.00')
    ItemPedido.objects.create(id_pedido=order, nombre_producto='Producto antes de migración', cantidad=1, precio_unitario='1334.50')
    before = {'orders': list(Pedido.objects.values()), 'items': list(ItemPedido.objects.values()), 'stores': list(Tienda.objects.values())}
    call_command('migrate', 'core', '0024', verbosity=0, interactive=False)
    after = {'orders': list(Pedido.objects.values()), 'items': list(ItemPedido.objects.values()), 'stores': list(Tienda.objects.values())}
    assert before == after, 'La migración alteró registros existentes'
    assert ConsentimientoComercial.objects.count() == 0, 'No debe inferir consentimiento'
    print('PASS 0023 → 0024: registros existentes idénticos; cero autorizaciones por defecto; migración solo aditiva.')
finally:
    connections.close_all(); connection.settings_dict['NAME'] = original
    if created and name.startswith('test_commercial_migration_'):
        with connection._nodb_cursor() as cursor:
            cursor.execute('DROP DATABASE ' + connection.ops.quote_name(name))
        print('PASS base temporal eliminada; base de desarrollo sin migrar.')
