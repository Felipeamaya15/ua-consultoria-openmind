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
import hashlib
import hmac


class LinkifyAdapter:
    """Encapsula la logica especifica de Linkify, separada del caso de uso."""

    def __init__(self, id_cuenta: str, clave_privada: str):
        self.id_cuenta = id_cuenta
        self.clave_privada = clave_privada

    def url_de_pago(self, id_pago: str) -> str:
        """URL a la que se redirige al comprador para pagar via Linkify."""
        return f"https://app.linkify.cl/pay/{self.id_cuenta}/remote/{id_pago}"

    def firma_valida(self, cuerpo: bytes, firma_recibida: str) -> bool:
        """
        Verifica que una peticion entrante (GET o POST) realmente viene de
        Linkify, comparando la firma HMAC-SHA256 del cuerpo con la clave
        privada del comercio.

        TODO: confirmar con Linkify si la firma se codifica en hexadecimal
        (como se asume aqui) o en base64, y que incluye exactamente el
        'cuerpo' firmado cuando la peticion es un GET sin body.
        """
        firma_calculada = hmac.new(
            self.clave_privada.encode("utf-8"),
            cuerpo,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(firma_calculada, firma_recibida)