import uuid
from django.conf import settings
from django.db import models


class ConexionInstagram(models.Model):
    tienda = models.OneToOneField('core.Tienda', on_delete=models.CASCADE)
    usuario_instagram = models.CharField(max_length=40, blank=True)
    nombre_usuario = models.CharField(max_length=100, blank=True)
    token_cifrado = models.TextField(blank=True)
    client_business_id = models.CharField(max_length=40, blank=True)
    system_user_id = models.CharField(max_length=40, blank=True)
    config_id = models.CharField(max_length=40, blank=True)
    token_tipo = models.CharField(max_length=24, default='SYSTEM_USER')
    emitido_en = models.DateTimeField(null=True)
    vence_en = models.DateTimeField(null=True)
    permisos = models.JSONField(default=list)
    estado = models.CharField(max_length=20, default='desconectada')
    generacion = models.PositiveIntegerField(default=0)
    autorizado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    actualizado_en = models.DateTimeField(auto_now=True)


class EstadoInstagramOAuth(models.Model):
    conexion = models.OneToOneField(ConexionInstagram, on_delete=models.CASCADE)
    estado_hash = models.CharField(max_length=64, unique=True)
    navegador_hash = models.CharField(max_length=64)
    inicio_hash = models.CharField(max_length=64, unique=True)
    estado_cifrado = models.TextField()
    iniciado_en = models.DateTimeField(null=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    generacion = models.PositiveIntegerField()
    vence_en = models.DateTimeField()
    consumido_en = models.DateTimeField(null=True)


class PublicacionInstagram(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tienda = models.ForeignKey('core.Tienda', on_delete=models.PROTECT)
    autor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    clave = models.UUIDField()
    usuario_instagram = models.CharField(max_length=40)
    generacion = models.PositiveIntegerField()
    huella = models.CharField(max_length=64)
    imagen = models.ImageField(upload_to='instagram/publicaciones/', max_length=240)
    imagen_sha256 = models.CharField(max_length=64)
    imagen_vence_en = models.DateTimeField()
    descripcion = models.TextField(blank=True)
    estado = models.CharField(max_length=24, default='preparada')
    contenedor_id = models.CharField(max_length=40, blank=True)
    media_id = models.CharField(max_length=40, blank=True)
    codigo = models.CharField(max_length=80, blank=True)
    confirmada_en = models.DateTimeField(null=True)
    publicacion_iniciada_en = models.DateTimeField(null=True)
    creada_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creada_en']
        constraints = [
            models.UniqueConstraint(fields=['tienda', 'clave'], name='ig_clave_tienda_unica'),
            models.UniqueConstraint(fields=['tienda', 'usuario_instagram', 'huella'], name='ig_contenido_unico'),
        ]
