"""Firma y validación de cotizaciones de Blue Express."""

from django.core import signing


QUOTE_SALT = "shipping.blue_express.quote.v1"
QUOTE_MAX_AGE = 15 * 60


class BlueExpressQuoteError(ValueError):
    """La cotización no puede utilizarse para el pedido."""


def _json_copy(value):
    """Exige datos JSON y elimina referencias a objetos mutables."""
    import json

    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError):
        raise BlueExpressQuoteError(
            "La cotización contiene datos que no se pueden firmar."
        ) from None


def issue_quote_token(*, context, quote):
    """
    Firma datos construidos por el backend.

    context y quote no deben copiarse directamente desde una petición.
    """
    if not isinstance(context, dict) or not context:
        raise BlueExpressQuoteError("Falta el contexto de la cotización.")

    if not isinstance(quote, dict) or not quote:
        raise BlueExpressQuoteError("Faltan los datos de la cotización.")

    payload = {
        "version": 1,
        "context": _json_copy(context),
        "quote": _json_copy(quote),
    }

    return signing.dumps(
        payload,
        salt=QUOTE_SALT,
        compress=True,
    )


def validate_quote_token(*, token, expected_context):
    """
    Verifica firma, antigüedad y coincidencia con el contexto actual.

    expected_context debe reconstruirse desde el catálogo y la
    configuración actuales, junto con el destino validado del pedido.
    """
    if not isinstance(token, str) or not token:
        raise BlueExpressQuoteError("Falta la cotización de Blue Express.")

    try:
        payload = signing.loads(
            token,
            salt=QUOTE_SALT,
            max_age=QUOTE_MAX_AGE,
        )
    except signing.SignatureExpired:
        raise BlueExpressQuoteError(
            "La cotización venció. Vuelve a cotizar el envío."
        ) from None
    except (signing.BadSignature, ValueError, TypeError):
        raise BlueExpressQuoteError(
            "La cotización es inválida. Vuelve a cotizar el envío."
        ) from None

    if (
        not isinstance(payload, dict)
        or payload.get("version") != 1
        or not isinstance(payload.get("context"), dict)
        or not isinstance(payload.get("quote"), dict)
        or not payload["quote"]
    ):
        raise BlueExpressQuoteError("La cotización tiene un formato inválido.")

    if (
        not isinstance(expected_context, dict)
        or not expected_context
        or payload["context"] != _json_copy(expected_context)
    ):
        raise BlueExpressQuoteError(
            "El carrito, el destino o la configuración cambiaron. "
            "Vuelve a cotizar el envío."
        )

    return payload["quote"]