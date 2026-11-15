"""Solo los flujos que prueban control del buzón pueden registrar verificación."""
from django.contrib.auth import get_user_model
from django.db import transaction, ProgrammingError, OperationalError
from django.utils import timezone
from apps.core.models import VerificacionCorreoCuenta


def record_verified_email(user_id, email, method):
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().get(pk=user_id)
        if user.is_active and user.email.strip().lower() == email.strip().lower():
            VerificacionCorreoCuenta.objects.update_or_create(usuario=user,
                defaults={'correo': email.strip().lower(), 'fecha': timezone.now(), 'metodo': method})


def record_google_email(user_id, email):
    # Una migración pendiente nunca debe romper el acceso existente del equipo.
    try:
        record_verified_email(user_id, email, 'google_email_verified')
    except (ProgrammingError, OperationalError):
        pass


def invalidate_verified_email(user):
    try:
        with transaction.atomic():
            VerificacionCorreoCuenta.objects.filter(usuario=user).delete()
    except (ProgrammingError, OperationalError):
        pass


def email_is_verified(user):
    return bool(user.is_authenticated and user.email and VerificacionCorreoCuenta.objects.filter(
        usuario=user, correo=user.email.strip().lower()).exists())
