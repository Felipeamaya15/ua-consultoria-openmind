"""
Suite integral de pruebas de seguridad de autenticación:
1. Hashing Argon2id con salt único por usuario y actualización de hashes antiguos.
2. Rate limit de 5 intentos por minuto contra fuerza bruta.
3. CAPTCHA en inicio de sesión y registro (y anti-replay).
4. Validación y sanitización estricta, allowlists (correo, teléfono, código postal solo números y guiones),
   prevención de inyección SQL y escape contra XSS (<script> -> &lt;script&gt;).
5. Autenticación Multifactor (MFA) con TOTP (Google Authenticator / Authy) y código temporal de 60s por correo.
6. Cookies seguras (HttpOnly, Secure, SameSite) y destrucción de sesión tras 30 minutos de inactividad.
7. Flujo completo de 'Olvidé mi contraseña' con el servicio de correo configurado.
"""
import re
from urllib.parse import unquote
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core import mail, signing
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.authentication.infrastructure.captcha import (
    CAPTCHA_SALT,
    generate_captcha_challenge,
    verify_captcha_challenge,
)
from apps.authentication.infrastructure.cookie_auth import AUTH_COOKIE_NAME
from apps.authentication.infrastructure.models import UserMFA, UserProfile
from apps.authentication.infrastructure.totp import (
    generate_totp_code,
    generate_totp_secret,
    verify_totp_code,
)
from apps.core.domain.security_validators import (
    escape_xss,
    validate_date_field,
    validate_integer_field,
    validate_strict_email,
    validate_strict_phone,
    validate_strict_postal_code,
)

UserModel = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="Tienda Segura <no-reply@tienda.test>",
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_AGE=1800,
)
class SecurityAuthenticationSuiteTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        self.api = APIClient()
        self.password = "ClaveSegura2026!#"
        self.user = UserModel.objects.create_user(
            username="usuarioprueba",
            email="usuario@ejemplo.cl",
            password=self.password,
            first_name="María",
            last_name="González",
        )

    # ------------------------------------------------------------------ 1. Argon2id + Salt único
    def test_argon2id_hashing_and_unique_salt_per_user(self):
        u1 = UserModel.objects.create_user(username="u1", email="u1@ejemplo.cl", password=self.password)
        u2 = UserModel.objects.create_user(username="u2", email="u2@ejemplo.cl", password=self.password)
        self.assertTrue(u1.password.startswith("argon2$argon2id$"))
        self.assertTrue(u2.password.startswith("argon2$argon2id$"))
        self.assertNotEqual(u1.password, u2.password, "El salt debe ser aleatorio y único por usuario")

    def test_legacy_pbkdf2_hash_automatically_upgrades_to_argon2id_on_login(self):
        self.user.password = make_password(self.password, hasher="pbkdf2_sha256")
        self.user.save(update_fields=["password"])
        self.assertTrue(self.user.password.startswith("pbkdf2_sha256$"))

        resp = self.api.post(
            "/api/auth/login/",
            {"username": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.password.startswith("argon2$argon2id$"))

    # ------------------------------------------------------------------ 2. Rate limit 5 intentos / minuto
    def test_rate_limit_blocks_after_5_failed_attempts_per_minute(self):
        for attempt in range(5):
            resp = self.api.post(
                "/api/auth/login/",
                {"username": self.user.email, "password": f"Incorrecta{attempt}!A"},
                format="json",
            )
            self.assertEqual(resp.status_code, 401, f"Intento {attempt + 1} debía devolver 401")

        # El 6.º intento dentro del minuto es bloqueado con HTTP 429
        sixth = self.api.post(
            "/api/auth/login/",
            {"username": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(sixth.status_code, 429)
        self.assertEqual(sixth.data["error"]["codigo"], "LIMITE_INTENTOS_EXCEDIDO")
        self.assertIn("Retry-After", sixth)

    # ------------------------------------------------------------------ 3. CAPTCHA en Login y Registro
    def test_captcha_endpoint_and_anti_replay_verification(self):
        resp = self.api.get("/api/auth/captcha/")
        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertTrue(data["captcha_image"].startswith("data:image/svg+xml;base64,"))
        self.assertTrue(data["captcha_token"])

        # Respuesta incorrecta con X-Require-Captcha falla en login y registro
        bad_login = self.api.post(
            "/api/auth/login/",
            {
                "username": self.user.email,
                "password": self.password,
                "captcha_token": data["captcha_token"],
                "captcha_answer": "ZZZZZ",
            },
            format="json",
            HTTP_X_REQUIRE_CAPTCHA="1",
        )
        self.assertEqual(bad_login.status_code, 400)

        # Verificación directa y anti-replay
        with patch("apps.authentication.infrastructure.captcha.secrets.choice", return_value="A"):
            ch = generate_captcha_challenge()
        self.assertTrue(verify_captcha_challenge(ch["captcha_token"], "AAAAA"))
        self.assertFalse(verify_captcha_challenge(ch["captcha_token"], "AAAAA"), "No debe permitir reusar el mismo CAPTCHA")

    # ------------------------------------------------------------------ 4. Validación, Allowlists, SQLi y XSS
    def test_strict_validation_allowlists_sqli_and_xss_escaping(self):
        # Escape XSS: <script> -> &lt;script&gt;
        self.assertEqual(escape_xss("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;")

        # Código postal (Allowlist: solo números y guiones)
        self.assertEqual(validate_strict_postal_code("832-0000"), "832-0000")
        for invalid_postal in ("83200AB", "123<script>", "--1234", "12345-", "12"):
            with self.subTest(invalid_postal=invalid_postal):
                with self.assertRaises(ValueError):
                    validate_strict_postal_code(invalid_postal, allow_blank=False)

        # Tipos de datos estrictos (entero, fecha, correo, teléfono)
        self.assertEqual(validate_integer_field("42", "Edad", min_value=1, max_value=120), 42)
        with self.assertRaises(ValueError):
            validate_integer_field(True, "Edad")
        self.assertEqual(str(validate_date_field("2026-11-10", "Fecha")), "2026-11-10")
        with self.assertRaises(ValueError):
            validate_date_field("10/11/2026", "Fecha")
        self.assertEqual(validate_strict_email("Cliente.Nuevo@Dominio.CL"), "Cliente.Nuevo@dominio.cl")
        self.assertEqual(validate_strict_phone("+56 (9) 8765-4321"), "+56 (9) 8765-4321")

        # Rechazo de inyecciones SQL en login
        sqli_resp = self.api.post(
            "/api/auth/login/",
            {"username": "' OR '1'='1' UNION SELECT * FROM users --", "password": self.password},
            format="json",
        )
        self.assertEqual(sqli_resp.status_code, 400)

        # Escapado XSS al registrar o actualizar perfil
        reg_resp = self.api.post(
            "/api/auth/register/",
            {
                "username": "nuevousuario",
                "email": "nuevo@ejemplo.cl",
                "password": self.password,
                "first_name": "<script>alert(1)</script>",
                "last_name": "Pérez",
                "postal_code": "750-0000",
            },
            format="json",
        )
        self.assertEqual(reg_resp.status_code, 201, reg_resp.data)
        self.assertEqual(reg_resp.data["data"]["user"]["first_name"], "&lt;script&gt;alert(1)&lt;/script&gt;")
        self.assertEqual(UserProfile.objects.get(user__email="nuevo@ejemplo.cl").postal_code, "750-0000")

    # ------------------------------------------------------------------ 5. MFA con TOTP (Google Authenticator / Authy) y Correo 60s
    def test_mfa_totp_and_email_otp_flow(self):
        token = Token.objects.create(user=self.user)
        self.api.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        # 1. Configurar MFA
        setup_resp = self.api.post("/api/auth/mfa/setup/", {}, format="json")
        self.assertEqual(setup_resp.status_code, 200)
        secret = setup_resp.data["data"]["secret"]
        self.assertIn("otpauth://totp/", setup_resp.data["data"]["otpauth_url"])

        # 2. Activar MFA con código TOTP válido de 6 dígitos
        valid_totp = generate_totp_code(secret)
        self.assertTrue(verify_totp_code(secret, valid_totp))
        enable_resp = self.api.post("/api/auth/mfa/enable/", {"code": valid_totp}, format="json")
        self.assertEqual(enable_resp.status_code, 200)
        self.assertTrue(UserMFA.objects.get(user=self.user).is_enabled)

        # 3. Al iniciar sesión pide segundo factor (mfa_required: True)
        self.api.credentials()
        login_step1 = self.api.post(
            "/api/auth/login/",
            {"username": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_step1.status_code, 200)
        self.assertTrue(login_step1.data["data"]["mfa_required"])
        mfa_token = login_step1.data["data"]["mfa_token"]

        # 4. Completar login con código TOTP de Google Authenticator / Authy
        login_step2 = self.api.post(
            "/api/auth/mfa/verify/",
            {"mfa_token": mfa_token, "code": generate_totp_code(secret)},
            format="json",
        )
        self.assertEqual(login_step2.status_code, 200)
        self.assertIn("token", login_step2.data["data"])

        # 5. También permite recibir y verificar código temporal de 60 segundos por correo
        email_code_resp = self.api.post(
            "/api/auth/mfa/send-email-code/",
            {"mfa_token": mfa_token},
            format="json",
        )
        self.assertEqual(email_code_resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        match = re.search(r"\b(\d{6})\b", mail.outbox[-1].body)
        self.assertIsNotNone(match)
        email_otp = match.group(1)

        verify_email_resp = self.api.post(
            "/api/auth/mfa/verify/",
            {"mfa_token": mfa_token, "code": email_otp},
            format="json",
        )
        self.assertEqual(verify_email_resp.status_code, 200)

    # ------------------------------------------------------------------ 6. Cookies HttpOnly, Secure, SameSite y Expiración 30 min
    def test_cookie_security_attributes_and_30_minute_inactivity_destruction(self):
        login_resp = self.api.post(
            "/api/auth/login/",
            {"username": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_resp.status_code, 200)
        self.assertIn(AUTH_COOKIE_NAME, login_resp.cookies)

        cookie = login_resp.cookies[AUTH_COOKIE_NAME]
        self.assertTrue(cookie["httponly"], "La cookie debe tener HttpOnly=True")
        self.assertTrue(cookie["secure"], "La cookie debe tener Secure=True")
        self.assertEqual(cookie["samesite"], "Lax", "La cookie debe tener SameSite=Lax")
        self.assertEqual(int(cookie["max-age"]), 1800, "El tiempo de vida activo debe ser 30 minutos (1800s)")

        token_key = login_resp.data["data"]["token"]

        # Autenticación mediante cookie HttpOnly sin cabecera Authorization
        self.api.credentials()
        me_ok = self.api.get("/api/auth/me/")
        self.assertEqual(me_ok.status_code, 200)

        # Simular 31 minutos (1860 segundos) de inactividad
        cache.set(f"auth_session_last_activity:{token_key}", 1000.0, timeout=3600)
        with patch("apps.authentication.infrastructure.cookie_auth.time.time", return_value=1000.0 + 1860.0):
            expired_resp = self.api.get("/api/auth/me/")
        self.assertEqual(expired_resp.status_code, 401)
        self.assertFalse(Token.objects.filter(key=token_key).exists(), "El token debe destruirse en el servidor")
        self.assertEqual(expired_resp.cookies[AUTH_COOKIE_NAME].value, "", "La cookie debe borrarse en el cliente")

    # ------------------------------------------------------------------ 7. Olvidé mi contraseña por correo
    def test_forgot_password_sends_email_and_resets_password(self):
        req_resp = self.api.post(
            "/api/auth/password-reset/request/",
            {"email": self.user.email, "template": 1},
            format="json",
        )
        self.assertEqual(req_resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        sent_email = mail.outbox[0]
        self.assertEqual(sent_email.to, [self.user.email])
        self.assertIn("modo=restablecer&token=", sent_email.body)

        token_match = re.search(r"token=([^\s&]+)", sent_email.body)
        self.assertIsNotNone(token_match)
        reset_token = unquote(token_match.group(1))

        new_pwd = "NuevaClaveSegura2026$!"
        confirm_resp = self.api.post(
            "/api/auth/password-reset/confirm/",
            {"token": reset_token, "new_password": new_pwd},
            format="json",
        )
        self.assertEqual(confirm_resp.status_code, 200, confirm_resp.data)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_pwd))
        self.assertTrue(self.user.password.startswith("argon2$argon2id$"))

        # El mismo token no puede reutilizarse una segunda vez
        replay_resp = self.api.post(
            "/api/auth/password-reset/confirm/",
            {"token": reset_token, "new_password": "OtraClaveDistinta2026$!"},
            format="json",
        )
        self.assertEqual(replay_resp.status_code, 400)

    # ------------------------------------------------------------------ 8. Cookies inválidas/residuales no rompen endpoints públicos
    def test_stale_or_invalid_cookie_does_not_block_captcha_and_clears_cookie(self):
        # Simular que el navegador envía una cookie de un token que ya no existe (ej. tras logout)
        self.api.cookies[AUTH_COOKIE_NAME] = "token_huerfano_que_no_existe_en_db"
        resp = self.api.get("/api/auth/captcha/")
        self.assertEqual(resp.status_code, 200, "CAPTCHA debe cargar con HTTP 200 aunque la cookie sea inválida")
        self.assertTrue(resp.data.get("exito"))
        self.assertIn("captcha_image", resp.data.get("data", {}))
        # La respuesta debe indicar al navegador que borre la cookie inválida
        self.assertEqual(resp.cookies[AUTH_COOKIE_NAME].value, "", "La cookie huérfana debe borrarse en el cliente")

    def test_stale_or_invalid_cookie_does_not_block_google_login(self):
        # Simular petición a /api/auth/google/ con cookie inválida
        self.api.cookies[AUTH_COOKIE_NAME] = "token_huerfano_que_no_existe_en_db"
        # Con token inválido de Google debe devolver 400 o 401 desde GoogleLoginUseCase, NUNCA 'Token inválido' de DRF
        resp = self.api.post(
            "/api/auth/google/",
            {"token": "fake_google_token"},
            format="json",
        )
        self.assertNotEqual(
            resp.data.get("detail"),
            "Token inválido.",
            "No debe abortarse prematuramente por la cookie de sesión",
        )
        self.assertEqual(resp.cookies[AUTH_COOKIE_NAME].value, "", "La cookie huérfana debe borrarse en el cliente")
