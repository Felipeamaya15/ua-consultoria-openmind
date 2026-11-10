from django.db import models
from django.conf import settings
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


class ImagenCarruselLanding(models.Model):
    """
    Imágenes configurables de la portada de una tienda.
    Su comportamiento visual se define en el editor de plantillas.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    configuracion = models.ForeignKey(
        ConfiguracionLanding,
        on_delete=models.CASCADE,
        related_name='imagenes_carrusel',
    )

    archivo = models.ImageField(
        upload_to='landing/carrusel/',
        validators=[validate_landing_image],
    )

    orden = models.PositiveIntegerField(default=0)

    texto_alternativo = models.CharField(
        max_length=250,
        blank=True,
        default='',
    )

    class Meta:
        db_table = 'landing_imagen_carrusel'
        ordering = ['orden', 'id']


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


class SolicitudActividad(models.Model):
    """Operational participation/contact data; never a marketing authorization or payment."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tienda = models.ForeignKey('core.Tienda', on_delete=models.CASCADE)
    seccion_id = models.UUIDField()
    titulo_actividad = models.CharField(max_length=255)
    tipo_actividad = models.CharField(max_length=10, choices=[('servicio', 'Servicio'), ('taller', 'Taller')])
    tipo = models.CharField(max_length=12, choices=[('consulta', 'Consulta'), ('inscripcion', 'Inscripción')])
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100, blank=True, default='')
    email = models.EmailField(max_length=254)
    telefono = models.CharField(max_length=40, blank=True, default='')
    mensaje = models.TextField(blank=True, default='')
    estado = models.CharField(max_length=12)
    archivada = models.BooleanField(default=False)
    archivada_en = models.DateTimeField(null=True, blank=True)
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)
    consentimiento_version = models.CharField(max_length=40)
    consentimiento_fecha = models.DateTimeField()
    solicitud_id = models.UUIDField()
    huella = models.CharField(max_length=64)

    class Meta:
        ordering = ['-creado', '-id']
        constraints = [
            models.UniqueConstraint(fields=['tienda', 'solicitud_id'], name='actividad_solicitud_id_unico'),
            models.UniqueConstraint(fields=['tienda', 'huella'], name='actividad_solicitud_huella_unica'),
            models.UniqueConstraint(fields=['tienda', 'seccion_id', 'email'], condition=models.Q(tipo='inscripcion'), name='actividad_inscripcion_unica'),
            models.CheckConstraint(condition=(models.Q(tipo='consulta', estado__in=['nueva', 'en_revision', 'respondida', 'cerrada']) | models.Q(tipo='inscripcion', estado__in=['pendiente', 'confirmada', 'cancelada'])), name='actividad_estado_tipo_valido'),
        ]
        indexes = [models.Index(fields=['tienda', 'tipo', 'seccion_id', 'estado'], name='actividad_gestion_tienda')]


class RespuestaActividad(models.Model):
    ESTADOS = [(value, value) for value in ('borrador', 'enviando', 'aceptada', 'fallida', 'indeterminada')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitud = models.ForeignKey(SolicitudActividad, on_delete=models.PROTECT, related_name='respuestas')
    autor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    clave = models.UUIDField()
    destinatario = models.EmailField()
    asunto = models.CharField(max_length=200)
    cuerpo = models.TextField()
    estado = models.CharField(max_length=15, choices=ESTADOS, default='borrador')
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creado', '-id']
        constraints = [models.UniqueConstraint(fields=['solicitud', 'clave'], name='respuesta_actividad_clave_unica')]


class IntentoRespuestaActividad(models.Model):
    respuesta = models.ForeignKey(RespuestaActividad, on_delete=models.PROTECT, related_name='intentos')
    numero = models.PositiveSmallIntegerField()
    estado = models.CharField(max_length=15, default='enviando')
    codigo = models.CharField(max_length=60, blank=True, default='')
    creado = models.DateTimeField(auto_now_add=True)
    finalizado = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['numero']
        constraints = [models.UniqueConstraint(fields=['respuesta', 'numero'], name='intento_respuesta_numero_unico')]


class CampanaPromocional(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tienda = models.ForeignKey('core.Tienda', on_delete=models.PROTECT)
    autor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    clave = models.UUIDField()
    nombre = models.CharField(max_length=150)
    asunto = models.CharField(max_length=200)
    cuerpo = models.TextField()
    producto = models.JSONField(default=dict)
    revision = models.PositiveIntegerField(default=1)
    estado = models.CharField(max_length=15, default='borrador', choices=[('borrador', 'Borrador')])
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-actualizado', '-id']
        constraints = [models.UniqueConstraint(fields=['tienda', 'clave'], name='campana_tienda_clave_unica')]


class DestinatarioCampana(models.Model):
    campana = models.ForeignKey(CampanaPromocional, on_delete=models.CASCADE, related_name='destinatarios')
    consentimiento = models.ForeignKey('core.ConsentimientoComercial', on_delete=models.PROTECT)
    revision_consentimiento = models.PositiveIntegerField()
    email = models.EmailField(max_length=320)
    estado = models.CharField(max_length=15, default='seleccionado', choices=[('seleccionado', 'Seleccionado'), ('excluido', 'Excluido')])
    intentos = models.PositiveIntegerField(default=0)
    ultimo_error = models.CharField(max_length=60, blank=True, default='')

    class Meta:
        ordering = ['email']
        constraints = [models.UniqueConstraint(fields=['campana', 'email'], name='campana_email_unico')]
