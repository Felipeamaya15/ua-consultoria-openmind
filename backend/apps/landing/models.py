from django.db import models
import uuid
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
    contenido = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'configuracion_landing'


class ArchivoMultimedia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tienda = models.ForeignKey('core.Tienda', on_delete=models.CASCADE)
    archivo = models.FileField(max_length=240)
    sha256 = models.CharField(max_length=64)
    mime = models.CharField(max_length=40)
    tamano = models.PositiveIntegerField()
    ancho = models.PositiveIntegerField()
    alto = models.PositiveIntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tienda', 'sha256'], name='media_archivo_tienda_hash')]


class RecursoMultimedia(models.Model):
    TIPOS = [(name, name) for name in ('imagen', 'youtube', 'instagram', 'facebook', 'enlace')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tienda = models.ForeignKey('core.Tienda', on_delete=models.CASCADE)
    titulo = models.CharField(max_length=180)
    descripcion = models.TextField(blank=True, default='')
    tipo = models.CharField(max_length=12, choices=TIPOS)
    url = models.URLField(max_length=2000, blank=True, default='')
    archivo = models.ForeignKey(ArchivoMultimedia, on_delete=models.RESTRICT, null=True, blank=True)
    activo = models.BooleanField(default=True)
    eliminado = models.BooleanField(default=False)
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creado', '-id']
        indexes = [models.Index(fields=['tienda', 'eliminado', '-creado'], name='media_tienda_vigentes')]
