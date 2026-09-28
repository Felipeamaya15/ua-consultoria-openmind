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