from django.db import models

class ConfiguracionVisual(models.Model):
    class Plantilla(models.TextChoices):
        EDITORIAL = 'editorial', 'Editorial'
        MINIMAL = 'minimal', 'Minimal'
        VISUAL = 'visual', 'Visual'
        CATALOG = 'catalog', 'Catalog'

    tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        related_name='configuracion_visual',
    )
    plantilla_seleccionada = models.CharField(
        max_length=20,
        choices=Plantilla.choices,
        blank=True,
        default='',
    )

    logo_negocio = models.TextField(
        blank=True,
        default='',
    )

    personalizacion = models.JSONField(
        default=dict,
        blank=True,
    )

    class Meta:
        db_table = 'configuracion_visual'