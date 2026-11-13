"""
Validación estricta, sanitización de entradas, listas blancas (Allowlists)
y prevención de inyecciones SQL y XSS (Cross-Site Scripting).
"""
from datetime import date, datetime
import html
import re
from typing import Optional, Union

# Longitudes máximas estrictas
MAX_EMAIL_LENGTH = 254
MAX_USERNAME_LENGTH = 150
MAX_NAME_LENGTH = 150
MAX_PHONE_LENGTH = 20
MAX_POSTAL_CODE_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
MAX_TEXT_LENGTH = 500

# Expresiones regulares estrictas (Listas blancas / Allowlists)
EMAIL_ALLOWLIST_REGEX = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24}$"
)
PHONE_ALLOWLIST_REGEX = re.compile(
    r"^\+?[0-9 ()\-]{7,20}$"
)
# Código postal: lista blanca estricta que solo permite números y guiones
POSTAL_CODE_ALLOWLIST_REGEX = re.compile(
    r"^[0-9\-]{3,12}$"
)
# Nombres y apellidos: letras (incluyendo tildes/ñ), espacios, apóstrofes y guiones
PERSON_NAME_ALLOWLIST_REGEX = re.compile(
    r"^[a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ\s'\-]{1,150}$"
)
# Username: alfanumérico y caracteres seguros . _ @ -
USERNAME_ALLOWLIST_REGEX = re.compile(
    r"^[a-zA-Z0-9._@\-]{2,150}$"
)
# Código OTP / MFA: exclusivamente 6 dígitos numéricos
OTP_ALLOWLIST_REGEX = re.compile(
    r"^[0-9]{6}$"
)
# Respuesta CAPTCHA: exclusivamente caracteres alfanuméricos o signo menos para resultados numéricos
CAPTCHA_ALLOWLIST_REGEX = re.compile(
    r"^[a-zA-Z0-9]{2,10}$"
)

# Patrones de detección temprana de intentos de inyección SQL en entradas de texto
_SQL_INJECTION_PATTERNS = re.compile(
    r"(?:"
    r"\b(?:UNION\s+(?:ALL\s+)?SELECT|SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|DATABASE)|ALTER\s+TABLE|EXEC(?:UTE)?\s+| xp_cmdshell|SLEEP\s*\(|BENCHMARK\s*\(|WAITFOR\s+DELAY)\b"
    r"|(?:'\s*(?:OR|AND)\s*'?\d+'?\s*=\s*'?\d+)"
    r"|(?:\"\s*(?:OR|AND)\s*\"?\d+\"?\s*=\s*\"?\d+)"
    r"|(?:;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\b)"
    r"|(?:--\s*$)"
    r"|(?:/\*[\s\S]*?\*/)"
    r")",
    re.IGNORECASE,
)

# Caracteres de control peligrosos (excepto tab, salto de línea estándar cuando aplique)
_CONTROL_CHARS_REGEX = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def escape_xss(value: str) -> str:
    """
    Escapa caracteres peligrosos convirtiéndolos en entidades HTML seguras
    para prevenir ataques XSS (Cross-Site Scripting).
    Ejemplo: '<script>alert(1)</script>' -> '&lt;script&gt;alert(1)&lt;/script&gt;'
    """
    if not isinstance(value, str):
        raise ValueError("El valor a escapar debe ser una cadena de texto (string).")
    return html.escape(html.unescape(value), quote=True)


def contains_sql_injection(value: str) -> bool:
    """Detecta patrones de inyección SQL o caracteres de control nulos."""
    if not isinstance(value, str):
        return False
    if "\x00" in value or _CONTROL_CHARS_REGEX.search(value):
        return True
    return bool(_SQL_INJECTION_PATTERNS.search(value))


def validate_string_field(
    value: object,
    field_name: str,
    *,
    max_length: int = MAX_TEXT_LENGTH,
    min_length: int = 0,
    allow_blank: bool = False,
    allowlist_regex: Optional[re.Pattern] = None,
    allowlist_error: Optional[str] = None,
    escape_html: bool = True,
    check_sqli: bool = True,
) -> str:
    """
    Valida estrictamente el tipo de dato string, longitud máxima/mínima,
    ausencia de inyección SQL, cumplimiento de lista blanca (Allowlist)
    y escapa caracteres HTML peligrosos contra XSS.
    """
    if not isinstance(value, str):
        raise ValueError(f"{field_name}: Tipo de dato inválido, se esperaba texto (string).")

    cleaned = value.strip()
    if not cleaned:
        if allow_blank:
            return ""
        raise ValueError(f"{field_name}: Este campo no puede estar vacío.")

    if len(cleaned) < min_length:
        raise ValueError(f"{field_name}: Debe tener al menos {min_length} caracteres.")

    if len(cleaned) > max_length:
        raise ValueError(f"{field_name}: No puede superar los {max_length} caracteres.")

    if "\x00" in cleaned or _CONTROL_CHARS_REGEX.search(cleaned):
        raise ValueError(f"{field_name}: Contiene caracteres de control no permitidos.")

    if check_sqli and contains_sql_injection(cleaned):
        raise ValueError(f"{field_name}: Contiene patrones o caracteres no permitidos por seguridad.")

    if allowlist_regex is not None and not allowlist_regex.fullmatch(cleaned):
        raise ValueError(
            allowlist_error
            or f"{field_name}: Contiene caracteres fuera de la lista blanca permitida."
        )

    return escape_xss(cleaned) if escape_html else cleaned


def validate_integer_field(
    value: object,
    field_name: str,
    *,
    min_value: Optional[int] = None,
    max_value: Optional[int] = None,
) -> int:
    """Valida estrictamente que un valor sea un número entero dentro de los límites permitidos."""
    if isinstance(value, bool):
        raise ValueError(f"{field_name}: Tipo de dato inválido, se esperaba un número entero.")
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and re.fullmatch(r"-?\d+", value.strip()):
        parsed = int(value.strip())
    else:
        raise ValueError(f"{field_name}: Tipo de dato inválido, se esperaba un número entero.")

    if min_value is not None and parsed < min_value:
        raise ValueError(f"{field_name}: El valor mínimo permitido es {min_value}.")
    if max_value is not None and parsed > max_value:
        raise ValueError(f"{field_name}: El valor máximo permitido es {max_value}.")
    return parsed


def validate_date_field(
    value: Union[str, date, datetime],
    field_name: str,
) -> date:
    """Valida estrictamente que un valor sea una fecha válida en formato ISO YYYY-MM-DD."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        raise ValueError(f"{field_name}: Tipo de dato inválido, se esperaba una fecha (YYYY-MM-DD).")
    cleaned = value.strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
        raise ValueError(f"{field_name}: Formato de fecha inválido, usa YYYY-MM-DD.")
    try:
        return date.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError(f"{field_name}: La fecha ingresada no es válida.") from exc


def validate_strict_email(value: object) -> str:
    """Valida correo electrónico con longitud máxima (254), Regex y lista blanca."""
    cleaned = validate_string_field(
        value,
        "Correo electrónico",
        max_length=MAX_EMAIL_LENGTH,
        min_length=5,
        allowlist_regex=EMAIL_ALLOWLIST_REGEX,
        allowlist_error="Introduce un correo electrónico con formato válido.",
        escape_html=False,
        check_sqli=True,
    )
    local, _, domain = cleaned.partition("@")
    if ".." in cleaned or local.startswith(".") or local.endswith(".") or domain.startswith("-") or domain.endswith("-"):
        raise ValueError("Introduce un correo electrónico con formato válido.")
    return f"{local}@{domain.lower()}"


def validate_strict_phone(value: object, *, allow_blank: bool = True) -> str:
    """Valida teléfono con Regex y lista blanca (+, dígitos, espacios, paréntesis y guiones; 7 a 15 dígitos)."""
    cleaned = validate_string_field(
        value,
        "Teléfono",
        max_length=MAX_PHONE_LENGTH,
        allow_blank=allow_blank,
        allowlist_regex=PHONE_ALLOWLIST_REGEX,
        allowlist_error="Introduce un teléfono válido (solo números, +, espacios, paréntesis y guiones).",
        escape_html=True,
        check_sqli=True,
    )
    if not cleaned:
        return ""
    digits = re.sub(r"\D", "", cleaned)
    if not (7 <= len(digits) <= 15):
        raise ValueError("Introduce un teléfono válido de 7 a 15 dígitos.")
    return cleaned


def validate_strict_postal_code(value: object, *, allow_blank: bool = True) -> str:
    """
    Valida un código postal aplicando lista blanca estricta (Allowlist):
    solo permite números y guiones (3 a 12 caracteres).
    """
    cleaned = validate_string_field(
        value,
        "Código postal",
        max_length=MAX_POSTAL_CODE_LENGTH,
        allow_blank=allow_blank,
        allowlist_regex=POSTAL_CODE_ALLOWLIST_REGEX,
        allowlist_error="El código postal solo puede contener números y guiones.",
        escape_html=True,
        check_sqli=True,
    )
    if cleaned and (cleaned.startswith("-") or cleaned.endswith("-") or "--" in cleaned):
        raise ValueError("El código postal tiene un formato de guiones inválido.")
    return cleaned


def validate_strict_person_name(value: object, field_name: str = "Nombre", *, allow_blank: bool = True) -> str:
    """
    Valida nombres o apellidos:
    - Escapa etiquetas HTML/XSS (<script> -> &lt;script&gt;) o rechaza inyecciones SQL.
    - Verifica longitud máxima de 150 caracteres y lista blanca de caracteres.
    """
    if not isinstance(value, str):
        raise ValueError(f"{field_name}: Tipo de dato inválido, se esperaba texto (string).")
    raw = value.strip()
    if not raw:
        if allow_blank:
            return ""
        raise ValueError(f"{field_name}: Este campo es obligatorio.")
    if len(raw) > MAX_NAME_LENGTH:
        raise ValueError(f"{field_name}: No puede superar los {MAX_NAME_LENGTH} caracteres.")
    if contains_sql_injection(raw):
        raise ValueError(f"{field_name}: Contiene patrones no permitidos por seguridad.")
    # Si contiene caracteres HTML como < o >, los escapamos a texto plano (&lt;script&gt;)
    if any(ch in raw for ch in ("<", ">", "&", '"')):
        return escape_xss(raw)
    if not PERSON_NAME_ALLOWLIST_REGEX.fullmatch(raw):
        raise ValueError(
            f"{field_name}: Solo se permiten letras, espacios, apóstrofes y guiones."
        )
    return escape_xss(raw)


def validate_strict_username(value: object) -> str:
    """Valida nombre de usuario o identificador con longitud máxima y lista blanca."""
    return validate_string_field(
        value,
        "Usuario",
        max_length=MAX_USERNAME_LENGTH,
        min_length=2,
        allowlist_regex=USERNAME_ALLOWLIST_REGEX,
        allowlist_error="El nombre de usuario solo puede contener letras, números y los símbolos . _ @ -",
        escape_html=False,
        check_sqli=True,
    )
