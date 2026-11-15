"""Conexión OAuth de Gmail administrada por el propietario de la tienda."""

import hashlib
import logging
import secrets
from datetime import timedelta

import requests
from django.db import transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.urls import reverse
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.infrastructure.gmail_token_crypto import (
    cifrar_token,
    descifrar_token,
)
from apps.core.infrastructure.google_gmail import (
    construir_url_autorizacion,
    intercambiar_codigo,
)
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import ConexionGmailTienda, Tienda
from apps.core import mail_authorization as authorization
from apps.core.presentation.responses import success_response
from apps.core.infrastructure.store_mail import connection_state, send_store_mail
from apps.authentication.presentation.profile import StrictSerializer
from rest_framework import serializers
from apps.landing.activity_views import NoStoreActivityView

logger = logging.getLogger(__name__)


def _hash_estado(valor):
    return hashlib.sha256(valor.encode("utf-8")).hexdigest()


def _resultado(ok):
    destino = reverse("gmail-google-resultado")
    return HttpResponseRedirect(f"{destino}?ok={int(ok)}")


class GmailGoogleEstadoView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        return success_response(data=connection_state(tienda))


class GmailGoogleIniciarView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        values = MailAuthorizationInput(data=request.data)
        values.is_valid(raise_exception=True)
        if request.data.get('autorizar') is not True:
            return Response({'detail': 'Debes autorizar expresamente el uso de la cuenta.'}, status=400)
        estado = secrets.token_urlsafe(32)

        try:
            from apps.core.infrastructure.gmail_token_crypto import _obtener_cifrador
            _obtener_cifrador()
            url = construir_url_autorizacion(estado)
        except (ValueError, RuntimeError):
            return Response(
                {"detail": "Google OAuth no está configurado."},
                status=503,
            )

        with transaction.atomic():
            tienda = Tienda.objects.select_for_update().get(pk=tienda.pk)
            email = values.validated_data['correo_negocio'].strip().lower()
            if not tienda.correo_negocio or email != tienda.correo_negocio.strip().lower():
                return Response({'detail': 'Guarda primero el correo del negocio que deseas conectar.'}, status=409)
            conexion, _ = ConexionGmailTienda.objects.select_for_update().get_or_create(
                tienda=tienda
            )
            conexion.estado_oauth_hash = _hash_estado(estado)
            conexion.estado_oauth_expira = timezone.now() + timedelta(minutes=10)
            conexion.autorizacion_pendiente = {'correo': email, 'usuario': request.user.pk,
                'version': authorization.VERSION, 'fecha': timezone.now().isoformat()}
            conexion.save(update_fields=[
                'autorizacion_pendiente',
                "estado_oauth_hash",
                "estado_oauth_expira",
                "actualizado_en",
            ])

        respuesta = success_response(data={"url_autorizacion": url})
        respuesta["Cache-Control"] = "no-store"
        return respuesta


class MailAuthorizationInput(StrictSerializer):
    autorizar = serializers.BooleanField()
    correo_negocio = serializers.EmailField(max_length=254)
    version_texto = serializers.ChoiceField(choices=[authorization.VERSION])


class GmailGoogleCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        estado = request.query_params.get("state", "")
        codigo = request.query_params.get("code", "")

        if not isinstance(estado, str) or not (40 <= len(estado) <= 100):
            return _resultado(False)

        hash_recibido = _hash_estado(estado)

        with transaction.atomic():
            conexion = (
                ConexionGmailTienda.objects.select_for_update()
                .filter(estado_oauth_hash=hash_recibido)
                .first()
            )

            if (
                conexion is None
                or conexion.estado_oauth_expira is None
                or conexion.estado_oauth_expira <= timezone.now()
            ):
                return _resultado(False)

            # Consumir el estado una sola vez, antes de contactar a Google.
            conexion.estado_oauth_expira = None
            conexion.save(update_fields=[
                "estado_oauth_expira",
                "actualizado_en",
            ])
            conexion_id = conexion.pk

        if not codigo or request.query_params.get("error"):
            return _resultado(False)

        try:
            datos = intercambiar_codigo(codigo)
            token_protegido = cifrar_token(datos["refresh_token"])

            with transaction.atomic():
                tienda_id = ConexionGmailTienda.objects.values_list('tienda_id', flat=True).get(pk=conexion_id)
                tienda = Tienda.objects.select_for_update().get(pk=tienda_id)
                conexion = (
                    ConexionGmailTienda.objects.select_for_update()
                    .get(pk=conexion_id)
                )

                # Impedir reconectar si se canceló o inició otro flujo.
                if (
                    conexion.estado_oauth_hash != hash_recibido
                    or conexion.estado_oauth_expira is not None
                ):
                    return _resultado(False)

                pending = conexion.autorizacion_pendiente
                email = datos['correo'].strip().lower()
                if (not pending or pending.get('correo') != email
                        or email != tienda.correo_negocio.strip().lower()
                        or pending.get('usuario') != tienda.id_usuario_propietario_id
                        or pending.get('version') != authorization.VERSION):
                    conexion.autorizacion_pendiente = {}
                    conexion.estado_oauth_hash = ''
                    conexion.save(update_fields=['autorizacion_pendiente', 'estado_oauth_hash', 'actualizado_en'])
                    return _resultado(False)

                conexion.correo_autorizado = email
                conexion.refresh_token_cifrado = token_protegido
                conexion.autorizacion_correo = email
                conexion.autorizacion_fecha = timezone.now()
                conexion.autorizacion_usuario_id = pending['usuario']
                conexion.autorizacion_version = authorization.VERSION
                conexion.autorizacion_pendiente = {}
                conexion.estado_oauth_hash = ""
                conexion.estado_oauth_expira = None
                conexion.save(update_fields=[
                    'autorizacion_correo', 'autorizacion_fecha', 'autorizacion_usuario',
                    'autorizacion_version', 'autorizacion_pendiente',
                    "correo_autorizado",
                    "refresh_token_cifrado",
                    "estado_oauth_hash",
                    "estado_oauth_expira",
                    "actualizado_en",
                ])
                authorization.audit(conexion, tienda.id_usuario_propietario, 'autorizada')

        except Exception:
            logger.warning("No fue posible completar la autorización Gmail")
            return _resultado(False)

        return _resultado(True)


class GmailGoogleDesconectarView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        token_cifrado = ""

        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=tienda.pk)
            conexion = (
                ConexionGmailTienda.objects.select_for_update()
                .filter(tienda=tienda)
                .first()
            )

            if conexion:
                token_cifrado = conexion.refresh_token_cifrado
                authorization.invalidate(conexion, request.user, 'desconectada')
                conexion.correo_autorizado = ""
                conexion.refresh_token_cifrado = ""
                conexion.estado_oauth_hash = ""
                conexion.estado_oauth_expira = None
                conexion.save(update_fields=[
                    "correo_autorizado",
                    "refresh_token_cifrado",
                    "estado_oauth_hash",
                    "estado_oauth_expira",
                    "actualizado_en",
                ])

        revocado = False
        if token_cifrado:
            try:
                token = descifrar_token(token_cifrado)
                respuesta = requests.post(
                    "https://oauth2.googleapis.com/revoke",
                    data={"token": token},
                    timeout=8,
                )
                revocado = respuesta.status_code == 200
            except Exception:
                logger.warning("No se pudo confirmar revocación en Google")

        return success_response(data={
            "conectado": False,
            "revocacion_google_confirmada": revocado,
        })


class MailTestInput(StrictSerializer):
    clave = serializers.UUIDField()


class GmailGooglePruebaView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        values = MailTestInput(data=request.data)
        values.is_valid(raise_exception=True)
        state = connection_state(tienda)
        # El cliente no elige destinatarios arbitrarios para pruebas.
        recipient = state['correo'] or request.user.email
        try:
            result = send_store_mail(tienda, values.validated_data['clave'], recipient,
                'Prueba de correo de ' + tienda.nombre[:160],
                'Esta es una prueba controlada de la conexión de correo de tu tienda.', category='prueba')
        except ValueError:
            return Response({'detail': 'Conecta y habilita el correo antes de probar el envío.'}, status=409)
        return success_response(data={'estado': result.estado, 'codigo': result.codigo},
            mensaje='Prueba aceptada por el proveedor.' if result.estado == 'aceptada' else 'No se confirmó el envío. Revisa la conexión.')


def gmail_google_resultado(request):
    ok = request.GET.get("ok") == "1"
    titulo = "Correo conectado" if ok else "No se pudo conectar el correo"
    mensaje = (
        "Google autorizó el correo. Vuelve a OpenMind para continuar."
        if ok else
        "La autorización no se completó. Vuelve a OpenMind e inténtalo nuevamente."
    )

    respuesta = HttpResponse(
        f"<!doctype html><html lang='es'><head>"
        f"<meta charset='utf-8'><title>{titulo}</title>"
        f"</head><body><h1>{titulo}</h1><p>{mensaje}</p>"
        f"</body></html>",
        content_type="text/html; charset=utf-8",
    )
    respuesta["Cache-Control"] = "no-store"
    respuesta["Referrer-Policy"] = "no-referrer"
    respuesta["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return respuesta
