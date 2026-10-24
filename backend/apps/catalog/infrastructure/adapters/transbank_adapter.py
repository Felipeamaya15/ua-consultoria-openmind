
import json
import requests
from typing import Dict, Any

from apps.catalog.domain.ports.transbank_gateway import TransbankGatewayPort
from apps.catalog.domain.exceptions import (
    TransbankTransaccionException,
    TransbankRechazoException,
    TransbankServicioNoDisponibleException,
)


class TransbankWebpayAdapter(TransbankGatewayPort):
    """
    Adaptador concreto que implementa la comunicación directa
    con la API REST de Webpay Plus de Transbank.
    """

    URL_INTEGRACION = (
        "https://webpay3gint.transbank.cl/"
        "rswebpaytransaction/api/webpay/v1.0/transactions"
    )

    URL_PRODUCCION = (
        "https://webpay3g.transbank.cl/"
        "rswebpaytransaction/api/webpay/v1.0/transactions"
    )

    def __init__(
        self,
        codigo_comercio: str,
        api_key: str,
        ambiente: str = "INTEGRACION",
    ):
        self.codigo_comercio = str(codigo_comercio).strip()
        self.api_key = str(api_key).strip()
        self.ambiente = str(ambiente).strip().upper()

        self.base_url = (
            self.URL_PRODUCCION
            if self.ambiente == "PRODUCCION"
            else self.URL_INTEGRACION
        )

    def _get_headers(self) -> Dict[str, str]:
        """
        Las credenciales se envian exclusivamente desde
        el backend hacia Transbank.

        No se incluyen en las respuestas de nuestra API.
        """
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
        """
        Inicia una transaccion Webpay.

        Nunca devuelve errores tecnicos originales
        ni respuestas crudas del proveedor.
        """
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

        except requests.exceptions.RequestException:
            raise TransbankServicioNoDisponibleException(
                "Webpay no responde en este momento. "
                "Intenta nuevamente mas tarde."
            ) from None

        if response.status_code == 429 or response.status_code >= 500:
            raise TransbankServicioNoDisponibleException(
                "Webpay no esta disponible temporalmente. "
                "Intenta nuevamente mas tarde."
            )

        if response.status_code != 200:
            raise TransbankTransaccionException(
                "Webpay rechazo el inicio de la transaccion."
            )

        try:
            datos = response.json()

        except (ValueError, TypeError):
            raise TransbankTransaccionException(
                "Webpay devolvio una respuesta invalida."
            ) from None

        if not isinstance(datos, dict) or not all(
            isinstance(datos.get(campo), str)
            and datos[campo].strip()
            for campo in ("token", "url")
        ):
            raise TransbankTransaccionException(
                "Webpay devolvio una respuesta incompleta."
            )

        return {
            "token": datos["token"],
            "url": datos["url"],
        }

    def confirmar_transaccion(
        self,
        token_ws: str,
    ) -> Dict[str, Any]:
        """
        Confirma una transaccion Webpay.

        El resultado solo se considera aprobado
        si response_code es 0 y status es AUTHORIZED.
        """
        endpoint = f"{self.base_url}/{token_ws}"

        try:
            response = requests.put(
                endpoint,
                headers=self._get_headers(),
                timeout=20,
            )

        except requests.exceptions.RequestException:
            raise TransbankServicioNoDisponibleException(
                "No se pudo contactar a Webpay para confirmar "
                "el pago. Intenta nuevamente."
            ) from None

        if response.status_code == 429 or response.status_code >= 500:
            raise TransbankServicioNoDisponibleException(
                "Webpay no esta disponible temporalmente. "
                "Intenta nuevamente mas tarde."
            )

        if response.status_code != 200:
            raise TransbankTransaccionException(
                "Webpay rechazo la confirmacion del pago."
            )

        try:
            datos = response.json()

        except (ValueError, TypeError):
            raise TransbankTransaccionException(
                "Webpay devolvio una confirmacion invalida."
            ) from None

        if not isinstance(datos, dict):
            raise TransbankTransaccionException(
                "Webpay devolvio una confirmacion invalida."
            )

        response_code = datos.get("response_code")
        status = datos.get("status")

        # Un pago solo se aprueba cuando Transbank confirma
        # ambos valores esperados.
        if response_code != 0 or status != "AUTHORIZED":
            raise TransbankRechazoException(
                "La transaccion fue rechazada. "
                "Verifica tus datos o utiliza otro medio de pago."
            )

        return {
            "orden_compra": datos.get("buy_order"),
            "session_id": datos.get("session_id"),
            "codigo_autorizacion": datos.get("authorization_code"),
            "monto": datos.get("amount"),
            "tipo_pago": datos.get("payment_type_code"),
            "ultimos_4_digitos": (
                datos.get("card_detail") or {}
            ).get("card_number"),
            "fecha_transaccion": datos.get("transaction_date"),
            "estado": status,
            "vci": datos.get("vci"),
        }
