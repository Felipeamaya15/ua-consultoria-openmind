import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models

PREFIJO = "enc::"


def _fernet() -> Fernet:
    clave = getattr(settings, "PAYMENT_CREDENTIALS_KEY", "")
    if clave:
        return Fernet(clave.encode())
    derivada = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(derivada)


def cifrar(valor: str) -> str:
    if not valor or valor.startswith(PREFIJO):
        return valor
    return PREFIJO + _fernet().encrypt(valor.encode()).decode()


def descifrar(valor: str) -> str:
    if not valor or not valor.startswith(PREFIJO):
        return valor  
    try:
        return _fernet().decrypt(valor[len(PREFIJO):].encode()).decode()
    except InvalidToken:
        raise ImproperlyConfigured("No se pudo descifrar la credencial: PAYMENT_CREDENTIALS_KEY no coincide.")


class EncryptedTextField(models.TextField):

    def from_db_value(self, value, expression, connection):
        return descifrar(value) if isinstance(value, str) else value

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        return cifrar(value) if isinstance(value, str) else value
