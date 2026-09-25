from django.db import models


class ConfiguracionLanding(models.Model):
    tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        related_name='configuracion_landing',
    )
    titulo = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    texto_boton = models.CharField(max_length=100)
    imagen_principal = models.TextField(blank=True)
    secciones = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'configuracion_landing'
