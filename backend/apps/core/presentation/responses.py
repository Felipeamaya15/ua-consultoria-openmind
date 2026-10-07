from rest_framework.response import Response
from rest_framework import status as http_status


def success_response(data=None, mensaje="", status=http_status.HTTP_200_OK, paginacion=None):
    body = {
        "exito": True,
        "mensaje": mensaje,
        "data": data,
    }
    if paginacion is not None:
        body["paginacion"] = paginacion
    return Response(body, status=status)


def error_response(mensaje, codigo, detalles=None, status=http_status.HTTP_400_BAD_REQUEST):
    return Response(
        {
            "exito": False,
            "mensaje": mensaje,
            "error": {
                "codigo": codigo,
                "detalles": detalles,
            },
        },
        status=status,
    )
