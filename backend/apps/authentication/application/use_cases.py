from dataclasses import dataclass
import secrets
import string
import requests

from apps.authentication.domain.entities import (
    UserEntity,
    ConfiguracionAutenticacionEntity,
    ConfiguracionPagosEntity,
)
from apps.authentication.domain.interfaces import (
    IUserRepository,
    IConfiguracionAutenticacionRepository,
    IConfiguracionPagosRepository,
)
from apps.authentication.domain.exceptions import (
    InvalidCredentialsException,
    UserAlreadyExistsException,
    WeakPasswordException,
)
from apps.core.domain.validators import validar_password_segura


@dataclass
class RegisterUserDTO:
    username: str
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""


class RegisterUserUseCase:
    def __init__(self, user_repository: IUserRepository):
        self.user_repository = user_repository

    def execute(self, dto: RegisterUserDTO) -> UserEntity:
        # Validación de política de contraseñas capturada como excepción de dominio
        try:
            validar_password_segura(dto.password)
        except ValueError as err:
            raise WeakPasswordException(str(err))

        if self.user_repository.get_by_email(dto.email):
            raise UserAlreadyExistsException("El correo electrónico ya está registrado.")

        if self.user_repository.get_by_username(dto.username):
            raise UserAlreadyExistsException("El nombre de usuario ya está registrado.")

        new_user = UserEntity(
            id=None,
            username=dto.username,
            email=dto.email,
            first_name=dto.first_name,
            last_name=dto.last_name,
        )
        return self.user_repository.create(new_user, dto.password)


class LoginUseCase:
    def __init__(self, user_repository: IUserRepository):
        self.user_repository = user_repository

    def execute(self, username_or_email: str, password: str) -> UserEntity:
        user = self.user_repository.verify_credentials(username_or_email, password)
        if not user:
            raise InvalidCredentialsException("Credenciales inválidas.")
        return user


class GoogleLoginUseCase:
    def __init__(self, user_repository: IUserRepository):
        self.user_repository = user_repository

    def execute(self, token: str) -> UserEntity:
        # Consultamos el perfil del usuario en Google usando el Access Token
        try:
            response = requests.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {token}"}, timeout=10,
            )
            if not response.ok:
                raise InvalidCredentialsException("Token de Google inválido o expirado.")
            idinfo = response.json()
        except (requests.RequestException, ValueError):
            raise InvalidCredentialsException("No se pudo validar el token de Google.") from None
        if not isinstance(idinfo, dict) or idinfo.get("email_verified") is not True:
            raise InvalidCredentialsException("Google debe confirmar que el correo está verificado.")

        email = idinfo.get('email')
        first_name = idinfo.get('given_name', '')
        last_name = idinfo.get('family_name', '')

        if not email:
            raise InvalidCredentialsException("El token de Google no contiene un email válido.")

        # Buscar si el usuario ya existe en Postgres
        user = self.user_repository.get_by_email(email)

        if not user:
            # Si no existe, lo registramos con una contraseña aleatoria segura
            alphabet = string.ascii_letters + string.digits + string.punctuation
            random_password = ''.join(secrets.choice(alphabet) for _ in range(20))

            # Usamos el email como username por defecto
            username = email.split('@')[0]
            if self.user_repository.get_by_username(username):
                username = f"{username}_{secrets.token_hex(4)}"

            new_user = UserEntity(
                id=None,
                username=username,
                email=email,
                first_name=first_name,
                last_name=last_name,
            )
            user = self.user_repository.create(new_user, random_password)

        return user


@dataclass
class GuardarConfiguracionAutenticacionDTO:
    tienda_id: int
    email_password: bool
    google: bool
    google_client_id: str = ""
    guest_checkout: bool = True
    requires_auth: str = "optional"


class GuardarConfiguracionAutenticacionUseCase:
    def __init__(
        self,
        configuracion_repository: IConfiguracionAutenticacionRepository,
    ):
        self.configuracion_repository = configuracion_repository

    def execute(
        self,
        dto: GuardarConfiguracionAutenticacionDTO,
    ) -> ConfiguracionAutenticacionEntity:

        if dto.requires_auth not in {"none", "optional", "required"}:
            raise ValueError("La regla de autenticación no es válida.")

        if dto.google and not dto.google_client_id.strip():
            raise ValueError(
                "Debe indicar Google OAuth Client ID cuando Google está habilitado."
            )

        if dto.requires_auth == "required":
            if not dto.email_password and not dto.google:
                raise ValueError(
                    "Debe existir al menos un método de autenticación cuando la cuenta es obligatoria."
                )

        if (
            not dto.email_password
            and not dto.google
            and not dto.guest_checkout
        ):
            raise ValueError(
                "Debe existir al menos una modalidad disponible para el comprador."
            )

        configuracion = ConfiguracionAutenticacionEntity(
            id=None,
            tienda_id=dto.tienda_id,
            email_password=dto.email_password,
            google=dto.google,
            google_client_id=dto.google_client_id.strip(),
            guest_checkout=dto.guest_checkout,
            requires_auth=dto.requires_auth,
        )

        return self.configuracion_repository.save(configuracion)


class ConsultarConfiguracionAutenticacionUseCase:
    def __init__(
        self,
        configuracion_repository: IConfiguracionAutenticacionRepository,
    ):
        self.configuracion_repository = configuracion_repository

    def execute(
        self,
        tienda_id: int,
    ) -> ConfiguracionAutenticacionEntity:
        configuracion = self.configuracion_repository.get_by_tienda(
            tienda_id
        )

        if not configuracion:
            raise ValueError(
                "No existe configuración de autenticación para la tienda."
            )

        return configuracion


@dataclass
class GuardarConfiguracionPagosDTO:
    tienda_id: int
    metodos: dict


class GuardarConfiguracionPagosUseCase:
    CAMPOS_REQUERIDOS = {
        "transbank": ["api_key", "commerce_id"],
        "mercadopago": ["access_token"],
        "paypal": ["client_id", "client_secret"],
        "linkify": ["api_key"],
        "transfer": [
            "bank_name",
            "account_type",
            "account_number",
            "holder_rut",
            "holder_name",
            "confirmation_email",
        ],
    }

    def __init__(
        self,
        configuracion_repository: IConfiguracionPagosRepository,
    ):
        self.configuracion_repository = configuracion_repository

    def execute(
        self,
        dto: GuardarConfiguracionPagosDTO,
    ) -> ConfiguracionPagosEntity:
        if not isinstance(dto.metodos, dict):
            raise ValueError("La configuracion de pagos no es valida.")

        metodos_normalizados = {}
        habilitados = []

        for metodo, configuracion in dto.metodos.items():
            if metodo not in self.CAMPOS_REQUERIDOS:
                raise ValueError(f"Metodo de pago no soportado: {metodo}.")

            if not isinstance(configuracion, dict):
                raise ValueError(
                    f"La configuracion de {metodo} no es valida."
                )

            enabled = bool(configuracion.get("enabled", False))
            fields = configuracion.get("fields", {})

            if not isinstance(fields, dict):
                raise ValueError(
                    f"Los campos de {metodo} no son validos."
                )

            clean_fields = {
                str(key): str(value).strip()
                for key, value in fields.items()
                if value is not None
            }

            if enabled:
                habilitados.append(metodo)
                missing = [
                    field
                    for field in self.CAMPOS_REQUERIDOS[metodo]
                    if not clean_fields.get(field)
                ]

                if missing:
                    raise ValueError(
                        f"Faltan datos obligatorios para {metodo}: {', '.join(missing)}."
                    )

            metodos_normalizados[metodo] = {
                "enabled": enabled,
                "fields": clean_fields,
            }

        if not habilitados:
            raise ValueError(
                "Debe existir al menos un metodo de pago habilitado."
            )

        configuracion = ConfiguracionPagosEntity(
            id=None,
            tienda_id=dto.tienda_id,
            metodos=metodos_normalizados,
        )

        return self.configuracion_repository.save(configuracion)


class ConsultarConfiguracionPagosUseCase:
    def __init__(
        self,
        configuracion_repository: IConfiguracionPagosRepository,
    ):
        self.configuracion_repository = configuracion_repository

    def execute(
        self,
        tienda_id: int,
    ) -> ConfiguracionPagosEntity:
        configuracion = self.configuracion_repository.get_by_tienda(
            tienda_id
        )

        if not configuracion:
            raise ValueError(
                "No existe configuracion de pagos para la tienda."
            )

        return configuracion
