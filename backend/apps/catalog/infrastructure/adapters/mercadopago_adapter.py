from decimal import Decimal

import requests

from apps.catalog.domain.exceptions import PagoGatewayException
from apps.catalog.domain.ports.payment_gateway import (
    EstadoPago,
    PagoIniciado,
    PaymentGatewayPort,
    ResultadoPago,
)


class MercadoPagoAdapter(PaymentGatewayPort):
    """Adaptador de Mercado Pago  que implementa el puerto de pagos."""

    BASE_URL = "https://api.mercadopago.com"

    ESTADOS = {
        "approved": EstadoPago.APROBADO,
        "authorized": EstadoPago.PENDIENTE,
        "pending": EstadoPago.PENDIENTE,
        "in_process": EstadoPago.PENDIENTE,
        "in_mediation": EstadoPago.PENDIENTE,
        "rejected": EstadoPago.RECHAZADO,
        "cancelled": EstadoPago.RECHAZADO,
        "refunded": EstadoPago.RECHAZADO,
        "charged_back": EstadoPago.RECHAZADO,
    }

    def __init__(self, access_token: str, ambiente: str = "SANDBOX", moneda: str = "CLP"):
        self.access_token = str(access_token).strip()
        self.ambiente = str(ambiente).strip().upper()
        self.moneda = moneda

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def iniciar_pago(
        self,
        orden_compra: str,
        monto: Decimal,
        descripcion: str,
        url_retorno: str,
    ) -> PagoIniciado:
        monto = Decimal(str(monto))
        payload = {
            "items": [{
                "title": descripcion or f"Orden {orden_compra}",
                "quantity": 1,
                "currency_id": self.moneda,
                "unit_price": int(monto) if monto == monto.to_integral_value() else float(monto),
            }],
            "external_reference": str(orden_compra),
            "back_urls": {
                "success": url_retorno,
                "failure": url_retorno,
                "pending": url_retorno,
            },
        }

        datos = self._request("POST", f"{self.BASE_URL}/checkout/preferences", json=payload, timeout=15)

        url_pago = datos.get("sandbox_init_point") if self.ambiente == "SANDBOX" else datos.get("init_point")
        if not datos.get("id") or not url_pago:
            raise PagoGatewayException("Mercado Pago no devolvió la preferencia de pago esperada.")
        return PagoIniciado(referencia=str(datos["id"]), url_pago=url_pago)

    def consultar_pago(self, id_transaccion: str) -> ResultadoPago:
        datos = self._request("GET", f"{self.BASE_URL}/v1/payments/{id_transaccion}", timeout=20)

        status = datos.get("status", "")
        return ResultadoPago(
            id_transaccion=str(datos.get("id", id_transaccion)),
            orden_compra=str(datos.get("external_reference") or ""),
            monto=Decimal(str(datos.get("transaction_amount", 0))),
            estado=self.ESTADOS.get(status, EstadoPago.PENDIENTE),
            detalle_estado=datos.get("status_detail") or status,
        )

    def _request(self, metodo: str, url: str, **kwargs) -> dict:
        try:
            response = requests.request(metodo, url, headers=self._headers(), **kwargs)
        except requests.exceptions.RequestException as e:
            raise PagoGatewayException(f"Fallo de conexión con Mercado Pago: {e}")

        if response.status_code not in (200, 201):
            detalle = response.text
            try:
                detalle = response.json().get("message", detalle)
            except Exception:
                pass
            raise PagoGatewayException(f"Mercado Pago respondió con error (Status {response.status_code}): {detalle}")
        return response.json()
