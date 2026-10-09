# Vistas del módulo Core (PostgreSQL)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.exceptions import APIException
from django.db import transaction

from apps.core.delivery import delivery_data, delivery_for_store
from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id
from apps.core.models import (
    ConfiguracionMercadoPago,
    ConfiguracionPago,
    ConfiguracionPayPal,
    ConfiguracionTransbank,
    ConfiguracionEntrega,
    Tienda,
)
from apps.core.presentation.checkout import GuestCheckoutOrderAPIView
from apps.core.presentation.linkify_notificacion import LinkifyNotificacionView
from apps.core.presentation.responses import error_response, success_response
from apps.core.presentation.serializers import ConfiguracionPagoSerializer, ShippingConfigurationSerializer
from apps.core.models import Pedido
from rest_framework import generics
from .serializers import PedidoTiendaSerializer, TransferenciaPendienteSerializer

class RegistrarCompraView(GuestCheckoutOrderAPIView):
    """Compatibilidad SCRUM-289: reutiliza la creación y seguridad de SCRUM-291."""

class TiendaPagoActualAPIView(APIView):
    """Entrega al panel admin la tienda resuelta por el backend; nunca acepta elegir otra."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            return success_response(data={"id_tienda": tienda.pk, "nombre": tienda.nombre})
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_TIENDA", status=getattr(e, "status_code", 400))

class ConfiguracionPagoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            config_pago, _ = ConfiguracionPago.objects.get_or_create(tienda=tienda)
            return success_response(data=config_pago.datos or {})
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=getattr(e, "status_code", 400))

    def put(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            serializer = ConfiguracionPagoSerializer(data=request.data)
            if not serializer.is_valid():
                return error_response(mensaje="Datos incompletos.", codigo="ERROR_VALIDACION", detalles=serializer.errors, status=400)

            config_pago, _ = ConfiguracionPago.objects.get_or_create(tienda=tienda)
            config_pago.datos = serializer.validated_data
            config_pago.save()

            return success_response(mensaje="Métodos guardados.", data=config_pago.datos)
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=getattr(e, "status_code", 400))

    def patch(self, request):
        return self.put(request)

class ConfiguracionEntregaAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        return success_response(data=delivery_for_store(tienda))

    def put(self, request):
        return self.save_configuration(request, partial=False)

    def patch(self, request):
        return self.save_configuration(request, partial=True)

    def save_configuration(self, request, *, partial):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = ShippingConfigurationSerializer(data=request.data, partial=partial)
        if not serializer.is_valid():
            return error_response('Configuración de entrega inválida.', 'ERROR_VALIDACION',
                                  serializer.errors, status=400)
        with transaction.atomic():
            # Serializa PATCH concurrentes, incluso antes de existir la configuración.
            Tienda.objects.select_for_update().get(pk=tienda.pk)
            config, _ = ConfiguracionEntrega.objects.get_or_create(tienda=tienda)
            datos = delivery_data(config.datos)
            for method, changes in serializer.validated_data.items():
                datos[method].update(changes)
            config.datos = datos
            config.save(update_fields=['datos', 'fecha_actualizacion'])
        return success_response(data=datos, mensaje='Configuración de entregas guardada.')


class AlternativasEntregaAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return success_response(data=delivery_for_store(resolver_tienda(request)))


class MetodosPagoActivosAPIView(APIView):
    """Endpoint público para checkout."""
    permission_classes = [AllowAny]
    def get(self, request):
        from apps.core.payments import payment_methods_for_store
        return success_response(data=payment_methods_for_store(resolver_tienda(request)))

class IniciarPagoPayPalView(APIView):
    """El checkout CLP no puede cobrar su total como USD sin conciliación de moneda."""
    permission_classes = [AllowAny]

    def post(self, request):
        tienda = resolver_tienda(request)
        if not ConfiguracionPayPal.objects.filter(id_tienda=tienda, activo=True).exists():
            return error_response(mensaje="PayPal no configurado para esta tienda.", codigo="PAYPAL_NO_CONFIGURADO", status=400)
        from apps.core.payments import UNAVAILABLE_CHECKOUT_METHODS
        return error_response(mensaje=UNAVAILABLE_CHECKOUT_METHODS["paypal"], codigo="PAYPAL_NO_DISPONIBLE", status=409)


class CapturarPagoPayPalView(IniciarPagoPayPalView):
    """Mantiene la ruta sin capturar órdenes remotas que no están vinculadas a un Pedido."""


class WebhookLinkifyAPIView(LinkifyNotificacionView):
    """Compatibilidad del webhook antiguo con la firma y estados de SCRUM-316/317."""

    def _avisar(self, request, cuerpo):
        try:
            datos = request.data
        except APIException:
            return error_response('El cuerpo no es válido.', 'CUERPO_INVALIDO', status=400)
        if not isinstance(datos, dict):
            return error_response('El cuerpo debe ser un objeto.', 'CUERPO_INVALIDO', status=400)
        if any(key in datos for key in ('id_pago', 'idPago', 'payment_id', 'id')):
            return super()._avisar(request, cuerpo)
        reference = datos.get('buy_order') or datos.get('reference')
        if not reference:
            return error_response('Falta identificador (reference).', 'CUERPO_INVALIDO', status=400)
        pedido = Pedido.objects.filter(identificador=reference).first()
        if not pedido:
            return error_response('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', status=404)
        self._verificar_firma(request, pedido, cuerpo)
        if datos.get('status') in ('PAID', 'VERIFIED', 'COMPLETED'):
            return self._pago_recibido(pedido, datos.get('monto', datos.get('amount')))
        return success_response(mensaje='Notificación recibida, estado pendiente.')


class VerificarTransferenciaLinkifyAPIView(APIView):
    """
    Endpoint activo para que el administrador solicite a Linkify que 
    busque una transferencia en su cartola bancaria bajo demanda.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        pedido_id = request.data.get('pedido_id')
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            pedido = Pedido.objects.get(id_pedido=pedido_id, tienda=tienda)
            
            metodo = (pedido.medio_pago or pedido.metodo_pago or '').strip().lower()
            if metodo not in ['linkify', 'transferencia']:
                return error_response('El pedido no corresponde a Linkify ni a Transferencia.', 'PEDIDO_NO_LINKIFY', status=409)
            
            if pedido.estado in ('cancelado', 'enviado'):
                return error_response('El pedido requiere revisión manual.', 'ESTADO_PEDIDO_INVALIDO', status=409)
            
            config_pago = ConfiguracionPago.objects.get(tienda=tienda)
            linkify_config = (config_pago.datos or {}).get("linkify", {})
            

            fields = linkify_config.get("fields", {})
            api_key = fields.get("clavePrivada") or fields.get("apiKey") or linkify_config.get("api_key")

            if not api_key:
                return error_response(mensaje="La tienda no tiene configurado Linkify correctamente.", codigo="LINKIFY_NO_CONFIGURADO", status=400)

            from apps.catalog.infrastructure.adapters.linkify_adapter import LinkifyAdapter
            adapter = LinkifyAdapter(api_key=api_key)
            
            identificador = pedido.identificador or str(pedido.id_pedido)
            resultado = adapter.verificar_transferencia(identificador, float(pedido.monto_total))
            
            if resultado.get("verificado"):
                with transaction.atomic():
                    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk, tienda=tienda)
                    if pedido.estado == 'pendiente':
                        pedido.estado = 'pagado'
                        pedido.save(update_fields=['estado'])
                    elif pedido.estado != 'pagado':
                        return error_response('El pedido requiere revisión manual.', 'ESTADO_PEDIDO_INVALIDO', status=409)
                return success_response(mensaje="¡Match exitoso! Transferencia encontrada y pedido actualizado.")
            else:
                return error_response(
                    mensaje="Aún no se detecta la transferencia en el banco.", codigo="TRANSFERENCIA_NO_ENCONTRADA",
                    detalles=resultado.get("mensaje"),
                    status=400
                )
                
        except Pedido.DoesNotExist:
            return error_response(mensaje="Pedido no encontrado", codigo="PEDIDO_NO_ENCONTRADO", status=404)
        except Exception as e:
            return error_response(mensaje="No se pudo validar la transferencia.", codigo="ERROR_LINKIFY", status=getattr(e, "status_code", 500))

class TransferenciasPendientesAPIView(APIView):
    """Consulta manual de transferencias; Pedido mantiene el único estado del pago."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        pendientes = Pedido.objects.filter(
            tienda=tienda, medio_pago__in=['Transferencia', 'Linkify'], estado='pendiente',
        ).order_by('-fecha_creacion', '-id_pedido')
        return success_response(
            data=TransferenciaPendienteSerializer(pendientes, many=True).data,
            mensaje='Transferencias pendientes obtenidas correctamente.',
        )


class AprobarTransferenciaManualAPIView(APIView):
    """Permite al propietario confirmar manualmente una transferencia bancaria."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pedido_id):
        tienda = resolver_tienda(request, exigir_propietario=True)

        with transaction.atomic():
            try:
                pedido = Pedido.objects.select_for_update().get(
                    id_pedido=pedido_id,
                    tienda=tienda,
                )
            except Pedido.DoesNotExist:
                return error_response(
                    'Pedido no encontrado.',
                    'PEDIDO_NO_ENCONTRADO',
                    status=404,
                )

            metodo = (pedido.medio_pago or pedido.metodo_pago or '').strip().lower()
            if metodo != 'transferencia':
                return error_response(
                    'El pedido no corresponde a una transferencia bancaria manual.',
                    'METODO_PAGO_INVALIDO',
                    status=409,
                )

            if pedido.estado == 'pagado':
                return success_response(
                    data={'id_pedido': pedido.pk, 'estado': pedido.estado},
                    mensaje='La transferencia ya estaba aprobada.',
                )

            if pedido.estado != 'pendiente':
                return error_response(
                    'Solo se pueden aprobar transferencias de pedidos pendientes.',
                    'ESTADO_PEDIDO_INVALIDO',
                    status=409,
                )

            pedido.estado = 'pagado'
            pedido.save(update_fields=['estado'])

        return success_response(
            data={'id_pedido': pedido.pk, 'estado': pedido.estado},
            mensaje='Transferencia aprobada y pedido marcado como pagado.',
        )


class TiendaPedidosAPIView(generics.ListAPIView):
    serializer_class = PedidoTiendaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tienda = resolver_tienda(self.request, exigir_propietario=True)
        return Pedido.objects.filter(tienda=tienda).prefetch_related('itempedido_set').order_by('-fecha_creacion')
