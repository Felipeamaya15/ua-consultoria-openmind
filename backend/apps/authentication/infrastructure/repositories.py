from typing import Optional
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import AbstractBaseUser
from apps.authentication.domain.entities import UserEntity
from apps.authentication.domain.interfaces import IUserRepository

UserModel = get_user_model()

class DjangoUserRepository(IUserRepository):
    """Implementación concreta del repositorio usando Django ORM y Postgres"""

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
        new_user = UserModel.objects.create_user(
            username=user.username,
            email=user.email,
            password=password,
            first_name=user.first_name,
            last_name=user.last_name
        )
        return self._to_entity(new_user)

    def verify_credentials(self, username_or_email: str, password: str) -> Optional[UserEntity]:
        # Busca primero por email, si no, asume que es el username
        user_obj = UserModel.objects.filter(email=username_or_email).first()
        username = user_obj.username if user_obj else username_or_email

        user = authenticate(username=username, password=password)
        if user:
            return self._to_entity(user)
        return None