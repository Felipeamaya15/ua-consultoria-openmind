from django.db import models
from apps.core.domain.validators import validate_image_format_and_size

def validate_landing_image(img):
    validate_image_format_and_size(img, max_size_mb=2)

def validate_store_logo(img):
    validate_image_format_and_size(img, max_size_mb=1)

class ConfiguracionLanding(models.Model):
    tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        related_name='configuracion_landing',
    )
    titulo = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    texto_boton = models.CharField(max_length=100)

    imagen_principal = models.ImageField(
        upload_to='landing/images/',
        blank=True,
        null=True,
        validators=[validate_landing_image]
    )

    logo = models.ImageField(
        upload_to='landing/logos/',
        blank=True,
        null=True,
        validators=[validate_store_logo]
    )

    secciones = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'configuracion_landing'