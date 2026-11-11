from rest_framework import serializers
from apps.core.domain.validators import validar_password_segura
from apps.core.domain.security_validators import (
    MAX_EMAIL_LENGTH,
    MAX_NAME_LENGTH,
    MAX_PASSWORD_LENGTH,
    MAX_PHONE_LENGTH,
    MAX_POSTAL_CODE_LENGTH,
    MAX_USERNAME_LENGTH,
    OTP_ALLOWLIST_REGEX,
    contains_sql_injection,
    escape_xss,
    validate_integer_field,
    validate_strict_email,
    validate_strict_person_name,
    validate_strict_phone,
    validate_strict_postal_code,
    validate_strict_username,
    validate_string_field,
)
from apps.authentication.infrastructure.captcha import verify_captcha_challenge


class RegisterRequestSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=MAX_USERNAME_LENGTH)
    email = serializers.EmailField(max_length=MAX_EMAIL_LENGTH)
    password = serializers.CharField(write_only=True, min_length=8, max_length=MAX_PASSWORD_LENGTH, trim_whitespace=False)
    first_name = serializers.CharField(max_length=MAX_NAME_LENGTH, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=MAX_NAME_LENGTH, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=MAX_PHONE_LENGTH, required=False, allow_blank=True, default="")
    postal_code = serializers.CharField(max_length=MAX_POSTAL_CODE_LENGTH, required=False, allow_blank=True, default="")
    captcha_token = serializers.CharField(max_length=512, required=False, allow_blank=True, default="")
    captcha_answer = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")

    def validate_username(self, value):
        try:
            return validate_strict_username(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_email(self, value):
        try:
            return validate_strict_email(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_password(self, value):
        try:
            validar_password_segura(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))
        return value

    def validate_first_name(self, value):
        try:
            return validate_strict_person_name(value, "Nombre", allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_last_name(self, value):
        try:
            return validate_strict_person_name(value, "Apellido", allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_phone(self, value):
        try:
            return validate_strict_phone(value, allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_postal_code(self, value):
        try:
            return validate_strict_postal_code(value, allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate(self, attrs):
        require_captcha = bool(self.context.get("require_captcha", False))
        token = attrs.get("captcha_token", "")
        answer = attrs.get("captcha_answer", "")
        if require_captcha or token or answer:
            if not verify_captcha_challenge(token, answer):
                raise serializers.ValidationError(
                    {"captcha": "El código CAPTCHA es inválido o ha expirado. Intenta nuevamente."}
                )
        return attrs


class LoginRequestSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=MAX_EMAIL_LENGTH, help_text="Username o Email")
    password = serializers.CharField(write_only=True, max_length=MAX_PASSWORD_LENGTH, trim_whitespace=False)
    captcha_token = serializers.CharField(max_length=512, required=False, allow_blank=True, default="")
    captcha_answer = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    otp_code = serializers.CharField(max_length=6, required=False, allow_blank=True, default="")

    def validate_username(self, value):
        if not isinstance(value, str):
            raise serializers.ValidationError("Tipo de dato inválido.")
        cleaned = value.strip()
        if not cleaned or len(cleaned) > MAX_EMAIL_LENGTH:
            raise serializers.ValidationError("Ingresa un usuario o correo válido.")
        if contains_sql_injection(cleaned):
            raise serializers.ValidationError("Entrada rechazada por contener patrones no permitidos.")
        if "@" in cleaned:
            try:
                return validate_strict_email(cleaned)
            except ValueError as exc:
                raise serializers.ValidationError(str(exc))
        try:
            return validate_strict_username(cleaned)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_otp_code(self, value):
        if not value:
            return ""
        cleaned = value.strip()
        if not OTP_ALLOWLIST_REGEX.fullmatch(cleaned):
            raise serializers.ValidationError("El código MFA debe contener exactamente 6 dígitos numéricos.")
        return cleaned

    def validate(self, attrs):
        require_captcha = bool(self.context.get("require_captcha", False))
        token = attrs.get("captcha_token", "")
        answer = attrs.get("captcha_answer", "")
        if require_captcha or token or answer:
            if not verify_captcha_challenge(token, answer):
                raise serializers.ValidationError(
                    {"captcha": "El código CAPTCHA es inválido o ha expirado. Intenta nuevamente."}
                )
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=MAX_EMAIL_LENGTH)
    template = serializers.IntegerField(min_value=1, max_value=4, required=False, default=1)

    def validate_email(self, value):
        try:
            return validate_strict_email(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_template(self, value):
        try:
            return validate_integer_field(value, "Plantilla", min_value=1, max_value=4)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=MAX_PASSWORD_LENGTH, trim_whitespace=False)

    def validate_token(self, value):
        try:
            return validate_string_field(value, "Token", max_length=512, min_length=10, escape_html=False)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_new_password(self, value):
        try:
            validar_password_segura(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))
        return value


class MFAVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField(max_length=512)
    code = serializers.CharField(max_length=6)

    def validate_code(self, value):
        cleaned = str(value or "").strip()
        if not OTP_ALLOWLIST_REGEX.fullmatch(cleaned):
            raise serializers.ValidationError("El código MFA debe tener exactamente 6 dígitos numéricos.")
        return cleaned


class MFAEnableSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6)

    def validate_code(self, value):
        cleaned = str(value or "").strip()
        if not OTP_ALLOWLIST_REGEX.fullmatch(cleaned):
            raise serializers.ValidationError("Ingresa el código de 6 dígitos generado por tu aplicación autenticadora.")
        return cleaned


class MFADisableSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, max_length=MAX_PASSWORD_LENGTH, trim_whitespace=False)
    code = serializers.CharField(max_length=6, required=False, allow_blank=True, default="")


class MFASendEmailCodeSerializer(serializers.Serializer):
    mfa_token = serializers.CharField(max_length=512)


class UserResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    is_staff = serializers.BooleanField()
    is_store_owner = serializers.SerializerMethodField()
    mfa_enabled = serializers.SerializerMethodField()

    def get_first_name(self, user):
        return escape_xss(getattr(user, "first_name", "") or "")

    def get_last_name(self, user):
        return escape_xss(getattr(user, "last_name", "") or "")

    def get_full_name(self, user):
        return escape_xss(getattr(user, "full_name", "") or "")

    def get_is_store_owner(self, user):
        from apps.core.models import Tienda
        return Tienda.objects.filter(id_usuario_propietario_id=user.id).exists()

    def get_mfa_enabled(self, user):
        from apps.authentication.infrastructure.models import UserMFA
        return UserMFA.objects.filter(user_id=user.id, is_enabled=True).exists()


class GoogleLoginRequestSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=2048, help_text="ID Token devuelto por Google")


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

    def to_representation(self, instance):
        """Nunca exponer secretos almacenados, tampoco en la respuesta al guardar."""
        data = super().to_representation(instance)
        data["metodos"] = {
            metodo: {
                "enabled": bool(config.get("enabled", False)),
                # Solo nombres de campos, jamás sus valores.
                "configured_fields": sorted(
                    str(nombre) for nombre, valor in config.get("fields", {}).items()
                    if valor is not None and str(valor).strip()
                ),
            }
            for metodo, config in data["metodos"].items()
            if isinstance(config, dict) and isinstance(config.get("fields", {}), dict)
        }
        return data
