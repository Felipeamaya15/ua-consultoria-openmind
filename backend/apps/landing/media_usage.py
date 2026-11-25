"""References to library resources, including saved but hidden compositions."""
from apps.landing.models import ConfiguracionLanding
from apps.landing.section_elements import referenced_media


def media_usage(store):
    config = ConfiguracionLanding.objects.filter(tienda=store).first()
    if not config:
        return {}
    content = config.contenido or {}
    usage = {}
    for block in content.get('bloques', []):
        for key in referenced_media([block]):
            usage.setdefault(key, []).append(block.get('titulo') or 'Sección de la tienda')
    for slide in content.get('carrusel_recursos', []):
        key = str(slide.get('recurso_id', ''))
        if key:
            usage.setdefault(key, []).append('Carrusel de portada')
    return {key: list(dict.fromkeys(labels)) for key, labels in usage.items()}
