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
from apps.core.models import ConexionGmailTienda
from apps.core.presentation.responses import success_response

logger = logging.getLogger(__name__)


def _hash_estado(valor):
    return hashlib.sha256(valor.encode("utf-8")).hexdigest()


def _resultado(ok):
    destino = reverse("gmail-google-resultado")
    return HttpResponseRedirect(f"{destino}?ok={int(ok)}")


class GmailGoogleEstadoView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        conexion = ConexionGmailTienda.objects.filter(tienda=tienda).first()
        conectado = bool(
            conexion
            and conexion.correo_autorizado
            and conexion.refresh_token_cifrado
        )
        return success_response(data={
            "conectado": conectado,
            "correo": conexion.correo_autorizado if conectado else "",
        })


class GmailGoogleIniciarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        estado = secrets.token_urlsafe(32)

        try:
            url = construir_url_autorizacion(estado)
        except ValueError:
            return Response(
                {"detail": "Google OAuth no está configurado."},
                status=503,
            )

        with transaction.atomic():
            conexion, _ = ConexionGmailTienda.objects.select_for_update().get_or_create(
                tienda=tienda
            )
            conexion.estado_oauth_hash = _hash_estado(estado)
            conexion.estado_oauth_expira = timezone.now() + timedelta(minutes=10)
            conexion.save(update_fields=[
                "estado_oauth_hash",
                "estado_oauth_expira",
                "actualizado_en",
            ])

        respuesta = success_response(data={"url_autorizacion": url})
        respuesta["Cache-Control"] = "no-store"
        return respuesta


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

                conexion.correo_autorizado = datos["correo"]
                conexion.refresh_token_cifrado = token_protegido
                conexion.estado_oauth_hash = ""
                conexion.estado_oauth_expira = None
                conexion.save(update_fields=[
                    "correo_autorizado",
                    "refresh_token_cifrado",
                    "estado_oauth_hash",
                    "estado_oauth_expira",
                    "actualizado_en",
                ])

        except Exception:
            logger.exception("No fue posible completar la autorización Gmail")
            return _resultado(False)

        return _resultado(True)


class GmailGoogleDesconectarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        token_cifrado = ""

        with transaction.atomic():
            conexion = (
                ConexionGmailTienda.objects.select_for_update()
                .filter(tienda=tienda)
                .first()
            )

            if conexion:
                token_cifrado = conexion.refresh_token_cifrado
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
