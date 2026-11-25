import hashlib
import secrets
from datetime import timedelta
from html import escape
from io import BytesIO
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.http import HttpResponse, HttpResponseRedirect, FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response, error_response
from apps.landing.activity_views import NoStoreActivityView
from .models import ConexionInstagram, EstadoInstagramOAuth, PublicacionInstagram
from . import provider, publishing

COOKIE = 'openmind_instagram_oauth'
COOKIE_PATH = '/api/instagram/oauth/callback/'
digest = lambda value: hashlib.sha256(value.encode()).hexdigest()


class OwnerView(NoStoreActivityView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        if isinstance(exc, provider.InstagramError):
            return error_response('No se pudo completar la operación de Instagram. Revisa la conexión y vuelve a intentarlo.', exc.code, status=409)
        return super().handle_exception(exc)


class InstagramStateView(OwnerView):
    def get(self, request):
        return success_response(data=publishing.connection_state(resolver_tienda(request, exigir_propietario=True)))


class ConsentInput(StrictSerializer):
    autorizar = serializers.BooleanField()

    def validate_autorizar(self, value):
        if not value:
            raise serializers.ValidationError('Autoriza expresamente la conexión de tu cuenta de Instagram.')
        return value


class InstagramStartView(OwnerView):
    @transaction.atomic
    def post(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        values = ConsentInput(data=request.data); values.is_valid(raise_exception=True)
        state, ticket = secrets.token_urlsafe(48), secrets.token_urlsafe(48)
        url = provider.authorization_url(state)
        Tienda.objects.select_for_update().get(pk=store.pk)
        connection, _ = ConexionInstagram.objects.get_or_create(tienda=store)
        connection.generacion += 1
        connection.save(update_fields=['generacion', 'actualizado_en'])
        EstadoInstagramOAuth.objects.update_or_create(conexion=connection, defaults={
            'estado_hash': digest(state), 'navegador_hash': '', 'usuario': request.user,
            'inicio_hash': digest(ticket), 'estado_cifrado': provider.encrypt(state), 'iniciado_en': None,
            'generacion': connection.generacion, 'vence_en': timezone.now()+timedelta(minutes=10), 'consumido_en': None})
        return success_response(data={'url_autorizacion': url, 'callback_url': settings.INSTAGRAM_REDIRECT_URI,
            'url_inicio': settings.INSTAGRAM_REDIRECT_URI + '?inicio=' + ticket})


class InstagramCallbackView(NoStoreActivityView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        if 'inicio' in request.query_params:
            ticket = request.query_params.get('inicio', '')
            if len(ticket) != 64:
                return HttpResponse(status=400)
            with transaction.atomic():
                pending = EstadoInstagramOAuth.objects.select_for_update().filter(inicio_hash=digest(ticket)).first()
                if not pending or pending.iniciado_en or pending.consumido_en or pending.vence_en <= timezone.now():
                    return HttpResponse(status=400)
                try:
                    state = provider.decrypt(pending.estado_cifrado)
                    if not secrets.compare_digest(pending.estado_hash, digest(state)):
                        return HttpResponse(status=400)
                    target = provider.authorization_url(state)
                except provider.InstagramError:
                    return HttpResponse(status=400)
                browser = secrets.token_urlsafe(48)
                pending.navegador_hash, pending.iniciado_en = digest(browser), timezone.now()
                pending.estado_cifrado = ''
                pending.save(update_fields=['navegador_hash', 'iniciado_en', 'estado_cifrado'])
            response = HttpResponseRedirect(target)
            response.set_cookie(COOKIE, browser, secure=True, httponly=True, samesite='Lax', max_age=600, path=COOKIE_PATH)
            response['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'"
            return response
        result, failure = False, 'conexion_incompleta'
        state, browser = request.query_params.get('state', ''), request.COOKIES.get(COOKIE, '')
        if len(state) <= 200 and len(browser) <= 200 and state and browser:
            with transaction.atomic():
                pending = EstadoInstagramOAuth.objects.select_for_update(of=('self',)).select_related('usuario', 'conexion__tienda').filter(estado_hash=digest(state)).first()
                if pending and pending.consumido_en is None and pending.vence_en > timezone.now() and secrets.compare_digest(pending.navegador_hash, digest(browser)):
                    pending.consumido_en = timezone.now(); pending.save(update_fields=['consumido_en'])
                else:
                    pending = None
            code = request.query_params.get('code', '')
            if pending and not request.query_params.get('error') and 0 < len(code) <= 2048 and pending.usuario.is_active:
                try:
                    grant = provider.exchange(code)
                    encrypted = provider.encrypt(grant['token'])
                    with transaction.atomic():
                        store = Tienda.objects.select_for_update().get(pk=pending.conexion.tienda_id)
                        connection = ConexionInstagram.objects.select_for_update().get(pk=pending.conexion_id)
                        from django.contrib.auth import get_user_model
                        active = get_user_model().objects.filter(pk=pending.usuario_id, is_active=True).exists()
                        if store.id_usuario_propietario_id == pending.usuario_id and active and connection.generacion == pending.generacion:
                            connection.usuario_instagram, connection.nombre_usuario = grant['user_id'], grant['username']
                            connection.token_cifrado, connection.estado = encrypted, 'conectada'
                            connection.emitido_en = timezone.now(); connection.vence_en = grant['expires_at']
                            connection.client_business_id, connection.system_user_id = grant['business_id'], grant['system_user_id']
                            connection.config_id = settings.INSTAGRAM_CONFIG_ID
                            connection.token_tipo = 'SYSTEM_USER'
                            connection.permisos, connection.autorizado_por = grant['permissions'], pending.usuario
                            connection.save(); result = True
                except provider.InstagramError as error:
                    failure = error.code
                except (Tienda.DoesNotExist, ConexionInstagram.DoesNotExist):
                    pass
        title = 'Instagram conectado' if result else 'No se completó la conexión de Instagram'
        if provider.frontend_origin(settings.INSTAGRAM_FRONTEND_ORIGIN):
            from urllib.parse import urlencode
            target = settings.INSTAGRAM_FRONTEND_ORIGIN + '/emprendedor/landing?' + urlencode(
                {'instagram': 'conectado'} if result else {'instagram': 'error', 'motivo': failure}) + '#contacto-horarios'
            response = HttpResponseRedirect(target)
        else:
            response = HttpResponse('<!doctype html><html lang="es"><meta charset="utf-8"><h1>' + escape(title) + '</h1><p>Vuelve a Contacto y horarios en OpenMind.</p></html>', status=200 if result else 400)
        response.delete_cookie(COOKIE, path=COOKIE_PATH, samesite='Lax')
        response['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'"
        return response


class InstagramDisconnectView(OwnerView):
    def post(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        if request.data:
            raise ValidationError('Desconectar no admite datos adicionales.')
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            connection = ConexionInstagram.objects.select_for_update().filter(tienda=store).first()
            if not connection:
                return success_response(data={'conectado': False, 'revocacion_confirmada': False})
            connection.token_cifrado, connection.estado = '', 'desconectada'
            connection.vence_en, connection.emitido_en, connection.autorizado_por = None, None, None
            connection.permisos = []; connection.generacion += 1; connection.save()
            EstadoInstagramOAuth.objects.filter(conexion=connection).delete()
        return success_response(data={'conectado': False, 'revocacion_confirmada': False,
            'aviso': 'Acceso eliminado de OpenMind. Para revocar también en Meta, elimina la app de Aplicaciones conectadas del portafolio empresarial.'})


class InstagramRefreshView(InstagramStartView):
    """Renew through explicit Unified Login consent; no business_management or legacy refresh."""


class PrepareInput(StrictSerializer):
    clave = serializers.UUIDField()
    descripcion = serializers.CharField(max_length=2200, allow_blank=True, trim_whitespace=False)
    imagen = serializers.FileField()

    def validate_descripcion(self, value):
        if '\x00' in value:
            raise serializers.ValidationError('La descripción contiene caracteres no válidos.')
        return value.strip()


class InstagramPublicationsView(OwnerView):
    def get(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        rows = PublicacionInstagram.objects.filter(tienda=store)[:20]
        return success_response(data={'resultados': [publishing.publication_data(row) for row in rows]})

    def post(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        values = PrepareInput(data=request.data); values.is_valid(raise_exception=True)
        data = values.validated_data
        row = publishing.prepare(store, request.user, data['clave'], data['descripcion'], data['imagen'])
        return success_response(data=publishing.publication_data(row), status=201)


class ConfirmInput(StrictSerializer):
    confirmar = serializers.BooleanField()

    def validate_confirmar(self, value):
        if not value:
            raise serializers.ValidationError('Confirma expresamente esta publicación en Instagram.')
        return value


class InstagramPublicationActionView(OwnerView):
    action = 'confirmar'

    def post(self, request, pk):
        store = resolver_tienda(request, exigir_propietario=True)
        if self.action == 'confirmar':
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            row = publishing.confirm(store, pk)
        else:
            if request.data:
                raise ValidationError('Consultar estado no admite contenido adicional.')
            row = publishing.progress(store, pk)
        return success_response(data=publishing.publication_data(row))


class InstagramTemporaryImageView(NoStoreActivityView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, pk):
        signature = request.query_params.get('firma', '')
        if len(signature) > 1000:
            raise Http404
        try:
            payload = signing.loads(signature, salt='instagram-temporal-v1', max_age=3600)
            row = PublicacionInstagram.objects.get(pk=pk)
            if (payload.get('id') != str(pk) or payload.get('sha') != row.imagen_sha256
                    or payload.get('exp') != int(row.imagen_vence_en.timestamp())
                    or row.imagen_vence_en <= timezone.now() or not row.confirmada_en or not row.imagen
                    or row.estado not in ('creando', 'procesando', 'publicando', 'indeterminada')):
                raise Http404
            from django.db.models import Q
            if not ConexionInstagram.objects.filter(Q(vence_en__isnull=True) | Q(vence_en__gt=timezone.now()),
                    tienda_id=row.tienda_id, usuario_instagram=row.usuario_instagram, config_id=settings.INSTAGRAM_CONFIG_ID,
                    generacion=row.generacion, estado='conectada', token_tipo='SYSTEM_USER').exclude(token_cifrado='').exists():
                raise Http404
            response = FileResponse(row.imagen.open('rb'), content_type='image/jpeg')
            response['Content-Disposition'] = 'inline; filename="instagram.jpg"'
            response['X-Content-Type-Options'] = 'nosniff'
            response['Content-Security-Policy'] = "default-src 'none'"
            return response
        except (signing.BadSignature, ValueError, TypeError, KeyError, PublicacionInstagram.DoesNotExist, OSError):
            raise Http404 from None
