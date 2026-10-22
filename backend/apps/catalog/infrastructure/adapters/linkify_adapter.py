
import urllib.request
import urllib.parse
import urllib.error
import json
from typing import Dict, Any
from django.conf import settings


class LinkifyAdapter:
    """
    Adaptador para verificar transferencias bancarias a través de Linkify.
    Implementado con librerías nativas (urllib) para evitar
    errores de dependencias en Docker.
    """

    def __init__(self, api_key: str, base_url: str = None):
        self.api_key = api_key
        self.base_url = base_url or getattr(
            settings,
            "LINKIFY_BASE_URL",
            "https://api.linkify.cl/v1"
        )

    def verificar_transferencia(
        self,
        order_number: str,
        amount: float
    ) -> Dict[str, Any]:
        """Consulta si una transferencia ha sido recibida en el banco."""

        params = urllib.parse.urlencode({
            "amount": round(amount),
            "reference": order_number,
        })
        url = f"{self.base_url}/bank-statements/verify?{params}"

        req = urllib.request.Request(url, method="GET")
        req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Content-Type", "application/json")

        try:
            # Tiempo máximo de espera: 8 segundos
            with urllib.request.urlopen(req, timeout=8) as response:
                data_resp = json.loads(
                    response.read().decode("utf-8")
                )

                if not isinstance(data_resp, dict):
                    raise ValueError("Respuesta inválida de Linkify")

                is_verified = (
                    data_resp.get("verified") is True
                    or data_resp.get("status") in ["PAID", "VERIFIED"]
                )

                return {
                    "exito": True,
                    "verificado": is_verified,
                    "data": data_resp,
                }

        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            OSError,
            ValueError,
            UnicodeError,
        ):
            return {
                "exito": False,
                "verificado": False,
                "codigo": "LINKIFY_NO_DISPONIBLE",
                "mensaje": (
                    "No se pudo consultar Linkify en este momento. "
                    "Intenta nuevamente."
                ),
            }
