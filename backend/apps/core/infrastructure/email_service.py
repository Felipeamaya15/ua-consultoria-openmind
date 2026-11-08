"""Servicio de envío de correos (SCRUM-423).

Punto único para enviar correos transaccionales de la tienda. Valida los datos, arma el mensaje
(texto y HTML), lo envía con la configuración de correo de Django (ver settings: EMAIL_*) y
devuelve un `ResultadoEnvio`. Nunca lanza una excepción al llamador: un correo que falla no debe
romper la operación que lo originó (por ejemplo, marcar un pedido como despachado).

Uso desde otro módulo (por ejemplo, el correo de recepción o el de pago):

    from apps.core.infrastructure.email_service import enviar_correo
    resultado = enviar_correo('cliente@ejemplo.cl', 'Asunto', 'Texto del correo', preheader='Resumen')
    if not resultado.enviado:
        ...  # resultado.codigo dice por qué (ver CODIGOS)

Los registros (log) no llevan el correo completo del destinatario, solo una versión enmascarada.
"""
import logging
import re
from dataclasses import dataclass
from email.utils import formataddr, parseaddr
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection

logger = logging.getLogger(__name__)

CODIGOS = ('enviado', 'enviado_local', 'destinatario_invalido', 'contenido_invalido', 'error_de_envio')
_CORREO = re.compile(r'^[^@\s<>,;:"\'()\[\]\\]+@[^@\s<>,;:"\'()\[\]\\]+\.[^@\s<>,;:"\'()\[\]\\.]{2,}$')
_ENLACE = re.compile(r'https?://[^\s<]+')
_MAX_DESTINATARIO = 254
_MAX_ASUNTO = 200
_MAX_NOMBRE = 60


@dataclass(frozen=True)
class ResultadoEnvio:
    enviado: bool
    codigo: str = 'enviado'
    detalle: str = ''


def correo_enmascarado(correo):
    """'maria@gmail.com' -> 'm***@gmail.com'. Para los registros: nunca se escribe el correo completo."""
    if not isinstance(correo, str) or '@' not in correo:
        return '***'
    usuario, _, dominio = correo.strip().partition('@')
    return f'{usuario[:1]}***@{dominio}'


def _destinatario_valido(destinatario):
    if not isinstance(destinatario, str):
        return None
    limpio = destinatario.strip()
    if not limpio or len(limpio) > _MAX_DESTINATARIO or not _CORREO.match(limpio):
        return None
    usuario, _, dominio = limpio.partition('@')
    dominio = dominio.lower()
    limpio = f"{usuario}@{dominio}"
    if '..' in limpio or usuario.startswith('.') or usuario.endswith('.'):
        return None
    etiquetas = dominio.split('.')
    if not all(0 < len(e) <= 63 and not e.startswith('-') and not e.endswith('-') for e in etiquetas):
        return None
    return limpio


def correo_valido(correo):
    """El correo limpio si es una dirección válida; None si no lo es."""
    return _destinatario_valido(correo)


def _una_linea(texto, maximo):
    """Deja el texto en una sola línea (sin saltos que permitan inyectar cabeceras) y con largo acotado."""
    return ' '.join(str(texto).split())[:maximo].strip()


def _remitente(nombre_remitente):
    nombre_configurado, direccion = parseaddr(getattr(settings, 'DEFAULT_FROM_EMAIL', '') or '')
    host_user = (getattr(settings, 'EMAIL_HOST_USER', '') or '').strip()
    if (not direccion or direccion.endswith('.local') or '@' not in direccion) and host_user and '@' in host_user:
        direccion = host_user
    nombre = re.sub(r'[<>"\\]', '', _una_linea(nombre_remitente or '', _MAX_NOMBRE)) or nombre_configurado or 'Tienda'
    return formataddr((nombre, direccion)) if nombre and direccion else (direccion or host_user or 'no-reply@tienda.local')


def _con_enlaces(texto_escapado):
    """Convierte las direcciones http(s) del texto ya escapado en enlaces, sin tragarse la puntuación final."""
    def enlazar(coincidencia):
        url = coincidencia.group(0)
        resto = ''
        while url and url[-1] in '.,;:!?)':
            resto = url[-1] + resto
            url = url[:-1]
        return f'<a href="{url}" style="color:#2563eb;">{url}</a>{resto}'

    return _ENLACE.sub(enlazar, texto_escapado)


def _html(cuerpo, preheader):
    parrafos = [p for p in cuerpo.replace('\r\n', '\n').split('\n\n') if p.strip()]
    contenido = ''.join(
        '<p style="margin:0 0 16px;">' + _con_enlaces(escape(p.strip('\n'))).replace('\n', '<br>') + '</p>'
        for p in parrafos
    )
    preheader_escapado = escape(preheader.strip()) if preheader else ''
    oculto = (
        f'<div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;font-family:sans-serif;">{preheader_escapado}</div>'
        if preheader_escapado else ''
    )
    return (
        '<!DOCTYPE html>'
        '<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
        '<head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
        '<!--[if mso]>'
        '<noscript>'
        '<xml>'
        '<o:OfficeDocumentSettings>'
        '<o:PixelsPerInch>96</o:PixelsPerInch>'
        '</o:OfficeDocumentSettings>'
        '</xml>'
        '</noscript>'
        '<![endif]-->'
        '<style>body { margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }</style>'
        '</head>'
        '<body style="margin:0;padding:24px 12px;background-color:#f4f4f5;color:#18181b;">'
        f'{oculto}'
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f5;">'
        '<tr>'
        '<td align="center" style="padding:16px 8px;">'
        '<!--[if (gte mso 9)|(IE)]>'
        '<table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="560">'
        '<tr><td>'
        '<![endif]-->'
        '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;border:1px solid #e4e4e7;box-shadow:0 1px 3px rgba(0,0,0,0.05);">'
        '<tr>'
        '<td style="padding:32px 28px;font-size:15px;line-height:1.6;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
        f'{contenido}'
        '</td>'
        '</tr>'
        '</table>'
        '<!--[if (gte mso 9)|(IE)]>'
        '</td></tr></table>'
        '<![endif]-->'
        '</td>'
        '</tr>'
        '</table>'
        '</body></html>'
    )


def es_entorno_local():
    """Retorna True si la configuración activa apunta al buzón de pruebas local (Mailpit/localhost)."""
    backend = getattr(settings, 'EMAIL_BACKEND', '')
    if backend.endswith('locmem.EmailBackend'):
        return False
    host = getattr(settings, 'EMAIL_HOST', '')
    port = getattr(settings, 'EMAIL_PORT', 0)
    user = getattr(settings, 'EMAIL_HOST_USER', '')
    return (host in ('mailpit', 'localhost', '127.0.0.1') and port == 1025 and not user)


def enviar_correo(destinatario, asunto, cuerpo, *, preheader='', nombre_remitente='', referencia='', reply_to=''):
    """Envía un correo de texto con su versión HTML. Nunca lanza: el resultado indica qué pasó.

    `nombre_remitente` es el nombre que ve el comprador (normalmente el de la tienda); la dirección
    de salida siempre es DEFAULT_FROM_EMAIL. `referencia` es un texto para el log (por ejemplo,
    "order_shipped ORD-20261008-ABCD"); no debe contener datos personales.
    """
    correo = _destinatario_valido(destinatario)
    if correo is None:
        logger.warning('Correo no enviado (%s): destinatario inválido.', referencia or 'sin referencia')
        return ResultadoEnvio(False, 'destinatario_invalido', 'El destinatario no es un correo válido.')
    asunto = _una_linea(asunto or '', _MAX_ASUNTO)
    cuerpo = (cuerpo or '').strip() if isinstance(cuerpo, str) else ''
    if not asunto or not cuerpo:
        logger.warning('Correo no enviado (%s): falta el asunto o el cuerpo.', referencia or 'sin referencia')
        return ResultadoEnvio(False, 'contenido_invalido', 'El correo necesita asunto y cuerpo.')
    preheader = _una_linea(preheader or '', _MAX_ASUNTO)

    headers = {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
    }
    reply_to_list = []
    if reply_to:
        rt_valid = _destinatario_valido(reply_to)
        if rt_valid:
            reply_to_list.append(rt_valid)

    try:
        conn = get_connection(timeout=settings.EMAIL_TIMEOUT)
        mensaje = EmailMultiAlternatives(
            subject=asunto,
            body=cuerpo,
            from_email=_remitente(nombre_remitente),
            to=[correo],
            reply_to=reply_to_list or None,
            connection=conn,
            headers=headers,
        )
        mensaje.attach_alternative(_html(cuerpo, preheader), 'text/html')
        try:
            entregados = mensaje.send(fail_silently=False)
        except Exception as err:
            # Fallback si el host 'mailpit' no resuelve por DNS (ej: script o test fuera del contenedor docker)
            if getattr(settings, 'EMAIL_HOST', '') == 'mailpit':
                fallback_conn = get_connection(
                    backend='django.core.mail.backends.smtp.EmailBackend',
                    host='127.0.0.1',
                    port=getattr(settings, 'EMAIL_PORT', 1025),
                    use_tls=False,
                    use_ssl=False,
                    timeout=settings.EMAIL_TIMEOUT,
                )
                mensaje.connection = fallback_conn
                entregados = mensaje.send(fail_silently=False)
            else:
                raise err
    except Exception as error:  # SMTP caído, credenciales malas, tiempo agotado, etc.
        motivo = str(error).replace(correo, correo_enmascarado(correo))
        logger.warning('No se pudo enviar el correo (%s) a %s: %s: %s', referencia or 'sin referencia',
                       correo_enmascarado(correo), type(error).__name__, motivo[:200])
        return ResultadoEnvio(False, 'error_de_envio', type(error).__name__)

    if not entregados:
        logger.warning('El servicio de correo no aceptó el mensaje (%s) para %s.', referencia or 'sin referencia',
                       correo_enmascarado(correo))
        return ResultadoEnvio(False, 'error_de_envio', 'El servicio de correo no aceptó el mensaje.')
    logger.info('Correo enviado (%s) a %s.', referencia or 'sin referencia', correo_enmascarado(correo))

    if es_entorno_local():
        return ResultadoEnvio(True, 'enviado_local', 'Buzón de pruebas Mailpit (http://localhost:8025)')
    return ResultadoEnvio(True, 'enviado')
