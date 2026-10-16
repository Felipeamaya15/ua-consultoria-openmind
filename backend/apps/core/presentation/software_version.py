"""Capa de presentación para la consulta de la versión vigente del software."""

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.presentation.responses import error_response, success_response
from apps.core.software_version import get_software_version_info


class SoftwareVersionAPIView(APIView):
    """Implementa el endpoint REST para la consulta de la versión vigente del software."""

    permission_classes = [AllowAny]

    def get(self, request):
        info = get_software_version_info()

        # Validación de consulta por campo específico opcional (?campo=version)
        campo = request.query_params.get("campo")
        if campo:
            campo_limpio = campo.strip().lower()
            if campo_limpio in info:
                return success_response(
                    data={campo_limpio: info[campo_limpio]},
                    mensaje=f"Campo '{campo_limpio}' de la versión vigente del software obtenido correctamente.",
                    status=status.HTTP_200_OK,
                )
            return error_response(
                mensaje=f"Campo '{campo}' no encontrado en la versión vigente del software. Opciones válidas: {', '.join(info.keys())}",
                codigo="CAMPO_NO_ENCONTRADO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        return success_response(
            data=info,
            mensaje="Versión vigente del software obtenida correctamente.",
            status=status.HTTP_200_OK,
        )
