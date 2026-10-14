from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.legal import (
    CANONICAL_TYPES,
    legal_for_store,
    normalize_legal_type,
    save_legal_for_store,
)
from apps.core.presentation.responses import error_response, success_response


class PaginasLegalesPublicasAPIView(APIView):
    """Consulta pública de las páginas legales vigentes de la tienda (Términos, Privacidad, Reembolsos)."""

    permission_classes = [AllowAny]

    def get(self, request):
        tienda = resolver_tienda(request)
        pages = legal_for_store(tienda, for_admin=False)
        return success_response(
            data=pages,
            mensaje="Páginas legales obtenidas correctamente.",
            status=status.HTTP_200_OK,
        )


class PaginaLegalDetalleAPIView(APIView):
    """Consulta pública de una página legal específica."""

    permission_classes = [AllowAny]

    def get(self, request, tipo):
        tienda = resolver_tienda(request)
        canonical = normalize_legal_type(tipo)
        if not canonical:
            return error_response(
                mensaje=f"Tipo de página legal no encontrado. Opciones: {', '.join(CANONICAL_TYPES)}",
                codigo="PAGINA_NO_ENCONTRADA",
                status=status.HTTP_404_NOT_FOUND,
            )

        pages = legal_for_store(tienda, for_admin=False)
        page_data = pages.get(canonical)
        return success_response(
            data={"tipo": canonical, **page_data},
            mensaje="Página legal obtenida correctamente.",
            status=status.HTTP_200_OK,
        )


class ConfiguracionLegalAPIView(APIView):
    """Panel de administración: consulta y edición de borradores y versiones publicadas."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        pages = legal_for_store(tienda, for_admin=True)
        return success_response(
            data=pages,
            mensaje="Configuración legal obtenida correctamente.",
            status=status.HTTP_200_OK,
        )

    def put(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        pages = save_legal_for_store(tienda, request.data)
        return success_response(
            data=pages,
            mensaje="Configuración legal guardada correctamente.",
            status=status.HTTP_200_OK,
        )

    def patch(self, request):
        return self.put(request)
