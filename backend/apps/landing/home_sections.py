from rest_framework import serializers

SYSTEM_SECTION_IDS = frozenset([
    'sistema:destacados', 'sistema:categorias', 'sistema:banner',
    'sistema:mas-productos', 'sistema:contenido', 'sistema:descubrir',
])


def validate_home_order(order, blocks):
    allowed = SYSTEM_SECTION_IDS | {block['id'] for block in blocks}
    if len(order) != len(set(order)):
        raise serializers.ValidationError({'orden_apartados': 'Cada apartado debe aparecer una sola vez.'})
    if any(reference not in allowed for reference in order):
        raise serializers.ValidationError({'orden_apartados': 'Selecciona apartados del sistema o secciones existentes de esta tienda.'})


def reconcile_home_order(content):
    """Older clients may remove blocks without knowing the optional order field."""
    if 'orden_apartados' in content:
        allowed = SYSTEM_SECTION_IDS | {block['id'] for block in content.get('bloques', [])}
        content['orden_apartados'] = [reference for reference in content['orden_apartados'] if reference in allowed]
    return content
