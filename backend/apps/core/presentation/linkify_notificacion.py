
"""Recepcion de los avisos de Linkify (cobros remotos). SCRUM-316 y SCRUM-317.

Linkify llama a la "URL de integracion" que el emprendedor registra en su cuenta:

  GET  ?id_pago=<id>         -> entrega el monto y el detalle del cobro.
  POST action=notification   -> el pago fue recibido: el pedido pasa a "pagado".
  POST action=cancellation   -> el pago se anulo o desvinculo: vuelve a "pendiente".

Cada peticion viene firmada con HMAC-SHA256 (cabecera X-Linkify-Confirmation)
con la clave privada del comercio. Sin una firma valida no se modifica nada.

Manejo de errores: todo aviso que no se puede procesar responde con un codigo
HTTP de error (para que Linkify lo reintente o lo muestre) y un cuerpo con el
formato estandar {"exito": false, "error": {"codigo": ...}}, y queda registrado
en el log con su codigo y el pedido involucrado.

Codigos: CUERPO_INVALIDO (400), MONTO_INVALIDO (400), ACCION_DESCONOCIDA (400),
FIRMA_INVALIDA (401), PEDIDO_NO_ENCONTRADO (404), LINKIFY_NO_CONFIGURADO (409),
PEDIDO_NO_LINKIFY (409), MONTO_NO_COINCIDE (409), PEDIDO_CANCELADO (409),
PEDIDO_YA_ENVIADO (409), ERROR_INTERNO (500).

TODO (confirmar con Linkify, su detalle esta en la documentacion de Apiary):
nombres exactos de los campos de cada peticion y que se firma en los GET.
Los nombres aceptados estan concentrados en las constantes de abajo.
"""
import logging
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.infrastructure.linkify_client import LinkifyAdapter
from apps.core.models import ConfiguracionPago, Pedido
from apps.core.presentation.responses import error_response

logger = logging.getLogger(__name__)

CABECERA_FIRMA = "X-Linkify-Confirmation"
CAMPOS_ID_PAGO = ("id_pago", "idPago", "payment_id", "id")
CAMPOS_MONTO = ("monto", "amount")


class _Rechazo(Exception):
    """Aviso que no se puede procesar: se responde con un error y no se cambia nada."""

    def __init__(self, codigo, mensaje, http_status, pedido=None):
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje
        self.http_status = http_status
        self.pedido_id = getattr(pedido, "pk", None)


def _dato(datos, *claves):
    for clave in claves:
        valor = datos.get(clave)
        if valor not in (None, ""):
            return valor
    return None


def _a_entero(valor, pedido=None):
    try:
        monto = Decimal(str(valor))
        if not monto.is_finite() or monto < 0:
            raise ValueError('Monto inválido.')
        return monto
    except (InvalidOperation, ValueError):
        raise _Rechazo("MONTO_INVALIDO", "El monto informado no es un numero valido.", status.HTTP_400_BAD_REQUEST, pedido)


class LinkifyNotificacionView(APIView):
    """Endpoint que Linkify invoca para consultar un cobro o avisar su resultado."""

    permission_classes = [AllowAny]
    authentication_classes = []  # La autenticidad la entrega la firma, no un usuario.

    def get(self, request):
        return self._atender(lambda: self._consultar(request))

    def post(self, request):
        cuerpo = request.body  # Debe leerse antes de acceder a request.data.
        return self._atender(lambda: self._avisar(request, cuerpo))

    # ------------------------------------------------------------ respuesta

    @staticmethod
    def _atender(accion):
        try:
            return accion()
        except _Rechazo as rechazo:
            logger.warning("Linkify: aviso rechazado (%s) pedido=%s: %s",
                           rechazo.codigo, rechazo.pedido_id, rechazo.mensaje)
            return error_response(rechazo.mensaje, rechazo.codigo, status=rechazo.http_status)
        except Exception:  # noqa: BLE001 - nunca se debe filtrar un error interno a Linkify
            logger.exception("Linkify: error inesperado al procesar el aviso")
            return error_response("No se pudo procesar el aviso. Reintenta mas tarde.", "ERROR_INTERNO",
                                  status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ------------------------------------------------------------- acciones

    def _consultar(self, request):
        pedido = self._pedido(_dato(request.query_params, *CAMPOS_ID_PAGO))
        # Sin cuerpo en un GET: se acepta la firma del cuerpo vacio o de la query string.
        self._verificar_firma(request, pedido, request.body, request.META.get("QUERY_STRING", "").encode())
        if pedido.medio_pago != "Linkify" or pedido.estado not in ("pendiente", "pagado", "enviado"):
            raise _Rechazo("PEDIDO_NO_DISPONIBLE", "El pedido no admite este cobro.", status.HTTP_409_CONFLICT, pedido)
        monto = pedido.monto_total
        return Response({
            "monto": int(monto) if monto == monto.to_integral_value() else format(monto, ".2f"),
            "detalle": f"Pedido {pedido.identificador or pedido.pk}",
        })

    def _avisar(self, request, cuerpo):
        try:
            datos = request.data
        except APIException:  # JSON mal formado o tipo de contenido no admitido
            raise _Rechazo("CUERPO_INVALIDO", "El cuerpo de la peticion no es valido.", status.HTTP_400_BAD_REQUEST)

        if not isinstance(datos, Mapping):
            raise _Rechazo("CUERPO_INVALIDO", "El cuerpo debe ser un objeto.", status.HTTP_400_BAD_REQUEST)

        pedido = self._pedido(_dato(datos, *CAMPOS_ID_PAGO))
        self._verificar_firma(request, pedido, cuerpo)

        accion = str(_dato(datos, "action") or "").strip().lower()
        if accion == "notification":
            return self._pago_recibido(pedido, _dato(datos, *CAMPOS_MONTO))
        if accion == "cancellation":
            return self._pago_anulado(pedido)
        raise _Rechazo("ACCION_DESCONOCIDA", "La accion indicada no es valida.", status.HTTP_400_BAD_REQUEST, pedido)

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _pedido(id_pago):
        try:
            return Pedido.objects.select_related("tienda").get(pk=int(id_pago))
        except (TypeError, ValueError, Pedido.DoesNotExist):
            raise _Rechazo("PEDIDO_NO_ENCONTRADO", "No existe un pedido para el cobro indicado.", status.HTTP_404_NOT_FOUND)

    @staticmethod
    def _verificar_firma(request, pedido, *firmados):
        config = ConfiguracionPago.objects.filter(tienda=pedido.tienda).first()
        linkify = ((config.datos or {}).get("linkify") or {}) if config else {}
        campos = linkify.get("fields") or {}
        id_cuenta, clave = campos.get("idCuenta"), campos.get("clavePrivada")
        # No se exige "enabled": un pago en curso debe poder cerrarse aunque
        # el emprendedor haya desactivado Linkify despues.
        if not id_cuenta or not clave:
            raise _Rechazo("LINKIFY_NO_CONFIGURADO", "Linkify no esta configurado para la tienda de este pedido.",
                           status.HTTP_409_CONFLICT, pedido)

        firma = request.headers.get(CABECERA_FIRMA, "")
        adaptador = LinkifyAdapter(id_cuenta=id_cuenta, clave_privada=clave)
        if not any(adaptador.firma_valida(cuerpo, firma) for cuerpo in firmados):
            raise _Rechazo("FIRMA_INVALIDA", "La firma de la peticion no es valida.", status.HTTP_401_UNAUTHORIZED, pedido)

    # ----------------------------------------------------------------- estados

    def _pago_recibido(self, pedido, monto):
        if (pedido.medio_pago or pedido.metodo_pago or "").strip().lower() != "linkify":
            raise _Rechazo("PEDIDO_NO_LINKIFY", "El pedido no fue creado con Linkify.", status.HTTP_409_CONFLICT, pedido)
        if monto is not None and _a_entero(monto, pedido) != pedido.monto_total:
            raise _Rechazo("MONTO_NO_COINCIDE", "El monto pagado no coincide con el del pedido.", status.HTTP_409_CONFLICT, pedido)

        with transaction.atomic():
            pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
            if pedido.estado == "cancelado":
                raise _Rechazo("PEDIDO_CANCELADO", "El pedido esta cancelado y no puede marcarse como pagado.",
                               status.HTTP_409_CONFLICT, pedido)
            if pedido.estado == "pendiente":
                pedido.estado = "pagado"
                pedido.save(update_fields=["estado"])
                logger.info("Linkify: pedido %s marcado como pagado", pedido.pk)
            # "pagado" o "enviado": el aviso ya se habia procesado (es idempotente).
        return Response({"exito": True, "mensaje": "Pago registrado.", "estado": pedido.estado})

    def _pago_anulado(self, pedido):
        if (pedido.medio_pago or pedido.metodo_pago or "").strip().lower() != "linkify":
            raise _Rechazo("PEDIDO_NO_LINKIFY", "El pedido no fue creado con Linkify.", status.HTTP_409_CONFLICT, pedido)
        with transaction.atomic():
            pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
            if pedido.estado == "enviado":
                raise _Rechazo("PEDIDO_YA_ENVIADO", "El pedido ya fue enviado: la anulacion del pago requiere revision manual.",
                               status.HTTP_409_CONFLICT, pedido)
            if pedido.estado == "pagado":
                pedido.estado = "pendiente"
                pedido.save(update_fields=["estado"])
                logger.info("Linkify: pago anulado, pedido %s vuelve a pendiente", pedido.pk)
        return Response({"exito": True, "mensaje": "Anulacion registrada.", "estado": pedido.estado})
