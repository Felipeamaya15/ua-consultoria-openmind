import re

def validate_image_format_and_size(image_field, max_size_mb: int = 2):
    from apps.core.image_processing import process_upload
    process_upload(image_field, max_size_mb)


def validate_base64_image(base64_str, max_size_mb=2):
    from apps.core.image_processing import normalize_image_url
    return normalize_image_url(base64_str, max_size_mb)


def validar_password_segura(password: str) -> None:
    if not password or not isinstance(password, str):
        raise ValueError("La contraseña no puede estar vacía.")

    if len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres.")

    if len(password) > 128:
        raise ValueError("La contraseña no puede superar los 128 caracteres.")

    if "\x00" in password:
        raise ValueError("La contraseña contiene caracteres no permitidos.")

    if not re.search(r"[A-Z]", password):
        raise ValueError("La contraseña debe contener al menos una letra mayúscula.")

    if not re.search(r"[a-z]", password):
        raise ValueError("La contraseña debe contener al menos una letra minúscula.")

    if not re.search(r"\d", password):
        raise ValueError("La contraseña debe contener al menos un número.")

    if not re.search(r"[@$!%*?&#/._\-]", password):
        raise ValueError("La contraseña debe contener al menos un carácter especial (@, $, !, %, *, ?, &, #, _, -, .).")
