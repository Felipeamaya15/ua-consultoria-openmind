"""Additive schema for configurable sections; legacy section shapes remain valid."""
from rest_framework import serializers
from apps.authentication.presentation.profile import StrictSerializer
from apps.landing.media_library import media_url
from apps.landing.social_profiles import normalize_profile


TEXT_ELEMENTS = ('titulo', 'subtitulo', 'texto', 'nombre', 'caracteristicas', 'informacion', 'duracion', 'requisitos', 'condiciones')
ELEMENT_TYPES = TEXT_ELEMENTS + ('imagen', 'galeria', 'youtube', 'biblioteca', 'social', 'separador',
                                 'boton', 'whatsapp', 'precio', 'fecha', 'horario', 'modalidad', 'ubicacion', 'consulta', 'inscripcion')


class SectionElementSerializer(StrictSerializer):
    id = serializers.UUIDField(format='hex_verbose')
    tipo = serializers.ChoiceField(choices=ELEMENT_TYPES)
    visible = serializers.BooleanField(default=True)
    vista_abierta = serializers.BooleanField(required=False)
    texto = serializers.CharField(max_length=5000, allow_blank=True, required=False)
    url = serializers.CharField(max_length=2000, required=False)
    recurso_id = serializers.UUIDField(format='hex_verbose', required=False)
    proveedor = serializers.ChoiceField(choices=('instagram', 'facebook'), required=False)
    etiqueta = serializers.CharField(max_length=100, required=False)
    numero = serializers.CharField(max_length=40, required=False)
    mensaje = serializers.CharField(max_length=500, allow_blank=True, required=False)
    importe = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=0, required=False)
    fecha = serializers.DateField(required=False)
    hasta = serializers.DateField(required=False)
    inicio = serializers.TimeField(required=False)
    termino = serializers.TimeField(required=False)
    modalidad = serializers.ChoiceField(choices=('presencial', 'online', 'mixta'), required=False)
    imagenes = serializers.ListField(required=False, max_length=8)

    def validate_id(self, value):
        return str(value)

    def validate_recurso_id(self, value):
        return str(value)

    def validate(self, data):
        kind = data['tipo']
        fields = {'id', 'tipo', 'visible'}
        if kind in ('biblioteca', 'youtube', 'social'):
            fields.add('vista_abierta')
        allowed = {**{kind: {'texto'} for kind in TEXT_ELEMENTS},
                   'imagen': {'imagenes'}, 'galeria': {'imagenes'}, 'youtube': {'url'},
                   'biblioteca': {'recurso_id'}, 'social': {'proveedor', 'url'}, 'separador': set(),
                   'boton': {'etiqueta', 'url'}, 'whatsapp': {'etiqueta', 'numero', 'mensaje'},
                   'precio': {'importe'}, 'fecha': {'fecha', 'hasta'}, 'horario': {'inicio', 'termino'},
                   'consulta': {'etiqueta'}, 'inscripcion': {'etiqueta'},
                   'modalidad': {'modalidad'}, 'ubicacion': {'texto', 'url'}}[kind]
        if set(data) - fields - allowed:
            raise serializers.ValidationError('El bloque contiene campos que no corresponden a su tipo.')
        required = allowed - {'mensaje', 'termino', 'url'} if kind == 'whatsapp' else allowed
        if kind == 'ubicacion':
            required = {'texto'}
        if kind == 'horario':
            required = {'inicio'}
        if kind == 'fecha':
            required = {'fecha'}
        if not required.issubset(data):
            raise serializers.ValidationError('Completa los campos del bloque antes de guardar.')
        if 'url' in data:
            provider = data.get('proveedor') if kind == 'social' else 'youtube' if kind == 'youtube' else 'enlace'
            data['url'] = media_url(provider, data['url'])
        if kind == 'whatsapp':
            data['numero'] = normalize_profile('whatsapp', data['numero'])
        if kind in ('imagen', 'galeria'):
            from apps.landing.content_serializers import ImagenBloqueSerializer
            images = ImagenBloqueSerializer(data=data['imagenes'], many=True)
            images.is_valid(raise_exception=True)
            data['imagenes'] = images.validated_data
            maximum = 1 if kind == 'imagen' else 8
            if not 1 <= len(data['imagenes']) <= maximum:
                raise serializers.ValidationError(f'Este bloque requiere entre 1 y {maximum} imágenes.')
            if len({image['id'] for image in data['imagenes']}) != len(data['imagenes']):
                raise serializers.ValidationError('Las imágenes deben tener identificadores únicos.')
        if 'termino' in data and data['termino'] <= data['inicio']:
            raise serializers.ValidationError('La hora de término debe ser posterior al inicio.')
        if 'hasta' in data and data['hasta'] < data['fecha']:
            raise serializers.ValidationError('La fecha de término no puede ser anterior al inicio.')
        for key in ('fecha', 'hasta', 'inicio', 'termino'):
            if key in data:
                data[key] = data[key].isoformat()
        if 'importe' in data:
            data['importe'] = str(data['importe'])
        return data



def section_video_ids(blocks, *, published_only=False):
    ids = set()

    for section in blocks:
        if published_only and not section.get('visible'):
            continue

        containers = [section]

        if section.get('tipo') == 'personalizada':
            containers.extend(
                element
                for element in section.get('componentes', [])
                if not published_only or element.get('visible')
            )

        for container in containers:
            for item in container.get('imagenes', []):
                resource_id = item.get('video_recurso_id')
                if resource_id:
                    ids.add(str(resource_id))

    return ids


def referenced_media(blocks, *, published_only=False):
    ids = section_video_ids(
        blocks, published_only=published_only
    )

    for section in blocks:
        if section.get('tipo') != 'personalizada':
            continue

        if published_only and not section.get('visible'):
            continue

        for element in section.get('componentes', []):
            if published_only and not element.get('visible'):
                continue

            if element.get('tipo') == 'biblioteca':
                resource_id = element.get('recurso_id')
                if resource_id:
                    ids.add(str(resource_id))

    return ids


def validate_media_references(blocks, store, previous=()):
    from apps.landing.models import RecursoMultimedia
    video_ids = section_video_ids(blocks)
    ids = referenced_media(blocks)
    if not ids:
        return
    if store is None:
        raise serializers.ValidationError('No se pudo identificar la tienda de los recursos.')
    resources = {str(item.pk): item for item in RecursoMultimedia.objects.filter(tienda=store, pk__in=ids)}

    def contar_videos(seccion):
        componentes = seccion.get('componentes', [])

        contenedores = [seccion, *componentes]

        subidos = sum(
            1
            for contenedor in contenedores
            for imagen in contenedor.get('imagenes', [])
            if imagen.get('video_recurso_id')
        )

        biblioteca = sum(
            1
            for componente in componentes
            if componente.get('tipo') == 'biblioteca'
            and (
                recurso := resources.get(
                    str(componente.get('recurso_id') or '')
                )
            ) is not None
            and recurso.tipo == 'video'
        )

        return subidos + biblioteca

    anteriores = {
        seccion['id']: seccion
        for seccion in previous
    }

    for seccion in blocks:
        cantidad = contar_videos(seccion)

        anterior = anteriores.get(seccion['id'])
        cantidad_anterior = (
            contar_videos(anterior) if anterior else 0
        )

        if cantidad > 1 and cantidad > cantidad_anterior:
            raise serializers.ValidationError(
                'Cada seccion permite como maximo un video. '
                'Quita el otro video antes de guardar.'
            )

    for key in video_ids:
        resource = resources.get(key)

        if (
            resource is None
            or resource.tipo != 'video'
            or resource.archivo is None
            or resource.archivo.mime not in ('video/mp4', 'video/webm')
        ):
            raise serializers.ValidationError(
                'Selecciona un video valido de la biblioteca de esta tienda.'
            )

    previous_ids = referenced_media(previous)
    if any(key not in resources or (key not in previous_ids and (not resources[key].activo or resources[key].eliminado)) for key in ids):
        raise serializers.ValidationError('Selecciona recursos activos de la biblioteca de esta tienda. Las referencias anteriores no disponibles pueden ocultarse o eliminarse.')


def public_section_content(content, store):
    """Do not publish configurable drafts, internal names or inactive media references."""
    import copy
    from apps.landing.media_library import available_media
    blocks = content.get('bloques', [])
    if not any(block.get('tipo') == 'personalizada' for block in blocks):
        return content
    result = copy.deepcopy(content)
    active_ids = {str(item.pk) for item in available_media(store, referenced_media(blocks, published_only=True))}
    published = []
    for block in result['bloques']:
        if block.get('tipo') == 'personalizada':
            if block.get('actividad'):
                block['actividad'].pop('enlace_reunion', None)
            if not block.get('visible'):
                continue
            block.pop('nombre_interno', None)
            block['componentes'] = [element for element in block.get('componentes', []) if element.get('visible') and
                (element.get('tipo') != 'biblioteca' or element.get('recurso_id') in active_ids)]
        published.append(block)
    result['bloques'] = published
    return result
