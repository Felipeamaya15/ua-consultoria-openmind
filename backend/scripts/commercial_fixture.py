"""Datos ficticios adicionales para el servidor E2E aislado. No se importa en producción."""
from datetime import datetime
from apps.core.models import Pedido, ItemPedido, ConsentimientoComercial


def seed_commercial(store):
    examples = [
        ('SALE-PAID', 'pagado', '18500.50', ' Cliente@Example.test ', '2500', '1000', '10000.25', 2),
        ('SALE-DELIVERED', 'entregado', '900.25', 'cliente@example.TEST', '100', '0', '1000.25', 1),
        ('SALE-PENDING', 'pendiente', '7000', 'pending@example.test', '0', '0', '7000', 1),
        ('SALE-CANCELLED', 'cancelado', '9000', 'cancelled@example.test', '0', '0', '9000', 1),
    ]
    for index, (identifier, state, total, email, discount, shipping, price, quantity) in enumerate(examples):
        order = Pedido.objects.create(tienda=store, identificador=identifier, estado=state, monto_total=total,
                correo_contacto=email, nombre_contacto='Cliente histórico QA', metodo_pago='Transferencia', medio_pago='Transferencia',
                descuento=discount, costo_envio=shipping, entrega={'metodo': 'Retiro', 'retiro': {'address': 'Dirección ficticia QA', 'seleccion': {'fecha': '2025-10-15', 'hora': '10:07'}}})
        Pedido.objects.filter(pk=order.pk).update(fecha_creacion=datetime.fromisoformat(f'2025-10-{10+index}T15:00:00+00:00'))
        ItemPedido.objects.create(id_pedido=order, nombre_producto='Producto histórico QA', sku=f'HIST-{index}', cantidad=quantity, precio_unitario=price,
                atributos={'Color': 'Azul'}, atributos_variante=[{'nombre': 'Color', 'valor': 'Azul'}])
    # Paginación y deduplicación de numerosos pedidos antiguos de un mismo email.
    for index in range(25):
        order = Pedido.objects.create(tienda=store, identificador=f'OLD-{index:03d}', estado='pendiente', monto_total=1000,
            correo_contacto='historico@example.test', nombre_contacto='Histórico QA')
        Pedido.objects.filter(pk=order.pk).update(fecha_creacion=datetime.fromisoformat('2024-01-10T15:00:00+00:00'))
    ConsentimientoComercial.objects.create(tienda=store, email='cliente@example.test', estado='autorizado',
        version_texto='fixture-qa-v1', referencia_evidencia='autorizacion-ficticia-solo-pruebas',
        fecha_actualizacion=datetime.fromisoformat('2025-10-20T15:00:00+00:00'))
    ConsentimientoComercial.objects.create(tienda=store, email='cancelled@example.test', estado='retirado',
        fecha_actualizacion=datetime.fromisoformat('2025-10-20T15:00:00+00:00'))
    return {'reportYear': 2025, 'reportMonth': 10, 'from': '2025-10-01', 'to': '2025-10-31', 'confirmed': '19400.75'}
