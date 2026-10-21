from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.legal import (
    CANONICAL_TYPES,
    create_legal_for_store,
    get_version_vigente,
    legal_for_store,
    normalize_legal_type,
    publish_legal_for_store,
    save_legal_for_store,
    update_legal_for_store,
)
from apps.core.presentation.responses import error_response, success_response


def _first_present(data, *keys):
    """Devuelve el primer campo enviado, conservando valores vacíos para validarlos."""
    for key in keys:
        if key in data:
            return data[key]
    return None


def _requested_legal_type(data):
    return _first_present(data, 'tipo', 'type', 'pageType', 'page')


class ConsultaVersionVigenteAPIView(APIView):
    """Implementa la consulta de la versión vigente de las páginas legales en el e-commerce."""

    permission_classes = [AllowAny]

    def get(self, request, tipo=None):
        tienda = resolver_tienda(request)
        raw_type = tipo or request.query_params.get('tipo') or request.query_params.get('type')

        if raw_type and raw_type != 'all':
            canonical = normalize_legal_type(raw_type)
            if not canonical:
                return error_response(
                    mensaje=f"Tipo de página legal no encontrado. Opciones: {', '.join(CANONICAL_TYPES)}",
                    codigo="PAGINA_NO_ENCONTRADA",
                    status=status.HTTP_404_NOT_FOUND,
                )
            version_data = get_version_vigente(tienda, canonical)
            return success_response(
                data=version_data,
                mensaje=f"Versión vigente de {version_data['title']} obtenida correctamente.",
                status=status.HTTP_200_OK,
            )

        versiones = get_version_vigente(tienda)
        return success_response(
            data=versiones,
            mensaje="Versiones vigentes obtenidas correctamente.",
            status=status.HTTP_200_OK,
        )


class PaginasLegalesPublicasAPIView(APIView):
    """Consulta pública de las páginas legales vigentes de la tienda (Términos, Privacidad, Reembolsos)."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        tienda = resolver_tienda(request)
        pages = legal_for_store(tienda, for_admin=False)
        return success_response(
            data=pages,
            mensaje="Páginas legales obtenidas correctamente.",
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """Creación de contenido legal desde el endpoint raíz."""
        tienda = resolver_tienda(request, exigir_propietario=True)
        pages = create_legal_for_store(tienda, request.data)
        return success_response(
            data=pages,
            mensaje="Contenido legal creado correctamente.",
            status=status.HTTP_201_CREATED,
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
    """Panel de administración: consulta, creación y actualización de borradores y contenido legal."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        pages = legal_for_store(tienda, for_admin=True)
        return success_response(
            data=pages,
            mensaje="Configuración legal obtenida correctamente.",
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """Implementa la creación de contenido legal."""
        tienda = resolver_tienda(request, exigir_propietario=True)
        pages = create_legal_for_store(tienda, request.data)
        return success_response(
            data=pages,
            mensaje="Contenido legal creado correctamente.",
            status=status.HTTP_201_CREATED,
        )

    def put(self, request):
        """Implementa la actualización y publicación de contenido legal."""
        tienda = resolver_tienda(request, exigir_propietario=True)
        accion = request.data.get('accion') or request.data.get('action')

        if accion == 'publish':
            raw_type = _requested_legal_type(request.data)
            if raw_type is None:
                raise ValidationError({'tipo': 'Debes indicar una página legal válida.'})

            content = _first_present(request.data, 'content', 'published', 'draft')
            if content is None:
                raise ValidationError({'content': 'El contenido legal es obligatorio.'})

            pages = publish_legal_for_store(tienda, raw_type, content)
            return success_response(
                data=pages,
                mensaje="Contenido legal publicado correctamente.",
                status=status.HTTP_200_OK,
            )

        pages = update_legal_for_store(tienda, request.data)
        return success_response(
            data=pages,
            mensaje="Contenido legal actualizado correctamente.",
            status=status.HTTP_200_OK,
        )

    def patch(self, request):
        return self.put(request)


class PublicarContenidoLegalAPIView(APIView):
    """Implementa la publicación de contenido legal en la tienda."""

    permission_classes = [IsAuthenticated]

    def post(self, request, tipo=None):
        tienda = resolver_tienda(request, exigir_propietario=True)
        target_tipo = tipo if tipo is not None else _requested_legal_type(request.data)
        if target_tipo is None:
            raise ValidationError({'tipo': 'Debes indicar una página legal válida.'})

        content = _first_present(request.data, 'content', 'published', 'draft')
        if content is None:
            raise ValidationError({'content': 'El contenido legal es obligatorio.'})

        pages = publish_legal_for_store(tienda, target_tipo, content)
        return success_response(
            data=pages,
            mensaje="Contenido legal publicado correctamente.",
            status=status.HTTP_200_OK,
        )
