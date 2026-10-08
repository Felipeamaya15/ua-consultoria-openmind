"""
Adaptador de integracion con Linkify (validador de transferencias bancarias).

Documentacion de referencia:
https://www.linkify.cl/documentos/integracion-sistema-externo.pdf
https://linkifyremoteintegration.docs.apiary.io/

IMPORTANTE: Linkify firma cada peticion con HMAC-SHA256 en el header
'X-Linkify-Confirmation', usando la clave privada del comercio. El metodo
exacto de codificacion (hex vs base64) y los nombres de campo del JSON de
notificacion no pudieron confirmarse con la documentacion publica disponible
al momento de escribir esto -- deben validarse con Linkify (ventas@linkify.cl)
o con una cuenta de prueba real antes de salir a produccion.
"""
import base64
import hashlib
import hmac
from urllib.parse import quote


class LinkifyAdapter:
    """Encapsula la logica especifica de Linkify, separada del caso de uso."""

    def __init__(self, id_cuenta: str, clave_privada: str):
        self.id_cuenta = id_cuenta
        self.clave_privada = clave_privada

    def url_de_pago(self, id_pago: str) -> str:
        """URL a la que se redirige al comprador para pagar via Linkify."""
        cuenta = quote(str(self.id_cuenta).strip(), safe="")
        pago = quote(str(id_pago).strip(), safe="")
        return f"https://app.linkify.cl/pay/{cuenta}/remote/{pago}"

    def firma_valida(self, cuerpo: bytes, firma_recibida: str) -> bool:
        """
        Verifica que una peticion entrante realmente viene de Linkify,
        comparando la firma HMAC-SHA256 con la clave privada del comercio.

        Acepta la firma codificada en hexadecimal o en base64.
        Sin clave privada o sin firma nunca es valida: un HMAC calculado con
        una clave vacia lo podria reproducir cualquiera.

        TODO: confirmar con Linkify la codificacion exacta y que se firma
        cuando la peticion es un GET sin cuerpo.
        """
        if not self.clave_privada or not firma_recibida:
            return False

        digest = hmac.new(
            self.clave_privada.encode("utf-8"),
            cuerpo or b"",
            hashlib.sha256,
        ).digest()
        firma = firma_recibida.strip()

        try:
            return hmac.compare_digest(digest.hex(), firma.lower()) or hmac.compare_digest(
                base64.b64encode(digest).decode("ascii"), firma
            )
        except TypeError:  # firma con caracteres no ASCII
            return False