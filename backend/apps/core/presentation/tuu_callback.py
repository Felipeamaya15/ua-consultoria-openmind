"""Callback servidor a servidor de TUU Pago Online (SCRUM-509). Fuente de verdad del pago."""
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.infrastructure.adapters.tuu_adapter import firma_valida
from apps.core.infrastructure.stock_pedidos import descontar_stock_de_pedido
from apps.core.models import ConfiguracionPago, Pedido, Tienda

logger = logging.getLogger(__name__)


def credenciales_tuu(tienda):
    """(account_id, llave_secreta, ambiente) si TUU está habilitado y configurado; si no, None."""
    config = ConfiguracionPago.objects.filter(tienda=tienda).first()
    tuu = (config.datos_descifrados.get('tuu') or {}) if config else {}
    campos = tuu.get('fields') or {}
    cuenta = str(campos.get('accountId') or '').strip()
    clave = str(campos.get('secretKey') or '').strip()
    if tuu.get('enabled') is True and cuenta and clave:
        return cuenta, clave, str(campos.get('environment') or 'integracion')
    return None


class TuuCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        datos = {k: v for k, v in request._request.POST.items()}
        tienda = Tienda.objects.filter(pk=request.query_params.get('tienda')).first() \
            if str(request.query_params.get('tienda', '')).isdigit() else None
        credenciales = credenciales_tuu(tienda) if tienda else None
        if not credenciales or not firma_valida(datos, credenciales[1]):
            logger.warning('Callback TUU rechazado: firma o tienda inválida.')
            return Response({'exito': False}, status=400)
        if datos.get('x_account_id') != credenciales[0]:
            return Response({'exito': False}, status=400)
        with transaction.atomic():
            pedido = Pedido.objects.select_for_update().filter(
                identificador=datos.get('x_reference', ''), tienda=tienda, medio_pago='TUU').first()
            if not pedido:
                return Response({'exito': False}, status=400)
            if datos.get('x_result') != 'completed':
                return Response({'exito': True})
            try:
                monto = Decimal(str(datos.get('x_amount')))
            except (InvalidOperation, TypeError, ValueError):
                return Response({'exito': False}, status=400)
            if monto != pedido.monto_total:
                logger.error('Callback TUU con monto distinto en pedido %s.', pedido.pk)
                return Response({'exito': False}, status=400)
            if pedido.estado == 'cancelado':
                logger.critical('PAGO_SOBRE_PEDIDO_CANCELADO pedido=%s tienda=%s medio=TUU x_reference=%s',
                                pedido.pk, pedido.tienda_id, pedido.identificador)
            pasa_a_pagado = pedido.estado == 'pendiente'
            if pasa_a_pagado:
                pedido.estado = 'pagado'
                pedido.save(update_fields=['estado'])
        if pedido.estado in Pedido.ESTADOS_PAGADOS:
            descontar_stock_de_pedido(pedido.pk)
        if pasa_a_pagado:
            try:
                from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado
                notificar_cambio_de_estado(pedido, 'pendiente')
            except Exception:
                logger.exception('No se pudo notificar el pago TUU del pedido %s.', pedido.pk)
        return Response({'exito': True})  # 200: TUU detiene los reintentos
