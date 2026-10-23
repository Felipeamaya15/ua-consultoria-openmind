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

CODIGOS = ('enviado', 'destinatario_invalido', 'contenido_invalido', 'error_de_envio')
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
    if '..' in limpio or usuario.startswith('.') or usuario.endswith('.'):
        return None
    etiquetas = dominio.split('.')
    if not all(0 < len(e) <= 63 and not e.startswith('-') and not e.endswith('-') for e in etiquetas):
        return None
    return limpio


def _una_linea(texto, maximo):
    """Deja el texto en una sola línea (sin saltos que permitan inyectar cabeceras) y con largo acotado."""
    return ' '.join(str(texto).split())[:maximo].strip()


def _remitente(nombre_remitente):
    nombre_configurado, direccion = parseaddr(settings.DEFAULT_FROM_EMAIL)
    nombre = re.sub(r'[<>"\\]', '', _una_linea(nombre_remitente or '', _MAX_NOMBRE)) or nombre_configurado
    return formataddr((nombre, direccion)) if nombre else direccion


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
    oculto = (
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>'
        if preheader.strip() else ''
    )
    return (
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head>'
        '<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">'
        f'{oculto}<div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;'
        f'font-size:15px;line-height:1.6;">{contenido}</div></body></html>'
    )


def enviar_correo(destinatario, asunto, cuerpo, *, preheader='', nombre_remitente='', referencia=''):
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

    try:
        mensaje = EmailMultiAlternatives(
            subject=asunto,
            body=cuerpo,
            from_email=_remitente(nombre_remitente),
            to=[correo],
            connection=get_connection(timeout=settings.EMAIL_TIMEOUT),
            headers={'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'OOF, AutoReply'},
        )
        mensaje.attach_alternative(_html(cuerpo, preheader), 'text/html')
        entregados = mensaje.send(fail_silently=False)
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
    return ResultadoEnvio(True, 'enviado')
