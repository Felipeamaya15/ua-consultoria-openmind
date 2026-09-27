import os
import re
from django.core.exceptions import ValidationError

def validate_image_format_and_size(image_field, max_size_mb: int = 2):
    """ Para el Logo (PostgreSQL - ImageField) """
    limit_kb = max_size_mb * 1024 * 1024
    if image_field.size > limit_kb:
        raise ValidationError(f'El archivo es demasiado grande. El tamaño máximo es {max_size_mb}MB.')

    ext = os.path.splitext(image_field.name)[1].lower()
    valid_extensions = ['.jpg', '.jpeg', '.png', '.webp']
    if ext not in valid_extensions:
        raise ValidationError(f'Formato no soportado. Formatos permitidos: {", ".join(valid_extensions)}')

def validate_base64_image(base64_str, max_size_mb=2):
    """ Para los Productos (MongoDB - Base64) """
    if base64_str.startswith('http') or base64_str.startswith('/'):
        return
        
    match = re.match(r'^data:image/(jpeg|jpg|png|webp);base64,', base64_str)
    if not match:
        raise ValidationError("Formato de imagen no soportado. Solo se permite JPG, PNG o WEBP.")
    
    size_in_bytes = (len(base64_str) * 3) / 4
    if size_in_bytes > (max_size_mb * 1024 * 1024):
        raise ValidationError(f"La imagen excede el peso permitido. El tamaño máximo es {max_size_mb}MB.")