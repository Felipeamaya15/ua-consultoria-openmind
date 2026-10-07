from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from .entities import (
    UserEntity,
    ConfiguracionAutenticacionEntity,
    ConfiguracionPagosEntity,
)


class IUserRepository(ABC):
    """Puerto de persistencia para usuarios"""
    @abstractmethod
    def get_by_id(self, user_id: int) -> Optional[UserEntity]:
        pass

    @abstractmethod
    def get_by_email(self, email: str) -> Optional[UserEntity]:
        pass

    @abstractmethod
    def get_by_username(self, username: str) -> Optional[UserEntity]:
        pass

    @abstractmethod
    def create(self, user: UserEntity, password: str) -> UserEntity:
        pass

    @abstractmethod
    def verify_credentials(self, username_or_email: str, password: str) -> Optional[UserEntity]:
        pass


class ITokenService(ABC):
    """Puerto para generación y validación de tokens (desacoplado de JWT o DRF Tokens)"""
    @abstractmethod
    def generate_token(self, user: UserEntity) -> str:
        pass

    @abstractmethod
    def validate_token(self, token: str) -> Optional[Dict[str, Any]]:
        pass


class IEmailService(ABC):
    """Puerto para comunicaciones externas (desacoplado de SMTP, SendGrid, Amazon SES)"""
    @abstractmethod
    def send_welcome_email(self, to_email: str, username: str) -> bool:
        pass

    @abstractmethod
    def send_password_reset_email(self, to_email: str, reset_link: str) -> bool:
        pass


class IConfiguracionAutenticacionRepository(ABC):
    """Puerto de persistencia para la configuración de autenticación por tienda."""

    @abstractmethod
    def get_by_tienda(
        self,
        tienda_id: int
    ) -> Optional[ConfiguracionAutenticacionEntity]:
        pass

    @abstractmethod
    def save(
        self,
        configuracion: ConfiguracionAutenticacionEntity
    ) -> ConfiguracionAutenticacionEntity:
        pass


class IConfiguracionPagosRepository(ABC):
    """Puerto de persistencia para la configuracion de pagos por tienda."""

    @abstractmethod
    def get_by_tienda(
        self,
        tienda_id: int
    ) -> Optional[ConfiguracionPagosEntity]:
        pass

    @abstractmethod
    def save(
        self,
        configuracion: ConfiguracionPagosEntity
    ) -> ConfiguracionPagosEntity:
        pass
