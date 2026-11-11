from django.db import models


class BlueShipment(models.Model):
    """Un intento irreversible por pedido; resultados inciertos exigen conciliación."""
    order = models.OneToOneField('core.Pedido', on_delete=models.PROTECT, related_name='blue_shipment')
    state = models.CharField(max_length=16, default='draft', choices=[('draft','Preparado'),('submitting','Enviando'),('unknown','Revisar en Blue'),('emitted','Emitido')])
    payload = models.JSONField(default=dict)
    configuration_hash = models.CharField(max_length=64)
    tracking_number = models.CharField(max_length=30, blank=True)
    labels = models.JSONField(default=list)
    tracking = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
