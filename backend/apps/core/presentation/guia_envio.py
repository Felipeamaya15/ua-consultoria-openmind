import logging
from decimal import Decimal

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.delivery import carrier_credentials, delivery_raw
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
from apps.core.peso_envio import (
    PESO_MINIMO_KG, CarritoInvalido, calcular_carrito, package_settings, peso_default_de_tienda, peso_str,
)
from apps.core.presentation.responses import error_response, success_response
from apps.shipping.application.use_cases import ConsultarSeguimientoUseCase
from apps.shipping.domain.dtos import DireccionDespachoDTO, PaqueteDTO
from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException,
    FormatoSeguimientoInvalidoException,
    LogisticaException,
    NumeroSeguimientoNoEncontradoException,
    ProveedorLogisticoError,
    RespuestaLogisticaInvalidaException,
    TiempoEsperaLogisticoException,
)
from apps.shipping.infrastructure import live
from apps.shipping.infrastructure.adapters import ChilexpressAdapter
from apps.shipping.infrastructure.chilexpress_envios import tipo_contenido_etiqueta

logger = logging.getLogger(__name__)


def _caja_del_pedido(pedido, tienda, entrega, params):
    cotizacion = entrega.get('cotizacion') if isinstance(entrega.get('cotizacion'), dict) else {}
    try:
        firmada = [Decimal(str(cotizacion[k])) for k in ('alto_cm', 'ancho_cm', 'largo_cm')]
        if all(m > 0 for m in firmada):
            return tuple(firmada)
    except (KeyError, ArithmeticError, ValueError):
        pass
    items = [{'producto_id': item.producto_mongo_id, 'sku': item.sku, 'cantidad': item.cantidad}
             for item in pedido.itempedido_set.all() if item.producto_mongo_id]
    try:
        carrito = calcular_carrito(tienda, items, params=params) if items else None
    except CarritoInvalido:
        carrito = None
    if carrito and carrito.caja:
        return carrito.caja
    return Decimal(str(params['alto_cm'])), Decimal(str(params['ancho_cm'])), Decimal(str(params['largo_cm']))


def _peso_del_pedido(pedido, tienda, entrega, params):
    cotizacion = entrega.get('cotizacion') if isinstance(entrega.get('cotizacion'), dict) else {}
    peso = cotizacion.get('peso_kg')
    if peso is not None and Decimal(str(peso)) > 0:
        return Decimal(str(peso))
    items = [{'producto_id': item.producto_mongo_id, 'sku': item.sku, 'cantidad': item.cantidad}
             for item in pedido.itempedido_set.all() if item.producto_mongo_id]
    try:
        if items:
            return calcular_carrito(tienda, items, params=params).peso_kg
    except CarritoInvalido:
        pass
    return peso_default_de_tienda(params)


def _pedido_de_la_tienda(request, id_pedido, *, bloquear=False):
    tienda = resolver_tienda(request, exigir_propietario=True)
    consulta = Pedido.objects.filter(tienda=tienda)
    if bloquear:
        consulta = consulta.select_for_update()
    return tienda, consulta.filter(pk=id_pedido).first()


def _no_encontrado():
    return error_response('No se encontró el pedido solicitado.', 'PEDIDO_NO_ENCONTRADO', status=404)


def _error_de_logistica(exc):
    if isinstance(exc, DireccionFueraDeCoberturaException):
        return error_response(str(exc), 'SIN_COBERTURA', status=400)
    if isinstance(exc, FormatoSeguimientoInvalidoException):
        return error_response(str(exc), 'FORMATO_TRACKING_INVALIDO', status=400)
    if isinstance(exc, NumeroSeguimientoNoEncontradoException):
        return error_response('Chilexpress no registra esa guía todavía.', 'TRACKING_NO_ENCONTRADO', status=404)
    if isinstance(exc, TiempoEsperaLogisticoException):
        return error_response('Chilexpress tardó demasiado en responder. Intenta nuevamente.',
                              'TIEMPO_ESPERA_AGOTADO', status=504)
    if isinstance(exc, RespuestaLogisticaInvalidaException):
        return error_response('La respuesta de Chilexpress es inválida.', 'RESPUESTA_OPERADOR_INVALIDA', status=502)
    if isinstance(exc, ProveedorLogisticoError):
        return error_response(str(exc), 'PROVEEDOR_NO_DISPONIBLE', status=502)
    return error_response(str(exc), 'ERROR_LOGISTICA', status=400)


class GuiaChilexpressAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _armar(pedido, tienda):
        entrega = pedido.entrega if isinstance(pedido.entrega, dict) else {}
        direccion = entrega.get('direccion') if isinstance(entrega.get('direccion'), dict) else {}
        credenciales = carrier_credentials(delivery_raw(tienda), 'chilexpress')
        calle, numero = (direccion.get('street') or '').strip(), (direccion.get('number') or '').strip()
        region, comuna = (direccion.get('region') or '').strip(), (direccion.get('city') or '').strip()
        if not (calle and numero and region and comuna):
            raise DireccionFueraDeCoberturaException('El pedido no tiene una dirección de entrega completa.')
        if not (credenciales.get('origen_calle') and credenciales.get('origen_numero')):
            raise ProveedorLogisticoError(
                'Falta la dirección de origen de Chilexpress (calle y número) en Entregas → Chilexpress.')
        destino = DireccionDespachoDTO(calle=calle, numero=numero, comuna=comuna, region=region,
                                       depto_casa=(direccion.get('apt') or '').strip(),
                                       sector=(direccion.get('sector') or '').strip())
        origen = DireccionDespachoDTO(calle=credenciales['origen_calle'], numero=credenciales['origen_numero'],
                                      comuna='', region='')
        valor = max(Decimal(pedido.monto_total) - Decimal(pedido.costo_envio or 0), Decimal('0'))
        params = package_settings(delivery_raw(tienda))
        peso = max(_peso_del_pedido(pedido, tienda, entrega, params), PESO_MINIMO_KG)
        alto, ancho, largo = _caja_del_pedido(pedido, tienda, entrega, params)
        paquete = PaqueteDTO(peso_kg=peso, alto_cm=alto, ancho_cm=ancho, largo_cm=largo,
                             valor_declarado=valor.quantize(Decimal('1')))
        contacto = {'nombre': pedido.nombre_contacto or (pedido.contacto or {}).get('nombre', ''),
                    'telefono': pedido.telefono_contacto or (pedido.contacto or {}).get('telefono', ''),
                    'correo': pedido.correo_contacto}
        remitente = {'nombre': tienda.nombre, 'telefono': credenciales.get('telefono', ''),
                     'correo': tienda.correo_negocio or getattr(tienda.id_usuario_propietario, 'email', '')}
        cotizacion = entrega.get('cotizacion') if isinstance(entrega.get('cotizacion'), dict) else {}
        servicio = str(cotizacion.get('servicio_codigo') or '3')
        return origen, destino, [paquete], contacto, remitente, servicio

    def post(self, request, id_pedido):
        with transaction.atomic():
            tienda, pedido = _pedido_de_la_tienda(request, id_pedido, bloquear=True)
            if pedido is None:
                return _no_encontrado()
            entrega = dict(pedido.entrega) if isinstance(pedido.entrega, dict) else {}
            if entrega.get('metodo') != 'Chilexpress':
                return error_response('El pedido no se despacha con Chilexpress.', 'METODO_NO_CHILEXPRESS', status=409)
            if pedido.estado not in Pedido.ESTADOS_PAGADOS:
                return error_response('Solo se puede emitir la guía de un pedido pagado.', 'PEDIDO_NO_PAGADO', status=409)
            existente = entrega.get('guia') if isinstance(entrega.get('guia'), dict) else None
            if existente and existente.get('numero_ot'):
                return success_response(data=self._salida(existente), mensaje='El pedido ya tiene una guía emitida.')
            if live.get_shipping_client(tienda) is None:
                return error_response('Configura la clave API de Envíos de Chilexpress en Entregas → Chilexpress.',
                                      'CHILEXPRESS_NO_CONFIGURADO', status=409)
            try:
                origen, destino, paquetes, contacto, remitente, servicio = self._armar(pedido, tienda)
                guia = ChilexpressAdapter(tienda=tienda).generar_despacho(
                    pedido.identificador or str(pedido.pk), origen, destino, paquetes,
                    contacto_destino=contacto, remitente=remitente, servicio=servicio)
            except LogisticaException as exc:
                logger.warning('Guía Chilexpress fallida (pedido=%s): %s', pedido.pk, type(exc).__name__)
                return _error_de_logistica(exc)
            stored = delivery_raw(tienda).get('chilexpress')
            ambiente = (stored.get('ambiente') if isinstance(stored, dict) else None) or 'SANDBOX'
            detalle = {
                'peso_kg': peso_str(paquetes[0].peso_kg),
                'numero_ot': guia.numero_seguimiento, 'certificado': guia.certificado,
                'codigo_barras': guia.codigo_barras, 'etiqueta': guia.etiqueta,
                'tipo_etiqueta': guia.tipo_etiqueta, 'ambiente': ambiente,
                'emitida_en': timezone.now().isoformat(),
            }
            entrega['guia'] = detalle
            entrega['codigo_seguimiento'] = guia.numero_seguimiento
            pedido.entrega = entrega
            pedido.save(update_fields=['entrega'])
        return success_response(data=self._salida(detalle), mensaje='Guía de Chilexpress emitida.', status=201)

    @staticmethod
    def _salida(guia):
        return {**{k: v for k, v in guia.items() if k != 'etiqueta'}, 'tiene_etiqueta': bool(guia.get('etiqueta'))}


class EtiquetaChilexpressAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id_pedido):
        _, pedido = _pedido_de_la_tienda(request, id_pedido)
        if pedido is None:
            return _no_encontrado()
        guia = (pedido.entrega or {}).get('guia') if isinstance(pedido.entrega, dict) else None
        contenido = tipo_contenido_etiqueta(guia.get('etiqueta', '')) if isinstance(guia, dict) and guia.get('etiqueta') else None
        if contenido is None:
            return error_response('El pedido no tiene una etiqueta disponible.', 'ETIQUETA_NO_DISPONIBLE', status=404)
        raw, content_type = contenido
        response = HttpResponse(raw, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="etiqueta-{guia.get("numero_ot", "chilexpress")}"'
        response['Cache-Control'] = 'no-store'
        return response


class SeguimientoPedidoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id_pedido):
        tienda, pedido = _pedido_de_la_tienda(request, id_pedido)
        if pedido is None:
            return _no_encontrado()
        entrega = pedido.entrega if isinstance(pedido.entrega, dict) else {}
        numero = str(entrega.get('codigo_seguimiento') or '').strip()
        if entrega.get('metodo') != 'Chilexpress' or not numero:
            return error_response('El pedido todavía no tiene guía de Chilexpress.', 'SIN_GUIA', status=404)
        try:
            detalle = ConsultarSeguimientoUseCase(ChilexpressAdapter(tienda=tienda)).execute(numero)
        except LogisticaException as exc:
            logger.warning('Seguimiento Chilexpress fallido (pedido=%s): %s', pedido.pk, type(exc).__name__)
            return _error_de_logistica(exc)
        response = success_response(data=detalle, mensaje='Seguimiento obtenido.')
        response['Cache-Control'] = 'no-store'
        return response
