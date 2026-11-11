from django.core.management.base import BaseCommand
from apps.shipping.models import BlueShipment
from apps.shipping.application.blue_dispatch import refresh


class Command(BaseCommand):
    help = 'Actualiza el seguimiento de hasta 100 despachos Blue emitidos; no emite ni reintenta órdenes.'

    def handle(self, *args, **options):
        for shipment in BlueShipment.objects.filter(state='emitted').exclude(order__estado__in=['entregado','cancelado']).order_by('updated_at')[:100]:
            try:
                refresh(shipment=shipment)
            except Exception:
                self.stderr.write(f'Pedido {shipment.order_id}: seguimiento no actualizado.')
            else:
                self.stdout.write(f'Pedido {shipment.order_id}: seguimiento actualizado.')
