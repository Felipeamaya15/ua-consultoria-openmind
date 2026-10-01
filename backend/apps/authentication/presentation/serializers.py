from rest_framework import serializers


class RegisterRequestSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6)
    first_name = serializers.CharField(max_length=150, required=False, default="")
    last_name = serializers.CharField(max_length=150, required=False, default="")


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