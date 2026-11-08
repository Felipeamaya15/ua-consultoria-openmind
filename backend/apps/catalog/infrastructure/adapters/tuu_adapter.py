"""Adaptador de TUU (Haulmer) Pago Online.  (SCRUM-509).

Documentación: https://developers.tuu.cl/docs/payment-intent
- Autenticación: x_account_id + llave secreta (HMAC-SHA256 sobre los campos x_*)
"""
import hashlib
import hmac
import json
from typing import Any, Dict, Mapping

import requests

from apps.catalog.domain.exceptions import PagoGatewayException

URL_INTEGRACION = "https://frontend-api.payment.haulmer.dev/v1/payment"
URL_PRODUCCION = "https://core.payment.haulmer.com/api/v1/payment"


class TuuServicioNoDisponibleException(PagoGatewayException):
    """TUU no responde o respondió con error temporal."""


class TuuTransaccionException(PagoGatewayException):
    """TUU rechazó o devolvió una respuesta inválida al crear el intento de pago."""


def firmar(parametros: Mapping[str, Any], llave_secreta: str) -> str:
    """HMAC-SHA256 (hex) de las claves x_* (sin x_signature) ordenadas, como clave+valor concatenados."""
    base = "".join(
        f"{clave}{parametros[clave]}"
        for clave in sorted(parametros)
        if clave.startswith("x_") and clave != "x_signature"
    )
    return hmac.new(llave_secreta.encode("utf-8"), base.encode("utf-8"), hashlib.sha256).hexdigest()


def firma_valida(parametros: Mapping[str, Any], llave_secreta: str) -> bool:
    recibida = str(parametros.get("x_signature") or "")
    return bool(recibida) and hmac.compare_digest(recibida.lower(), firmar(parametros, llave_secreta))


class TuuPagoOnlineAdapter:
    def __init__(self, account_id: str, llave_secreta: str, ambiente: str = "integracion"):
        self.account_id = str(account_id).strip()
        self.llave_secreta = str(llave_secreta).strip()
        self.url = URL_PRODUCCION if str(ambiente).lower() in ("production", "produccion") else URL_INTEGRACION

    def crear_intento(self, *, referencia: str, monto: int, email: str, nombre: str, apellido: str,
                      telefono: str, descripcion: str, tienda: str, url_callback: str,
                      url_complete: str, url_cancel: str) -> str:
        """Crea el intento de pago y devuelve la URL a la que debe ir el comprador."""
        cuerpo: Dict[str, Any] = {
            "x_account_id": self.account_id,
            "x_amount": int(monto),
            "x_currency": "CLP",
            "x_customer_email": email,
            "x_customer_first_name": nombre or "Cliente",
            "x_customer_last_name": apellido or "-",
            "x_customer_phone": telefono or "+56900000000",
            "x_description": descripcion[:200],
            "x_reference": str(referencia),
            "x_shop_name": tienda[:100],
            "x_url_callback": url_callback,
            "x_url_cancel": url_cancel,
            "x_url_complete": url_complete,
        }
        cuerpo["x_signature"] = firmar(cuerpo, self.llave_secreta)
        try:
            respuesta = requests.post(
                self.url, data=json.dumps(cuerpo), timeout=15,
                headers={"Content-Type": "application/json", "X-REDIRECT": "false"},
            )
        except requests.exceptions.RequestException:
            raise TuuServicioNoDisponibleException(
                "TUU no responde en este momento. Intenta nuevamente más tarde.") from None
        if respuesta.status_code == 429 or respuesta.status_code >= 500:
            raise TuuServicioNoDisponibleException("TUU no está disponible temporalmente.")
        if respuesta.status_code >= 400:
            raise TuuTransaccionException("TUU rechazó el inicio del pago.")
        try:
            datos = respuesta.json()
        except (ValueError, TypeError):
            datos = None

        if isinstance(datos, dict):
            for clave in ("url", "redirect_url", "redirectUrl", "payment_url", "paymentUrl"):
                valor = datos.get(clave)
                if isinstance(valor, str) and valor.startswith("https://"):
                    return valor
        raise TuuTransaccionException("TUU devolvió una respuesta sin URL de pago.")
