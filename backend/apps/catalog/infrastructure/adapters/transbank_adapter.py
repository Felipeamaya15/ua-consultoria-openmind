import json
import requests
from typing import Dict, Any
from apps.catalog.domain.ports.transbank_gateway import TransbankGatewayPort
from apps.catalog.domain.exceptions import (
    TransbankTransaccionException,
    TransbankRechazoException,
)


class TransbankWebpayAdapter(TransbankGatewayPort):
    """
    Adaptador concreto que implementa la comunicación directa con
    la API REST de Webpay Plus de Transbank.
    """

    URL_INTEGRACION = "https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.0/transactions"
    URL_PRODUCCION = "https://webpay3g.transbank.cl/rswebpaytransaction/api/webpay/v1.0/transactions"

    def __init__(self, codigo_comercio: str, api_key: str, ambiente: str = "INTEGRACION"):
        self.codigo_comercio = str(codigo_comercio).strip()
        self.api_key = str(api_key).strip()
        self.ambiente = str(ambiente).strip().upper()
        self.base_url = (
            self.URL_PRODUCCION if self.ambiente == "PRODUCCION" else self.URL_INTEGRACION
        )

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Tbk-Api-Key-Id": self.codigo_comercio,
            "Tbk-Api-Key-Secret": self.api_key,
            "Content-Type": "application/json",
        }

    def iniciar_transaccion(
        self,
        orden_compra: str,
        session_id: str,
        monto: int,
        return_url: str,
    ) -> Dict[str, Any]:
        payload = {
            "buy_order": str(orden_compra),
            "session_id": str(session_id),
            "amount": int(monto),
            "return_url": return_url,
        }

        try:
            response = requests.post(
                self.base_url,
                headers=self._get_headers(),
                data=json.dumps(payload),
                timeout=15,
            )
        except requests.exceptions.RequestException as e:
            raise TransbankTransaccionException(
                f"Fallo de conexión al contactar a Transbank: {str(e)}"
            )

        if response.status_code != 200:
            detalle = response.text
            try:
                detalle = response.json().get("error_message", detalle)
            except Exception:
                pass
            raise TransbankTransaccionException(
                f"Transbank rechazó la inicialización de pago (Status {response.status_code}): {detalle}"
            )

        datos = response.json()
        return {
            "token": datos.get("token"),
            "url": datos.get("url"),
        }

    def confirmar_transaccion(self, token_ws: str) -> Dict[str, Any]:
        endpoint = f"{self.base_url}/{token_ws}"

        try:
            response = requests.put(
                endpoint,
                headers=self._get_headers(),
                timeout=20,
            )
        except requests.exceptions.RequestException as e:
            raise TransbankTransaccionException(
                f"Fallo de conexión al confirmar el pago en Transbank: {str(e)}"
            )

        if response.status_code != 200:
            raise TransbankTransaccionException(
                f"Error en respuesta de confirmación de Transbank (Status {response.status_code})"
            )

        datos = response.json()
        response_code = datos.get("response_code")
        status = datos.get("status")

        # response_code 0 y status AUTHORIZED garantizan pago exitoso en Webpay
        if response_code != 0 or status != "AUTHORIZED":
            raise TransbankRechazoException(
                f"La transacción fue rechazada por la entidad emisora (Código de respuesta: {response_code}, Estado: {status})"
            )

        return {
            "orden_compra": datos.get("buy_order"),
            "session_id": datos.get("session_id"),
            "codigo_autorizacion": datos.get("authorization_code"),
            "monto": datos.get("amount"),
            "tipo_pago": datos.get("payment_type_code"),
            "ultimos_4_digitos": datos.get("card_detail", {}).get("card_number"),
            "fecha_transaccion": datos.get("transaction_date"),
            "estado": status,
            "vci": datos.get("vci"),
        }