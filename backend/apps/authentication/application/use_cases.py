from dataclasses import dataclass
import secrets
import string
import requests 
from dataclasses import dataclass
from apps.authentication.domain.entities import UserEntity
from apps.authentication.domain.interfaces import IUserRepository
from apps.authentication.domain.exceptions import (
    InvalidCredentialsException,
    UserAlreadyExistsException,
)
from apps.authentication.domain.entities import (
    UserEntity,
    ConfiguracionAutenticacionEntity,
)
from apps.authentication.domain.interfaces import (
    IUserRepository,
    IConfiguracionAutenticacionRepository,
)

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
        response = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if not response.ok:
            raise InvalidCredentialsException("Token de Google inválido o expirado.")
            
        idinfo = response.json()
        
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
            random_password = ''.join(secrets.choice(alphabet) for i in range(20))
            
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