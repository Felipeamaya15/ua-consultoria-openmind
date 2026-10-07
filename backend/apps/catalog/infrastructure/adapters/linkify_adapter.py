import urllib.request
import urllib.parse
import urllib.error
import json
from typing import Dict, Any
from django.conf import settings

class LinkifyAdapter:
    """
    Adaptador para verificar transferencias bancarias a través de Linkify.
    Implementado con librerías nativas (urllib) para evitar errores de dependencias en Docker.
    """
    def __init__(self, api_key: str, base_url: str = None):
        self.api_key = api_key
        self.base_url = base_url or getattr(settings, "LINKIFY_BASE_URL", "https://api.linkify.cl/v1")

    def verificar_transferencia(self, order_number: str, amount: float) -> Dict[str, Any]:
        """Consulta si una transferencia por un monto específico ha sido recibida en el banco."""
        url = f"{self.base_url}/bank-statements/verify?amount={round(amount)}&reference={order_number}"
        
        req = urllib.request.Request(url, method='GET')
        req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Content-Type", "application/json")
        
        try:
            with urllib.request.urlopen(req) as response:
                data_resp = json.loads(response.read().decode())
                
                is_verified = data_resp.get("verified") is True or data_resp.get("status") in ["PAID", "VERIFIED"]
                
                return {
                    "exito": True,
                    "verificado": is_verified,
                    "data": data_resp
                }
        except urllib.error.HTTPError as e:
            return {
                "exito": False, 
                "verificado": False, 
                "mensaje": f"Linkify no pudo verificar la transferencia (HTTP {e.code}): {e.reason}"
            }
        except Exception as e:
            return {
                "exito": False, 
                "verificado": False, 
                "mensaje": f"Entorno Sandbox simulado: No se encontró el endpoint de Linkify ({str(e)}). Verificación rechazada controladamente."
            }