from rest_framework import serializers
from apps.core.domain.validators import validar_password_segura

class RegisterRequestSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150, required=False, default="")
    last_name = serializers.CharField(max_length=150, required=False, default="")

    def validate_password(self, value):
        try:
            validar_password_segura(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))
        return value

class LoginRequestSerializer(serializers.Serializer):
    username = serializers.CharField(help_text="Username o Email")
    password = serializers.CharField(write_only=True)


class UserResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    full_name = serializers.CharField()
    is_staff = serializers.BooleanField()
    is_store_owner = serializers.SerializerMethodField()

    def get_is_store_owner(self, user):
        from apps.core.models import Tienda
        return Tienda.objects.filter(id_usuario_propietario_id=user.id).exists()

class GoogleLoginRequestSerializer(serializers.Serializer):
    token = serializers.CharField(help_text="ID Token devuelto por Google")

class ConfiguracionAutenticacionRequestSerializer(serializers.Serializer):
    tienda_id = serializers.IntegerField(min_value=1)
    email_password = serializers.BooleanField()
    google = serializers.BooleanField()
    google_client_id = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
    )
    guest_checkout = serializers.BooleanField()
    requires_auth = serializers.ChoiceField(
        choices=["none", "optional", "required"]
    )


class ConfiguracionAutenticacionResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    tienda_id = serializers.IntegerField()
    email_password = serializers.BooleanField()
    google = serializers.BooleanField()
    google_client_id = serializers.CharField()
    guest_checkout = serializers.BooleanField()
    requires_auth = serializers.CharField()


class ConfiguracionPagosRequestSerializer(serializers.Serializer):
    tienda_id = serializers.IntegerField(min_value=1)
    metodos = serializers.DictField()


class ConfiguracionPagosResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    tienda_id = serializers.IntegerField()
    metodos = serializers.DictField()
