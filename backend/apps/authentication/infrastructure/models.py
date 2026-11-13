from django.db import models
from django.contrib.auth import get_user_model

from apps.core.models import Tienda

# Obtenemos el modelo de usuario activo en Django
UserModel = get_user_model()


class UserProfile(models.Model):
    """Extensión de datos adicionales del usuario para el negocio."""

    user = models.OneToOneField(
        UserModel,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        verbose_name="Teléfono",
    )
    postal_code = models.CharField(
        max_length=12,
        blank=True,
        default="",
        verbose_name="Código Postal",
    )
    rut = models.CharField(
        max_length=12,
        blank=True,
        null=True,
        unique=True,
        verbose_name="RUT",
    )

    def __str__(self):
        return f"Perfil de {self.user.username}"


class UserMFA(models.Model):
    """
    Configuración de Autenticación Multifactor (MFA) basada en TOTP (RFC 6238)
    compatible con Google Authenticator y Authy.
    """

    user = models.OneToOneField(
        UserModel,
        on_delete=models.CASCADE,
        related_name="mfa",
    )
    secret = models.CharField(
        max_length=64,
        verbose_name="Secreto TOTP Base32",
    )
    is_enabled = models.BooleanField(
        default=False,
        verbose_name="MFA Activo",
    )
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_mfa"

    def __str__(self):
        estado = "activo" if self.is_enabled else "inactivo"
        return f"MFA de {self.user.username} ({estado})"


class ConfiguracionAutenticacion(models.Model):
    """
    Configuración de las modalidades de autenticación
    disponibles para los compradores de una tienda.
    """

    REQUIRES_AUTH_CHOICES = [
        ("none", "No solicitar cuenta"),
        ("optional", "Cuenta opcional"),
        ("required", "Cuenta obligatoria antes de pagar"),
    ]

    tienda = models.OneToOneField(
        Tienda,
        on_delete=models.CASCADE,
        related_name="configuracion_autenticacion",
    )

    email_password = models.BooleanField(default=True)
    google = models.BooleanField(default=False)
    google_client_id = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )
    guest_checkout = models.BooleanField(default=True)

    requires_auth = models.CharField(
        max_length=20,
        choices=REQUIRES_AUTH_CHOICES,
        default="optional",
    )

    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "configuracion_autenticacion"

    def __str__(self):
        return f"Configuración de autenticación - {self.tienda.nombre}"


class ConfiguracionPagos(models.Model):
    """
    Configuracion de metodos de pago y credenciales por tienda.
    Guarda los datos necesarios para que el backend pueda integrar
    pasarelas o pago por transferencia sin depender del storefront.
    """

    tienda = models.OneToOneField(
        Tienda,
        on_delete=models.CASCADE,
        related_name="configuracion_pagos",
    )
    metodos = models.JSONField(default=dict)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "configuracion_pagos"

    def __str__(self):
        return f"Configuracion de pagos - {self.tienda.nombre}"
