"""Autorización del propietario, distinta del consentimiento de los destinatarios."""
from django.utils import timezone
from apps.core.models import EventoAutorizacionCorreo

VERSION = 'uso-correo-negocio-v1'
TEXT = 'Autorizo el uso de esta cuenta para enviar campañas publicitarias a clientes autorizados y responder consultas de servicios y talleres'


def valid_grant(connection, store):
    return bool(connection and connection.autorizacion_fecha
        and connection.autorizacion_version == VERSION
        and connection.autorizacion_usuario_id == store.id_usuario_propietario_id
        and connection.autorizacion_correo.lower() == connection.correo_autorizado.lower()
        == store.correo_negocio.strip().lower())


def audit(connection, user, kind):
    EventoAutorizacionCorreo.objects.create(tienda_id=connection.tienda_id, usuario=user,
        correo=connection.autorizacion_correo or connection.correo_autorizado,
        tipo=kind, version=VERSION, texto=TEXT)


def invalidate(connection, user, kind):
    if connection.autorizacion_fecha:
        audit(connection, user, kind)
    connection.autorizacion_fecha = None
    connection.autorizacion_usuario = None
    connection.autorizacion_pendiente = {}
    connection.estado_oauth_hash = ''
    connection.estado_oauth_expira = None
    connection.save(update_fields=['autorizacion_fecha', 'autorizacion_usuario',
        'autorizacion_pendiente', 'estado_oauth_hash', 'estado_oauth_expira', 'actualizado_en'])
