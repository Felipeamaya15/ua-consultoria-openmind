"""Cliente HTTP de Blue Express, sin reintentos automáticos."""

import requests

from .config import get_service_config


class BlueExpressAPIError(Exception):
    """Error controlado al comunicarse con Blue Express."""


class BlueExpressTimeoutError(BlueExpressAPIError):
    """No se recibió una respuesta dentro del tiempo establecido."""


class BlueExpressClient:
    def request_json(self, service, *, method="GET", payload=None):
        config = get_service_config(service)

        method = method.upper()
        if method not in {"GET", "POST"}:
            raise BlueExpressAPIError("Método HTTP no permitido.")

        # Emisión, etiquetas y tracking se incorporarán después de
        # verificar sus contratos y encabezados específicos.
        if service not in {"geo", "pricing"}:
            raise BlueExpressAPIError(
                "Este servicio todavía no está implementado."
            )

        headers = {
            "BX-TOKEN": config["token"],
            "BX-USERCODE": config["usercode"],
            "BX-CLIENT_ACCOUNT": config["client_account"],
            "Accept": "application/json",
        }

        try:
            response = requests.request(
                method=method,
                url=config["url"],
                headers=headers,
                json=payload,
                timeout=config["timeout"],
                allow_redirects=False,
            )
        except requests.Timeout:
            raise BlueExpressTimeoutError(
                "Blue Express tardó demasiado en responder."
            ) from None
        except requests.RequestException:
            raise BlueExpressAPIError(
                "No se pudo establecer comunicación con Blue Express."
            ) from None

        try:
            if response.status_code in {401, 403}:
                raise BlueExpressAPIError(
                    "Blue Express rechazó las credenciales o los permisos."
                )

            if response.status_code == 429:
                raise BlueExpressAPIError(
                    "Blue Express alcanzó el límite de solicitudes."
                )

            if not 200 <= response.status_code < 300:
                raise BlueExpressAPIError(
                    f"Blue Express devolvió HTTP {response.status_code}."
                )

            try:
                data = response.json()
            except ValueError:
                raise BlueExpressAPIError(
                    "Blue Express devolvió una respuesta que no es JSON válido."
                ) from None

            if not isinstance(data, (dict, list)):
                raise BlueExpressAPIError(
                    "Blue Express devolvió una estructura JSON inesperada."
                )

            if isinstance(data, dict) and data.get("status") is False:
                raise BlueExpressAPIError(
                    "Blue Express rechazó la operación. "
                    "Verifica las credenciales y la habilitación del servicio."
                )

            return data

        finally:
            response.close()