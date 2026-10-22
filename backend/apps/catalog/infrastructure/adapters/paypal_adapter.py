import base64
import json
import math
import socket
import urllib.error
import urllib.parse
import urllib.request
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
    DEFAULT_TIMEOUT = 15

    ESTADOS = {
        "COMPLETED": EstadoPago.APROBADO,
        "APPROVED": EstadoPago.PENDIENTE,
        "SAVED": EstadoPago.PENDIENTE,
        "CREATED": EstadoPago.PENDIENTE,
        "PAYER_ACTION_REQUIRED": EstadoPago.PENDIENTE,
        "VOIDED": EstadoPago.RECHAZADO,
    }

    def __init__(self, client_id: str, client_secret: str, ambiente: str = 'SANDBOX', timeout: float = DEFAULT_TIMEOUT):
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("El tiempo de espera de PayPal debe ser un número positivo.")
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = float(timeout)
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
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode())["access_token"]
        except (TimeoutError, socket.timeout) as exc:
            raise ValueError("Tiempo de espera agotado al autenticar con PayPal.") from exc
        except urllib.error.URLError as exc:
            if isinstance(getattr(exc, "reason", None), (TimeoutError, socket.timeout)):
                raise ValueError("Tiempo de espera agotado al autenticar con PayPal.") from exc
            raise ValueError("Error autenticando con PayPal: servicio no disponible.") from exc
        except Exception as exc:
            raise ValueError("Error autenticando con PayPal.") from exc

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
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                data_resp = json.loads(response.read().decode())
                approve_url = next((link['href'] for link in data_resp.get('links', []) if link['rel'] == 'approve'), None)
                
                return {
                    "exito": True,
                    "id": data_resp["id"],
                    "approve_url": approve_url
                }
        except (TimeoutError, socket.timeout) as exc:
            raise ValueError("Tiempo de espera agotado al crear la orden en PayPal.") from exc
        except urllib.error.HTTPError as e:
            raise ValueError(f"No se pudo crear la orden en PayPal: {e.reason}")
        except urllib.error.URLError as exc:
            if isinstance(getattr(exc, "reason", None), (TimeoutError, socket.timeout)):
                raise ValueError("Tiempo de espera agotado al crear la orden en PayPal.") from exc
            raise ValueError("No se pudo conectar con PayPal en este momento.") from exc

    def capture_order(self, order_id: str) -> Dict[str, Any]:
        try:
            token = self._get_access_token()
        except ValueError as exc:
            return {
                "exito": False,
                "codigo": "PAYPAL_TIMEOUT" if "Tiempo de espera" in str(exc) else "PAYPAL_ERROR",
                "mensaje": str(exc),
            }
        url = f"{self.base_url}/v2/checkout/orders/{order_id}/capture"
        
        req = urllib.request.Request(url, data=b'', method='POST')
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")
        
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                data_resp = json.loads(response.read().decode())
                return {
                    "exito": data_resp.get("status") == "COMPLETED",
                    "data": data_resp
                }
        except (TimeoutError, socket.timeout):
            return {
                "exito": False,
                "codigo": "PAYPAL_TIMEOUT",
                "mensaje": "Tiempo de espera agotado al capturar el pago en PayPal.",
            }
        except urllib.error.HTTPError as e:
            return {
                "exito": False,
                "mensaje": f"No se pudo capturar el pago en PayPal: {e.reason}"
            }
        except urllib.error.URLError as exc:
            if isinstance(getattr(exc, "reason", None), (TimeoutError, socket.timeout)):
                return {
                    "exito": False,
                    "codigo": "PAYPAL_TIMEOUT",
                    "mensaje": "Tiempo de espera agotado al capturar el pago en PayPal.",
                }
            return {
                "exito": False,
                "mensaje": "No se pudo conectar con PayPal para capturar el pago.",
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
        try:
            token = self._get_access_token()
        except ValueError as exc:
            raise PagoGatewayException(str(exc)) from exc
        url = f"{self.base_url}/v2/checkout/orders/{id_transaccion}"
        req = urllib.request.Request(url, method='GET')
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                datos = json.loads(response.read().decode())
        except (TimeoutError, socket.timeout) as exc:
            raise PagoGatewayException("Tiempo de espera agotado al consultar la orden en PayPal.") from exc
        except urllib.error.HTTPError as e:
            raise PagoGatewayException(f"No se pudo consultar la orden en PayPal: {e.reason}")
        except urllib.error.URLError as exc:
            if isinstance(getattr(exc, "reason", None), (TimeoutError, socket.timeout)):
                raise PagoGatewayException("Tiempo de espera agotado al consultar la orden en PayPal.") from exc
            raise PagoGatewayException("No se pudo conectar con PayPal para consultar la orden.") from exc

        unidad = (datos.get("purchase_units") or [{}])[0]
        status = datos.get("status", "")
        return ResultadoPago(
            id_transaccion=str(datos.get("id", id_transaccion)),
            orden_compra=str(unidad.get("reference_id") or ""),
            monto=Decimal(str((unidad.get("amount") or {}).get("value", 0))),
            estado=self.ESTADOS.get(status, EstadoPago.PENDIENTE),
            detalle_estado=status,
        )