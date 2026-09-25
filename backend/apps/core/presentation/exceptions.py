from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.exceptions import ValidationError
from apps.core.infrastructure.tenant import ErrorConfiguracionTienda

ERROR_CODES_BY_STATUS = {
    400: "SOLICITUD_INVALIDA",
    401: "NO_AUTENTICADO",
    403: "ACCESO_DENEGADO",
    404: "RECURSO_NO_ENCONTRADO",
    405: "METODO_NO_PERMITIDO",
    429: "DEMASIADAS_SOLICITUDES",
    500: "ERROR_INTERNO",
}

DEFAULT_MESSAGES_BY_STATUS = {
    401: "No se encontraron credenciales de autenticación válidas",
    403: "No tienes permiso para realizar esta acción",
    404: "El recurso solicitado no fue encontrado",
    405: "El método HTTP utilizado no está permitido para este recurso",
    429: "Se realizaron demasiadas solicitudes, intenta nuevamente más tarde",
    500: "Ocurrió un error interno en el servidor",
}


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, ValidationError):
        codigo = "ERROR_VALIDACION"
        mensaje = "Los datos enviados contienen errores de validación"
        detalles = response.data if isinstance(response.data, (dict, list)) else None
    else:
        codigo = (
            exc.default_code if isinstance(exc, ErrorConfiguracionTienda)
            else ERROR_CODES_BY_STATUS.get(response.status_code, "ERROR")
        )
        detail = response.data.get("detail") if isinstance(response.data, dict) else None
        mensaje = str(detail) if detail else DEFAULT_MESSAGES_BY_STATUS.get(
            response.status_code, "Ocurrió un error al procesar la solicitud"
        )
        detalles = None

    response.data = {
        "exito": False,
        "mensaje": mensaje,
        "error": {"codigo": codigo, "detalles": detalles},
    }
    return response
