import urllib.request
import urllib.parse
import urllib.error
import json
import base64
from decimal import Decimal
from typing import Dict, Any

from apps.catalog.domain.exceptions import PagoGatewayException
from apps.catalog.domain.ports.payment_gateway import (
    EstadoPago,
    PagoIniciado,
    PaymentGatewayPort,
    ResultadoPago,
)


class PayPalAdapter(PaymentGatewayPort):
    ESTADOS = {
        "COMPLETED": EstadoPago.APROBADO,
        "APPROVED": EstadoPago.PENDIENTE,
        "SAVED": EstadoPago.PENDIENTE,
        "CREATED": EstadoPago.PENDIENTE,
        "PAYER_ACTION_REQUIRED": EstadoPago.PENDIENTE,
        "VOIDED": EstadoPago.RECHAZADO,
    }

    def __init__(self, client_id: str, client_secret: str, ambiente: str = 'SANDBOX'):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = "https://api-m.sandbox.paypal.com" if ambiente == 'SANDBOX' else "https://api-m.paypal.com"

    def _get_access_token(self) -> str:
        auth_string = f"{self.client_id}:{self.client_secret}"
        base64_auth = base64.b64encode(auth_string.encode('ascii')).decode('ascii')
        
        url = f"{self.base_url}/v1/oauth2/token"
        data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode('utf-8')
        
        req = urllib.request.Request(url, data=data, method='POST')
        req.add_header("Authorization", f"Basic {base64_auth}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode())["access_token"]
        except Exception as e:
            raise ValueError(f"Error autenticando con PayPal: {str(e)}")

    def create_order(self, amount: float, currency: str, return_url: str, cancel_url: str, reference_id: str, descripcion: str = "") -> Dict[str, Any]:
        token = self._get_access_token()
        url = f"{self.base_url}/v2/checkout/orders"
        
        payload = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "reference_id": reference_id,
                "amount": {
                    "currency_code": currency,
                    "value": str(round(amount, 2))
                }
            }],
            "application_context": {
                "return_url": return_url,
                "cancel_url": cancel_url,
                "user_action": "PAY_NOW"
            }
        }
        
        if descripcion:
            payload["purchase_units"][0]["description"] = descripcion[:127]

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST')
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")
        
        try:
            with urllib.request.urlopen(req) as response:
                data_resp = json.loads(response.read().decode())
                approve_url = next((link['href'] for link in data_resp.get('links', []) if link['rel'] == 'approve'), None)
                
                return {
                    "exito": True,
                    "id": data_resp["id"],
                    "approve_url": approve_url
                }
        except urllib.error.HTTPError as e:
            raise ValueError(f"No se pudo crear la orden en PayPal: {e.reason}")

    def capture_order(self, order_id: str) -> Dict[str, Any]:
        token = self._get_access_token()
        url = f"{self.base_url}/v2/checkout/orders/{order_id}/capture"
        
        req = urllib.request.Request(url, data=b'', method='POST')
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")
        
        try:
            with urllib.request.urlopen(req) as response:
                data_resp = json.loads(response.read().decode())
                return {
                    "exito": data_resp.get("status") == "COMPLETED",
                    "data": data_resp
                }
        except urllib.error.HTTPError as e:
            return {
                "exito": False,
                "mensaje": f"No se pudo capturar el pago en PayPal: {e.reason}"
            }
    def iniciar_pago(
        self,
        orden_compra: str,
        monto: Decimal,
        descripcion: str,
        url_retorno: str,
        moneda: str = "USD",
    ) -> PagoIniciado:
        try:
            orden = self.create_order(
                amount=float(monto),
                currency=moneda,
                return_url=url_retorno,
                cancel_url=url_retorno,
                reference_id=str(orden_compra),
                descripcion=descripcion,
            )
        except ValueError as e:
            raise PagoGatewayException(str(e))
        if not orden.get("id") or not orden.get("approve_url"):
            raise PagoGatewayException("PayPal no devolvió la orden de pago esperada.")
        return PagoIniciado(referencia=str(orden["id"]), url_pago=orden["approve_url"])

    def consultar_pago(self, id_transaccion: str) -> ResultadoPago:
        token = self._get_access_token()
        url = f"{self.base_url}/v2/checkout/orders/{id_transaccion}"
        req = urllib.request.Request(url, method='GET')
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req) as response:
                datos = json.loads(response.read().decode())
        except urllib.error.HTTPError as e:
            raise PagoGatewayException(f"No se pudo consultar la orden en PayPal: {e.reason}")

        unidad = (datos.get("purchase_units") or [{}])[0]
        status = datos.get("status", "")
        return ResultadoPago(
            id_transaccion=str(datos.get("id", id_transaccion)),
            orden_compra=str(unidad.get("reference_id") or ""),
            monto=Decimal(str((unidad.get("amount") or {}).get("value", 0))),
            estado=self.ESTADOS.get(status, EstadoPago.PENDIENTE),
            detalle_estado=status,
        )
