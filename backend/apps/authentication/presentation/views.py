from .serializers import GoogleLoginRequestSerializer
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django.contrib.auth import get_user_model

from apps.core.presentation.responses import success_response, error_response
from apps.authentication.domain.exceptions import (
    AuthException,
    InvalidCredentialsException,
    UserAlreadyExistsException,
    UserNotFoundException,
    WeakPasswordException,
)
from apps.authentication.application.use_cases import (
    RegisterUserUseCase,
    RegisterUserDTO,
    LoginUseCase,
    GoogleLoginUseCase
)
from apps.authentication.infrastructure.repositories import DjangoUserRepository
from .serializers import (
    RegisterRequestSerializer,
    LoginRequestSerializer,
    UserResponseSerializer,
)
from apps.core.models import Tienda

from apps.authentication.application.use_cases import (
    RegisterUserUseCase,
    RegisterUserDTO,
    LoginUseCase,
    GoogleLoginUseCase,
    GuardarConfiguracionAutenticacionUseCase,
    GuardarConfiguracionAutenticacionDTO,
    ConsultarConfiguracionAutenticacionUseCase,
    GuardarConfiguracionPagosUseCase,
    GuardarConfiguracionPagosDTO,
    ConsultarConfiguracionPagosUseCase,
)

from apps.authentication.infrastructure.repositories import (
    DjangoUserRepository,
    DjangoConfiguracionAutenticacionRepository,
    DjangoConfiguracionPagosRepository,
)

from .serializers import (
    RegisterRequestSerializer,
    LoginRequestSerializer,
    UserResponseSerializer,
    ConfiguracionAutenticacionRequestSerializer,
    ConfiguracionAutenticacionResponseSerializer,
    ConfiguracionPagosRequestSerializer,
    ConfiguracionPagosResponseSerializer,
)
UserModel = get_user_model()

AUTH_ERROR_CODES = {
    UserAlreadyExistsException: "USUARIO_YA_EXISTE",
    InvalidCredentialsException: "CREDENCIALES_INVALIDAS",
    UserNotFoundException: "USUARIO_NO_ENCONTRADO",
    WeakPasswordException: "CONTRASENA_INSEGURA",
}


def _auth_error_code(err: AuthException) -> str:
    return AUTH_ERROR_CODES.get(type(err), "ERROR_AUTENTICACION")


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dto = RegisterUserDTO(**serializer.validated_data)
        use_case = RegisterUserUseCase(DjangoUserRepository())

        try:
            user_entity = use_case.execute(dto)
            django_user = UserModel.objects.get(pk=user_entity.id)
            token, _ = Token.objects.get_or_create(user=django_user)

            return success_response(
                data={
                    "user": UserResponseSerializer(user_entity).data,
                    "token": token.key,
                },
                mensaje="Usuario registrado exitosamente",
                status=status.HTTP_201_CREATED,
            )
        except AuthException as err:
            return error_response(
                mensaje=str(err),
                codigo=_auth_error_code(err),
                status=status.HTTP_400_BAD_REQUEST,
            )


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = LoginUseCase(DjangoUserRepository())

        try:
            user_entity = use_case.execute(
                username_or_email=serializer.validated_data['username'],
                password=serializer.validated_data['password'],
            )
            django_user = UserModel.objects.get(pk=user_entity.id)
            token, _ = Token.objects.get_or_create(user=django_user)

            return success_response(
                data={
                    "user": UserResponseSerializer(user_entity).data,
                    "token": token.key,
                },
                mensaje="Inicio de sesión exitoso",
                status=status.HTTP_200_OK,
            )
        except AuthException as err:
            return error_response(
                mensaje=str(err),
                codigo=_auth_error_code(err),
                status=status.HTTP_401_UNAUTHORIZED,
            )


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        repo = DjangoUserRepository()
        user_entity = repo.get_by_id(request.user.id)
        if not user_entity:
            return error_response(
                mensaje="Usuario no encontrado",
                codigo="USUARIO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )

        return success_response(
            data=UserResponseSerializer(user_entity).data,
            mensaje="Usuario obtenido correctamente",
            status=status.HTTP_200_OK,
        )

class GoogleLoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleLoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = GoogleLoginUseCase(DjangoUserRepository())

        try:
            user_entity = use_case.execute(token=serializer.validated_data['token'])
            django_user = UserModel.objects.get(pk=user_entity.id)
            token, _ = Token.objects.get_or_create(user=django_user)

            return success_response(
                data={
                    "user": UserResponseSerializer(user_entity).data,
                    "token": token.key,
                },
                mensaje="Inicio de sesión con Google exitoso",
                status=status.HTTP_200_OK,
            )
        except AuthException as err:
            return error_response(
                mensaje=str(err),
                codigo=_auth_error_code(err),
                status=status.HTTP_401_UNAUTHORIZED,
            )

class ConfiguracionAutenticacionAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda_id = request.query_params.get("tienda_id")

        if not tienda_id:
            return error_response(
                mensaje="Debe indicar tienda_id.",
                codigo="TIENDA_REQUERIDA",
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            tienda_id = int(tienda_id)
        except ValueError:
            return error_response(
                mensaje="tienda_id debe ser un número entero.",
                codigo="TIENDA_INVALIDA",
                status=status.HTTP_400_BAD_REQUEST,
            )

        tienda = Tienda.objects.del_propietario(
            request.user
        ).filter(
            id_tienda=tienda_id
        ).first()

        if not tienda:
            return error_response(
                mensaje="La tienda no existe o no pertenece al usuario autenticado.",
                codigo="TIENDA_NO_AUTORIZADA",
                status=status.HTTP_403_FORBIDDEN,
            )

        use_case = ConsultarConfiguracionAutenticacionUseCase(
            DjangoConfiguracionAutenticacionRepository()
        )

        try:
            configuracion = use_case.execute(tienda_id)
        except ValueError as err:
            return error_response(
                mensaje=str(err),
                codigo="CONFIGURACION_AUTENTICACION_NO_ENCONTRADA",
                status=status.HTTP_404_NOT_FOUND,
            )

        return success_response(
            data=ConfiguracionAutenticacionResponseSerializer(
                configuracion
            ).data,
            mensaje="Configuración de autenticación obtenida correctamente",
            status=status.HTTP_200_OK,
        )

    def put(self, request):
        serializer = ConfiguracionAutenticacionRequestSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        tienda_id = serializer.validated_data["tienda_id"]

        tienda = Tienda.objects.del_propietario(
            request.user
        ).filter(
            id_tienda=tienda_id
        ).first()

        if not tienda:
            return error_response(
                mensaje="La tienda no existe o no pertenece al usuario autenticado.",
                codigo="TIENDA_NO_AUTORIZADA",
                status=status.HTTP_403_FORBIDDEN,
            )

        dto = GuardarConfiguracionAutenticacionDTO(
            **serializer.validated_data
        )

        use_case = GuardarConfiguracionAutenticacionUseCase(
            DjangoConfiguracionAutenticacionRepository()
        )

        try:
            configuracion = use_case.execute(dto)
        except ValueError as err:
            return error_response(
                mensaje=str(err),
                codigo="CONFIGURACION_AUTENTICACION_INVALIDA",
                status=status.HTTP_400_BAD_REQUEST,
            )

        return success_response(
            data=ConfiguracionAutenticacionResponseSerializer(
                configuracion
            ).data,
            mensaje="Configuración de autenticación guardada correctamente",
            status=status.HTTP_200_OK,
        )


class ConfiguracionPagosAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda_id = request.query_params.get("tienda_id")

        if not tienda_id:
            return error_response(
                mensaje="Debe indicar tienda_id.",
                codigo="TIENDA_REQUERIDA",
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            tienda_id = int(tienda_id)
        except ValueError:
            return error_response(
                mensaje="tienda_id debe ser un numero entero.",
                codigo="TIENDA_INVALIDA",
                status=status.HTTP_400_BAD_REQUEST,
            )

        tienda = Tienda.objects.del_propietario(
            request.user
        ).filter(
            id_tienda=tienda_id
        ).first()

        if not tienda:
            return error_response(
                mensaje="La tienda no existe o no pertenece al usuario autenticado.",
                codigo="TIENDA_NO_AUTORIZADA",
                status=status.HTTP_403_FORBIDDEN,
            )

        use_case = ConsultarConfiguracionPagosUseCase(
            DjangoConfiguracionPagosRepository()
        )

        try:
            configuracion = use_case.execute(tienda_id)
        except ValueError as err:
            return error_response(
                mensaje=str(err),
                codigo="CONFIGURACION_PAGOS_NO_ENCONTRADA",
                status=status.HTTP_404_NOT_FOUND,
            )

        return success_response(
            data=ConfiguracionPagosResponseSerializer(
                configuracion
            ).data,
            mensaje="Configuracion de pagos obtenida correctamente",
            status=status.HTTP_200_OK,
        )

    def put(self, request):
        serializer = ConfiguracionPagosRequestSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        tienda_id = serializer.validated_data["tienda_id"]

        tienda = Tienda.objects.del_propietario(
            request.user
        ).filter(
            id_tienda=tienda_id
        ).first()

        if not tienda:
            return error_response(
                mensaje="La tienda no existe o no pertenece al usuario autenticado.",
                codigo="TIENDA_NO_AUTORIZADA",
                status=status.HTTP_403_FORBIDDEN,
            )

        dto = GuardarConfiguracionPagosDTO(
            **serializer.validated_data
        )

        use_case = GuardarConfiguracionPagosUseCase(
            DjangoConfiguracionPagosRepository()
        )

        try:
            configuracion = use_case.execute(dto)
        except ValueError as err:
            return error_response(
                mensaje=str(err),
                codigo="CONFIGURACION_PAGOS_INVALIDA",
                status=status.HTTP_400_BAD_REQUEST,
            )

        return success_response(
            data=ConfiguracionPagosResponseSerializer(
                configuracion
            ).data,
            mensaje="Configuracion de pagos guardada correctamente",
            status=status.HTTP_200_OK,
        )
