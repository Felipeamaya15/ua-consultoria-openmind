import re
from datetime import datetime, timedelta

from django.db import OperationalError, ProgrammingError
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
from apps.core.presentation.responses import success_response, error_response
from apps.landing.activity_views import NoStoreActivityView
from apps.landing.models import ReservaActividadPagada


def require_recording(store, recording_id):
    from apps.landing.models import GrabacionTaller
    return get_object_or_404(GrabacionTaller, pk=recording_id, tienda=store, activa=True)


def grant_recordings(order, rows):
    if order.estado not in Pedido.ESTADOS_PAGADOS:
        return
    delivery = dict(order.entrega or {})
    grants = dict(delivery.get('_grabaciones_acceso') or {})
    changed = False
    for row in rows:
        snapshot = row.condiciones
        if snapshot.get('modalidad_venta') != 'grabado' or str(row.pk) in grants:
            continue
        if not order.comprador_id:
            raise ValidationError('La grabación requiere un comprador autenticado.')
        now = timezone.now()
        grants[str(row.pk)] = {'grabacion_id': snapshot['grabacion_id'], 'desde': now.isoformat(),
            'hasta': (now + timedelta(days=int(snapshot['acceso_dias']))).isoformat()}
        changed = True
    if changed:
        delivery['_grabaciones_acceso'] = grants
        order.entrega = delivery
        order.save(update_fields=['entrega'])


def valid_grant(order, row, *, now=None):
    if order.estado not in Pedido.ESTADOS_PAGADOS or row.estado != 'confirmada':
        return None
    if row.tienda_id != order.tienda_id or row.clave_checkout != order.clave_checkout:
        return None
    refund = ((order.entrega or {}).get('devoluciones_actividades_transferencia') or {}).get(str(row.pk), {})
    if refund.get('estado') in ('autorizada', 'reembolsada_manual', 'reembolso_en_revision', 'reembolsada_webpay', 'reembolso_externo_revision', 'reembolsada_externa'):
        return None
    grant = ((order.entrega or {}).get('_grabaciones_acceso') or {}).get(str(row.pk))
    if not grant or grant.get('grabacion_id') != row.condiciones.get('grabacion_id'):
        return None
    try:
        start, end = datetime.fromisoformat(grant['desde']), datetime.fromisoformat(grant['hasta'])
        if start <= (now or timezone.now()) < end:
            return grant
    except (ValueError, KeyError, TypeError):
        pass
    return None


class PrivateRecordingView(NoStoreActivityView):
    def handle_exception(self, exc):
        if isinstance(exc, (OperationalError, ProgrammingError)):
            return error_response('El módulo de grabaciones no está disponible. El administrador debe revisar la actualización pendiente.',
                'GRABACIONES_ACTUALIZACION_PENDIENTE', status=503)
        return super().handle_exception(exc)


class RecordingUploadView(PrivateRecordingView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        from apps.landing.models import GrabacionTaller
        store = resolver_tienda(request, exigir_propietario=True)
        return success_response(data=list(GrabacionTaller.objects.filter(tienda=store, activa=True)
            .order_by('-creado').values('id', 'titulo', 'bytes', 'creado')[:100]))

    def post(self, request):
        # Funcionalidad de grabaciones pagadas postergada; no borrar archivos historicos.
        resolver_tienda(request, exigir_propietario=True)
        raise ValidationError({'video':
            'La carga de nuevas grabaciones esta deshabilitada. Se evaluara como mejora futura.'})

class MyRecordingsView(PrivateRecordingView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = resolver_tienda(request)
        orders = Pedido.objects.filter(tienda=store, comprador=request.user, estado__in=Pedido.ESTADOS_PAGADOS,
            entrega__has_key='_grabaciones_acceso').order_by('-fecha_creacion')[:100]
        result = []
        for order in orders:
            for row in ReservaActividadPagada.objects.filter(tienda=store, clave_checkout=order.clave_checkout):
                grant = valid_grant(order, row)
                if grant:
                    from apps.landing.models import GrabacionTaller
                    recording = GrabacionTaller.objects.filter(pk=grant['grabacion_id'], tienda=store, activa=True).first()
                    if not recording:
                        continue
                    result.append({'pedido': order.pk, 'reserva': str(row.pk), 'titulo': row.condiciones['titulo'],
                        'hasta': grant['hasta'], 'grabacion': str(recording.pk)})
        return success_response(data=result)


def byte_range(header, size):
    if not header:
        return 0, size - 1, 200
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', header)
    if not match or not any(match.groups()):
        raise ValueError()
    first, last = match.groups()
    if not first:
        length = int(last)
        if length <= 0:
            raise ValueError()
        start, end = max(0, size - length), size - 1
    else:
        start, end = int(first), min(int(last), size - 1) if last else size - 1
    if start < 0 or start >= size or end < start:
        raise ValueError()
    return start, end, 206


class RecordingStreamView(PrivateRecordingView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pedido_id, reserva_id):
        store = resolver_tienda(request)
        order = get_object_or_404(Pedido, pk=pedido_id, tienda=store, comprador=request.user)
        row = get_object_or_404(ReservaActividadPagada, pk=reserva_id, tienda=store, clave_checkout=order.clave_checkout)
        grant = valid_grant(order, row)
        if not grant:
            raise NotFound('No tienes acceso vigente a esta grabación.')
        recording = require_recording(store, grant['grabacion_id'])
        try:
            start, end, status = byte_range(request.headers.get('Range'), recording.bytes)
        except ValueError:
            response = StreamingHttpResponse(status=416)
            response['Content-Range'] = f'bytes */{recording.bytes}'
            return response
        try:
            source = recording.archivo.open('rb')
            source.seek(start)
        except OSError:
            raise NotFound('La grabación no está disponible temporalmente.') from None

        def chunks():
            remaining = end - start + 1
            try:
                while remaining > 0:
                    chunk = source.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
            finally:
                source.close()

        response = StreamingHttpResponse(chunks(), status=status, content_type='video/mp4')
        response['Accept-Ranges'] = 'bytes'
        response['Content-Length'] = str(end - start + 1)
        response['Content-Disposition'] = 'inline'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cross-Origin-Resource-Policy'] = 'same-site'
        if status == 206:
            response['Content-Range'] = f'bytes {start}-{end}/{recording.bytes}'
        return response
