from typing import Optional

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import AbstractBaseUser

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
from apps.authentication.infrastructure.models import (
    ConfiguracionAutenticacion,
    ConfiguracionPagos,
)


UserModel = get_user_model()

class DjangoUserRepository(IUserRepository):
    """Implementación concreta del repositorio usando Django ORM y Postgres."""

    def _to_entity(self, user_obj: AbstractBaseUser) -> UserEntity:
        return UserEntity(
            id=user_obj.id,
            username=user_obj.get_username(),
            email=getattr(user_obj, 'email', ''),
            first_name=getattr(user_obj, 'first_name', ''),
            last_name=getattr(user_obj, 'last_name', ''),
            is_active=user_obj.is_active,
            is_staff=getattr(user_obj, 'is_staff', False),
            date_joined=getattr(user_obj, 'date_joined', None),
        )

    def get_by_id(self, user_id: int) -> Optional[UserEntity]:
        try:
            user = UserModel.objects.get(pk=user_id)
            return self._to_entity(user)
        except UserModel.DoesNotExist:
            return None

    def get_by_email(self, email: str) -> Optional[UserEntity]:
        user = UserModel.objects.filter(email=email).first()
        return self._to_entity(user) if user else None

    def get_by_username(self, username: str) -> Optional[UserEntity]:
        user = UserModel.objects.filter(username=username).first()
        return self._to_entity(user) if user else None

    def create(self, user: UserEntity, password: str) -> UserEntity:
        """
        Crea un nuevo usuario asegurando el hash seguro de la contraseña.
        create_user() invoca internamente set_password(), aplicando PBKDF2-SHA256 con salt dinámico.
        """
        new_user = UserModel.objects.create_user(
            username=user.username,
            email=user.email,
            password=password,
            first_name=user.first_name,
            last_name=user.last_name
        )
        return self._to_entity(new_user)

    def verify_credentials(self, username_or_email: str, password: str) -> Optional[UserEntity]:
        """
        Verifica las credenciales comparando la contraseña ingresada contra el hash seguro almacenado.
        check_password() previene timing attacks y valida hashes PBKDF2, Argon2 o BCrypt.
        """
        # Buscar usuario por email o por username
        user_obj = UserModel.objects.filter(email=username_or_email).first()
        if not user_obj:
            user_obj = UserModel.objects.filter(username=username_or_email).first()

        if user_obj and user_obj.is_active and user_obj.check_password(password):
            return self._to_entity(user_obj)

        return None

class DjangoConfiguracionAutenticacionRepository(
    IConfiguracionAutenticacionRepository
):
    """Persistencia ORM de la configuración de autenticación por tienda."""

    def _to_entity(
        self,
        obj: ConfiguracionAutenticacion,
    ) -> ConfiguracionAutenticacionEntity:
        return ConfiguracionAutenticacionEntity(
            id=obj.id,
            tienda_id=obj.tienda_id,
            email_password=obj.email_password,
            google=obj.google,
            google_client_id=obj.google_client_id,
            guest_checkout=obj.guest_checkout,
            requires_auth=obj.requires_auth,
        )

    def get_by_tienda(
        self,
        tienda_id: int,
    ) -> Optional[ConfiguracionAutenticacionEntity]:
        obj = ConfiguracionAutenticacion.objects.filter(
            tienda_id=tienda_id
        ).first()

        return self._to_entity(obj) if obj else None

    def save(
        self,
        configuracion: ConfiguracionAutenticacionEntity,
    ) -> ConfiguracionAutenticacionEntity:
        obj, _ = ConfiguracionAutenticacion.objects.update_or_create(
            tienda_id=configuracion.tienda_id,
            defaults={
                "email_password": configuracion.email_password,
                "google": configuracion.google,
                "google_client_id": configuracion.google_client_id,
                "guest_checkout": configuracion.guest_checkout,
                "requires_auth": configuracion.requires_auth,
            },
        )

        return self._to_entity(obj)


class DjangoConfiguracionPagosRepository(
    IConfiguracionPagosRepository
):
    """Persistencia ORM de la configuracion de pagos por tienda."""

    def _to_entity(
        self,
        obj: ConfiguracionPagos,
    ) -> ConfiguracionPagosEntity:
        return ConfiguracionPagosEntity(
            id=obj.id,
            tienda_id=obj.tienda_id,
            metodos=obj.metodos,
        )

    def get_by_tienda(
        self,
        tienda_id: int,
    ) -> Optional[ConfiguracionPagosEntity]:
        obj = ConfiguracionPagos.objects.filter(
            tienda_id=tienda_id
        ).first()

        return self._to_entity(obj) if obj else None

    def save(
        self,
        configuracion: ConfiguracionPagosEntity,
    ) -> ConfiguracionPagosEntity:
        obj, _ = ConfiguracionPagos.objects.update_or_create(
            tienda_id=configuracion.tienda_id,
            defaults={
                "metodos": configuracion.metodos,
            },
        )

        return self._to_entity(obj)
