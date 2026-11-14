import hashlib
import secrets
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.authentication.application.use_cases import (
    ConsultarConfiguracionAutenticacionUseCase,
    ConsultarConfiguracionPagosUseCase,
    GoogleLoginUseCase,
    GuardarConfiguracionAutenticacionDTO,
    GuardarConfiguracionAutenticacionUseCase,
    GuardarConfiguracionPagosDTO,
    GuardarConfiguracionPagosUseCase,
    LoginUseCase,
    RegisterUserDTO,
    RegisterUserUseCase,
)
from apps.authentication.domain.exceptions import (
    AuthException,
    InvalidCredentialsException,
    UserAlreadyExistsException,
    UserNotFoundException,
    WeakPasswordException,
)
from apps.authentication.infrastructure.captcha import generate_captcha_challenge
from apps.authentication.infrastructure.cookie_auth import (
    clear_auth_cookies,
    destroy_server_session_and_token,
    set_auth_cookies,
    touch_token_activity,
)
from apps.authentication.infrastructure.models import UserMFA, UserProfile
from apps.authentication.infrastructure.rate_limit import (
    check_rate_limit,
    record_failed_attempt,
    reset_rate_limit,
)
from apps.authentication.infrastructure.repositories import (
    DjangoConfiguracionAutenticacionRepository,
    DjangoConfiguracionPagosRepository,
    DjangoUserRepository,
)
from apps.authentication.infrastructure.totp import (
    EMAIL_OTP_TTL_SECONDS,
    TOTP_DIGITS,
    TOTP_PERIOD_SECONDS,
    build_otpauth_uri,
    create_mfa_challenge_token,
    generate_totp_secret,
    issue_email_otp_code,
    verify_email_otp_code,
    verify_mfa_challenge_token,
    verify_totp_code,
)
from apps.core.infrastructure.email_service import correo_enmascarado, enviar_correo
from apps.core.models import Tienda
from apps.core.presentation.responses import error_response, success_response

from .serializers import (
    ConfiguracionAutenticacionRequestSerializer,
    ConfiguracionAutenticacionResponseSerializer,
    ConfiguracionPagosRequestSerializer,
    ConfiguracionPagosResponseSerializer,
    GoogleLoginRequestSerializer,
    LoginRequestSerializer,
    MFADisableSerializer,
    MFAEnableSerializer,
    MFASendEmailCodeSerializer,
    MFAVerifySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterRequestSerializer,
    UserResponseSerializer,
)

UserModel = get_user_model()
PASSWORD_RESET_SALT = "auth-password-reset-v1"
PASSWORD_RESET_MAX_AGE_SECONDS = 1800  # 30 minutos

AUTH_ERROR_CODES = {
    UserAlreadyExistsException: "USUARIO_YA_EXISTE",
    InvalidCredentialsException: "CREDENCIALES_INVALIDAS",
    UserNotFoundException: "USUARIO_NO_ENCONTRADO",
    WeakPasswordException: "CONTRASENA_INSEGURA",
}


def _auth_error_code(err: AuthException) -> str:
    return AUTH_ERROR_CODES.get(type(err), "ERROR_AUTENTICACION")


def _store_name() -> str:
    tienda = Tienda.objects.first()
    return tienda.nombre if tienda and tienda.nombre else "Tienda"


def _frontend_origin() -> str:
    origin = (getattr(settings, "COMMERCIAL_CONSENT_FRONTEND_ORIGIN", "") or "").strip().rstrip("/")
    if origin:
        return origin
    public_url = (getattr(settings, "STOREFRONT_PUBLIC_URL", "") or "http://localhost:5173").strip()
    if "/plantilla/" in public_url:
        return public_url.split("/plantilla/")[0].rstrip("/")
    return public_url.rstrip("/")


class CaptchaAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        challenge = generate_captcha_challenge()
        return success_response(
            data=challenge,
            mensaje="Desafío CAPTCHA generado correctamente",
            status=status.HTTP_200_OK,
        )


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_email = str(request.data.get("email", "") if isinstance(request.data, dict) else "")
        allowed, _, retry_after = check_rate_limit(request, scope="register", identifier=raw_email)
        if not allowed:
            resp = error_response(
                mensaje="Demasiados intentos de registro. Por seguridad, espera 1 minuto antes de volver a intentarlo.",
                codigo="LIMITE_INTENTOS_EXCEDIDO",
                detalles={"retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            resp["Retry-After"] = str(retry_after)
            return resp

        require_captcha = request.META.get("HTTP_X_REQUIRE_CAPTCHA") == "1"
        serializer = RegisterRequestSerializer(
            data=request.data,
            context={"require_captcha": require_captcha},
        )
        if not serializer.is_valid():
            record_failed_attempt(request, scope="register", identifier=raw_email)
            return error_response(
                mensaje="Datos de registro inválidos.",
                codigo="DATOS_REGISTRO_INVALIDOS",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        validated = dict(serializer.validated_data)
        phone = validated.pop("phone", "")
        postal_code = validated.pop("postal_code", "")
        validated.pop("captcha_token", None)
        validated.pop("captcha_answer", None)

        dto = RegisterUserDTO(**validated)
        use_case = RegisterUserUseCase(DjangoUserRepository())

        try:
            user_entity = use_case.execute(dto)
            django_user = UserModel.objects.get(pk=user_entity.id)
            if phone or postal_code:
                UserProfile.objects.update_or_create(
                    user=django_user,
                    defaults={"phone": phone, "postal_code": postal_code},
                )
            token, _ = Token.objects.get_or_create(user=django_user)
            touch_token_activity(token.key, user=django_user)
            reset_rate_limit(request, scope="register", identifier=raw_email)

            response = success_response(
                data={
                    "user": UserResponseSerializer(user_entity).data,
                    "token": token.key,
                },
                mensaje="Usuario registrado exitosamente",
                status=status.HTTP_201_CREATED,
            )
            set_auth_cookies(response, request, token.key, user=django_user)
            return response
        except AuthException as err:
            record_failed_attempt(request, scope="register", identifier=raw_email)
            return error_response(
                mensaje=str(err),
                codigo=_auth_error_code(err),
                status=status.HTTP_400_BAD_REQUEST,
            )


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_username = str(request.data.get("username", "") if isinstance(request.data, dict) else "")
        allowed, _, retry_after = check_rate_limit(request, scope="login", identifier=raw_username)
        if not allowed:
            resp = error_response(
                mensaje="Has superado el límite de 5 intentos por minuto. Por seguridad, espera 1 minuto antes de volver a intentarlo.",
                codigo="LIMITE_INTENTOS_EXCEDIDO",
                detalles={"retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            resp["Retry-After"] = str(retry_after)
            return resp

        require_captcha = request.META.get("HTTP_X_REQUIRE_CAPTCHA") == "1"
        serializer = LoginRequestSerializer(
            data=request.data,
            context={"require_captcha": require_captcha},
        )
        if not serializer.is_valid():
            record_failed_attempt(request, scope="login", identifier=raw_username)
            return error_response(
                mensaje="Datos de inicio de sesión inválidos.",
                codigo="DATOS_LOGIN_INVALIDOS",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        username_or_email = serializer.validated_data["username"]
        password = serializer.validated_data["password"]
        otp_code = serializer.validated_data.get("otp_code", "")

        use_case = LoginUseCase(DjangoUserRepository())

        try:
            user_entity = use_case.execute(
                username_or_email=username_or_email,
                password=password,
            )
            django_user = UserModel.objects.get(pk=user_entity.id)

            # Verificar si el usuario tiene MFA (TOTP) habilitado
            mfa = UserMFA.objects.filter(user=django_user, is_enabled=True).first()
            if mfa:
                if otp_code:
                    valid_mfa = verify_totp_code(mfa.secret, otp_code) or verify_email_otp_code(
                        django_user.id, otp_code
                    )
                    if not valid_mfa:
                        record_failed_attempt(request, scope="login", identifier=username_or_email)
                        return error_response(
                            mensaje="El código de verificación MFA es inválido o ha expirado.",
                            codigo="CODIGO_MFA_INVALIDO",
                            status=status.HTTP_401_UNAUTHORIZED,
                        )
                else:
                    mfa_token = create_mfa_challenge_token(django_user.id)
                    return success_response(
                        data={
                            "mfa_required": True,
                            "mfa_token": mfa_token,
                            "email_masked": correo_enmascarado(django_user.email),
                        },
                        mensaje="Se requiere verificación de segundo factor (MFA).",
                        status=status.HTTP_200_OK,
                    )

            reset_rate_limit(request, scope="login", identifier=username_or_email)
            token, _ = Token.objects.get_or_create(user=django_user)
            touch_token_activity(token.key, user=django_user)

            response = success_response(
                data={
                    "user": UserResponseSerializer(user_entity).data,
                    "token": token.key,
                },
                mensaje="Inicio de sesión exitoso",
                status=status.HTTP_200_OK,
            )
            set_auth_cookies(response, request, token.key, user=django_user)
            return response
        except AuthException as err:
            record_failed_attempt(request, scope="login", identifier=username_or_email)
            return error_response(
                mensaje=str(err),
                codigo=_auth_error_code(err),
                status=status.HTTP_401_UNAUTHORIZED,
            )


class LogoutAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        destroy_server_session_and_token(request)
        response = success_response(
            data={},
            mensaje="Sesión cerrada correctamente",
            status=status.HTTP_200_OK,
        )
        clear_auth_cookies(response)
        return response


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
            user_entity = use_case.execute(token=serializer.validated_data["token"])
            django_user = UserModel.objects.get(pk=user_entity.id)
            token, _ = Token.objects.get_or_create(user=django_user)
            touch_token_activity(token.key, user=django_user)

            response = success_response(
                data={
                    "user": UserResponseSerializer(user_entity).data,
                    "token": token.key,
                },
                mensaje="Inicio de sesión con Google exitoso",
                status=status.HTTP_200_OK,
            )
            set_auth_cookies(response, request, token.key, user=django_user)
            return response
        except AuthException as err:
            return error_response(
                mensaje=str(err),
                codigo=_auth_error_code(err),
                status=status.HTTP_401_UNAUTHORIZED,
            )


class PasswordResetRequestAPIView(APIView):
    """
    Endpoint para 'Olvidé mi contraseña':
    Recibe el correo asociado del usuario y envía un enlace temporal firmado
    utilizando el servicio de correo transaccional configurado (email_service).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        raw_email = str(request.data.get("email", "") if isinstance(request.data, dict) else "")
        allowed, _, retry_after = check_rate_limit(request, scope="password_reset", identifier=raw_email)
        if not allowed:
            resp = error_response(
                mensaje="Has realizado demasiadas solicitudes de recuperación. Espera 1 minuto antes de reintentar.",
                codigo="LIMITE_INTENTOS_EXCEDIDO",
                detalles={"retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            resp["Retry-After"] = str(retry_after)
            return resp

        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            record_failed_attempt(request, scope="password_reset", identifier=raw_email)
            return error_response(
                mensaje="Introduce un correo electrónico válido.",
                codigo="CORREO_INVALIDO",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]
        template = serializer.validated_data.get("template", 1)
        record_failed_attempt(request, scope="password_reset", identifier=email)

        user = UserModel.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            pwd_fingerprint = hashlib.sha256((user.password or "").encode("utf-8")).hexdigest()[:16]
            nonce = secrets.token_urlsafe(12)
            reset_token = signing.dumps(
                {"uid": user.pk, "ph": pwd_fingerprint, "nonce": nonce},
                salt=PASSWORD_RESET_SALT,
            )
            cache.set(
                f"pwd_reset_nonce:{nonce}",
                "pending",
                timeout=PASSWORD_RESET_MAX_AGE_SECONDS,
            )
            origin = _frontend_origin()
            reset_link = (
                f"{origin}/plantilla/{template}/ingresar"
                f"?modo=restablecer&token={quote(reset_token)}"
            )
            store_name = _store_name()
            saludo = user.first_name or user.username or "Hola"
            cuerpo = (
                f"Hola {saludo},\n\n"
                f"Recibimos una solicitud para restablecer la contraseña de tu cuenta en {store_name} "
                f"asociada al correo {user.email}.\n\n"
                f"Para crear una nueva contraseña, ingresa al siguiente enlace (válido por 30 minutos):\n"
                f"{reset_link}\n\n"
                f"Si tú no solicitaste cambiar tu contraseña, ignora este mensaje."
            )
            resultado = enviar_correo(
                user.email,
                f"Recuperación de contraseña - {store_name}",
                cuerpo,
                preheader="Instrucciones para restablecer tu contraseña",
                nombre_remitente=store_name,
                referencia="password_reset",
            )
            if not resultado.enviado:
                return error_response(
                    mensaje="No se pudo enviar el correo de recuperación en este momento. Revisa la configuración de correo o intenta más tarde.",
                    codigo="ERROR_ENVIO_CORREO",
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

        return success_response(
            data={"email": email},
            mensaje="Hemos enviado un correo con el enlace para cambiar tu contraseña. Revisa tu bandeja de entrada y spam.",
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmAPIView(APIView):
    """Confirma el cambio de contraseña mediante el token enviado por correo."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            new_pwd_errors = serializer.errors.get("new_password")
            if new_pwd_errors:
                msg = new_pwd_errors[0] if isinstance(new_pwd_errors, list) else str(new_pwd_errors)
            else:
                msg = "No se pudo restablecer la contraseña. Revisa los datos ingresados."
            return error_response(
                mensaje=msg,
                codigo="DATOS_RESTABLECIMIENTO_INVALIDOS",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]

        try:
            payload = signing.loads(
                token,
                salt=PASSWORD_RESET_SALT,
                max_age=PASSWORD_RESET_MAX_AGE_SECONDS,
            )
        except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
            return error_response(
                mensaje="El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.",
                codigo="TOKEN_RECUPERACION_INVALIDO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        uid = payload.get("uid")
        ph = payload.get("ph")
        nonce = payload.get("nonce")
        if not uid or not ph or not nonce:
            return error_response(
                mensaje="El enlace de recuperación no es válido.",
                codigo="TOKEN_RECUPERACION_INVALIDO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        nonce_key = f"pwd_reset_nonce:{nonce}"
        if cache.get(nonce_key) == "used":
            return error_response(
                mensaje="Este enlace de recuperación ya fue utilizado.",
                codigo="TOKEN_RECUPERACION_USADO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = UserModel.objects.filter(pk=uid, is_active=True).first()
        if not user:
            return error_response(
                mensaje="Usuario no encontrado.",
                codigo="USUARIO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )

        current_ph = hashlib.sha256((user.password or "").encode("utf-8")).hexdigest()[:16]
        if current_ph != ph:
            return error_response(
                mensaje="Este enlace de recuperación ya expiró porque la contraseña cambió.",
                codigo="TOKEN_RECUPERACION_INVALIDO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return error_response(
                mensaje=" ".join(exc.messages),
                codigo="CONTRASENA_INSEGURA",
                detalles={"new_password": list(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])
        cache.set(nonce_key, "used", timeout=PASSWORD_RESET_MAX_AGE_SECONDS)
        Token.objects.filter(user=user).delete()

        return success_response(
            data={},
            mensaje="Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
            status=status.HTTP_200_OK,
        )


class MFAStatusAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        mfa = UserMFA.objects.filter(user=request.user).first()
        return success_response(
            data={
                "mfa_enabled": bool(mfa and mfa.is_enabled),
                "configured": bool(mfa and mfa.secret),
            },
            mensaje="Estado MFA obtenido correctamente.",
            status=status.HTTP_200_OK,
        )


class MFASetupAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        secret = generate_totp_secret()
        UserMFA.objects.update_or_create(
            user=request.user,
            defaults={"secret": secret, "is_enabled": False},
        )
        store_name = _store_name()
        account_label = request.user.email or request.user.username
        otpauth_url = build_otpauth_uri(secret, account_label, issuer=store_name)
        return success_response(
            data={
                "secret": secret,
                "otpauth_url": otpauth_url,
                "issuer": store_name,
                "account": account_label,
                "period": TOTP_PERIOD_SECONDS,
                "digits": TOTP_DIGITS,
            },
            mensaje="Escanea el código o ingresa la clave secreta en Google Authenticator o Authy y confirma con el código de 6 dígitos.",
            status=status.HTTP_200_OK,
        )


class MFAEnableAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFAEnableSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                mensaje="Código inválido.",
                codigo="CODIGO_MFA_INVALIDO",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa = UserMFA.objects.filter(user=request.user).first()
        if not mfa or not mfa.secret:
            return error_response(
                mensaje="Primero debes iniciar la configuración de MFA.",
                codigo="MFA_NO_CONFIGURADO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = serializer.validated_data["code"]
        if not verify_totp_code(mfa.secret, code):
            return error_response(
                mensaje="El código TOTP no coincide. Verifica la hora de tu dispositivo e intenta nuevamente.",
                codigo="CODIGO_MFA_INVALIDO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa.is_enabled = True
        mfa.save(update_fields=["is_enabled", "fecha_actualizacion"])

        return success_response(
            data={"mfa_enabled": True},
            mensaje="Autenticación Multifactor (MFA) activada correctamente.",
            status=status.HTTP_200_OK,
        )


class MFADisableAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFADisableSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                mensaje="Datos inválidos para desactivar MFA.",
                codigo="MFA_DESACTIVACION_INVALIDA",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not request.user.check_password(serializer.validated_data["password"]):
            return error_response(
                mensaje="La contraseña actual es incorrecta.",
                codigo="CREDENCIALES_INVALIDAS",
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserMFA.objects.filter(user=request.user).update(is_enabled=False)
        return success_response(
            data={"mfa_enabled": False},
            mensaje="Autenticación Multifactor (MFA) desactivada.",
            status=status.HTTP_200_OK,
        )


class MFASendEmailCodeAPIView(APIView):
    """Envía un código temporal de 6 dígitos que expira en 60 segundos al correo del usuario."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = MFASendEmailCodeSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                mensaje="Solicitud de código MFA inválida.",
                codigo="MFA_TOKEN_INVALIDO",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_id = verify_mfa_challenge_token(serializer.validated_data["mfa_token"])
        if not user_id:
            return error_response(
                mensaje="La sesión de verificación MFA expiró. Vuelve a iniciar sesión.",
                codigo="MFA_TOKEN_EXPIRADO",
                status=status.HTTP_401_UNAUTHORIZED,
            )

        allowed, _, retry_after = check_rate_limit(request, scope="mfa_email", identifier=str(user_id))
        if not allowed:
            resp = error_response(
                mensaje="Demasiadas solicitudes de código MFA. Espera 1 minuto.",
                codigo="LIMITE_INTENTOS_EXCEDIDO",
                detalles={"retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            resp["Retry-After"] = str(retry_after)
            return resp

        user = UserModel.objects.filter(pk=user_id, is_active=True).first()
        if not user or not user.email:
            return error_response(
                mensaje="No se encontró un correo válido asociado a la cuenta.",
                codigo="USUARIO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )

        record_failed_attempt(request, scope="mfa_email", identifier=str(user_id))
        otp_info = issue_email_otp_code(user.id, ttl_seconds=EMAIL_OTP_TTL_SECONDS)
        store_name = _store_name()
        cuerpo = (
            f"Hola {user.first_name or user.username},\n\n"
            f"Tu código temporal de verificación MFA es:\n\n"
            f"{otp_info['code']}\n\n"
            f"Este código expira en {EMAIL_OTP_TTL_SECONDS} segundos.\n\n"
            f"Si no intentaste iniciar sesión, cambia tu contraseña inmediatamente."
        )
        resultado = enviar_correo(
            user.email,
            f"Código de verificación ({otp_info['code']}) - {store_name}",
            cuerpo,
            preheader=f"Tu código temporal es {otp_info['code']} (válido por 60 segundos)",
            nombre_remitente=store_name,
            referencia="mfa_otp",
        )
        if not resultado.enviado:
            return error_response(
                mensaje="No se pudo enviar el código temporal por correo. Utiliza tu aplicación autenticadora.",
                codigo="ERROR_ENVIO_CORREO",
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return success_response(
            data={
                "expires_in": EMAIL_OTP_TTL_SECONDS,
                "email_masked": correo_enmascarado(user.email),
            },
            mensaje=f"Código temporal enviado a {correo_enmascarado(user.email)} (expira en 60 segundos).",
            status=status.HTTP_200_OK,
        )


class MFAVerifyAPIView(APIView):
    """Verifica el código TOTP (Google Authenticator / Authy) o código temporal de correo (60s) para completar el login."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = MFAVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                mensaje="Ingresa un código MFA válido de 6 dígitos.",
                codigo="CODIGO_MFA_INVALIDO",
                detalles=serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa_token = serializer.validated_data["mfa_token"]
        code = serializer.validated_data["code"]

        user_id = verify_mfa_challenge_token(mfa_token)
        if not user_id:
            return error_response(
                mensaje="La sesión de verificación MFA expiró. Vuelve a iniciar sesión.",
                codigo="MFA_TOKEN_EXPIRADO",
                status=status.HTTP_401_UNAUTHORIZED,
            )

        allowed, _, retry_after = check_rate_limit(request, scope="mfa_verify", identifier=str(user_id))
        if not allowed:
            resp = error_response(
                mensaje="Demasiados intentos fallidos de MFA. Espera 1 minuto antes de volver a intentarlo.",
                codigo="LIMITE_INTENTOS_EXCEDIDO",
                detalles={"retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            resp["Retry-After"] = str(retry_after)
            return resp

        django_user = UserModel.objects.filter(pk=user_id, is_active=True).first()
        mfa = UserMFA.objects.filter(user=django_user, is_enabled=True).first() if django_user else None
        if not django_user or not mfa:
            return error_response(
                mensaje="Cuenta o configuración MFA no encontrada.",
                codigo="USUARIO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )

        valid_totp = verify_totp_code(mfa.secret, code)
        valid_email = False if valid_totp else verify_email_otp_code(django_user.id, code)

        if not valid_totp and not valid_email:
            record_failed_attempt(request, scope="mfa_verify", identifier=str(user_id))
            return error_response(
                mensaje="El código ingresado es incorrecto o ha expirado.",
                codigo="CODIGO_MFA_INVALIDO",
                status=status.HTTP_401_UNAUTHORIZED,
            )

        reset_rate_limit(request, scope="mfa_verify", identifier=str(user_id))
        repo = DjangoUserRepository()
        user_entity = repo.get_by_id(django_user.id)
        token, _ = Token.objects.get_or_create(user=django_user)
        touch_token_activity(token.key, user=django_user)

        response = success_response(
            data={
                "user": UserResponseSerializer(user_entity).data,
                "token": token.key,
            },
            mensaje="Verificación MFA exitosa",
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, request, token.key, user=django_user)
        return response


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
