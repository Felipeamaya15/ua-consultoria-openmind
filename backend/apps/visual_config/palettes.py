"""One tenant-scoped source for Design, storefront and Marketing palettes."""
import json
import re
import uuid

from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response, error_response
from apps.visual_config.models import ConfiguracionVisual

ROLES = ('primary', 'secondary', 'accent', 'background', 'alternate', 'surface', 'text', 'muted', 'structural', 'button', 'buttonText', 'border')
TEMPLATES = ('editorial', 'minimal', 'visual', 'catalog')


def system_palette(name, primary, secondary, accent):
    return {'id': 'system-' + slugify(name), 'nombre': name, 'colores': dict(zip(ROLES, (
        primary, secondary, accent, '#fafafa', secondary, '#ffffff', '#18202e', '#596579', primary, primary, '#ffffff', '#cdd4de')))}


# Original visual-editor palettes, verified against HEAD's visualEditor/palettes.tsx.
SYSTEM_PALETTES = [system_palette(*values) for values in (
    ('Océano', '#2563eb', '#eff6ff', '#0ea5e9'), ('Bosque', '#15803d', '#f0fdf4', '#84cc16'),
    ('Ciruela', '#7e22ce', '#faf5ff', '#d946ef'), ('Grafito', '#1f2937', '#f3f4f6', '#f97316'),
)]
# Read-only compatibility for saved Marketing documents. These never become picker cards.
LEGACY_SYSTEM_PALETTES = [system_palette(*values) for values in (
    ('Original', '#1a3a6b', '#eef1f8', '#e04b1a'), ('Tinta y papel', '#172b3a', '#f3e9d2', '#bd8845'),
    ('Moderna', '#111111', '#f2f2f2', '#ff5a1f'), ('Minimal', '#5433eb', '#f0edff', '#6d5dfc'),
    ('Cálida', '#78350f', '#fff7ed', '#d97706'), ('Natural', '#2f5d50', '#edf4ee', '#b7791f'),
)]


class PaletteSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=60)
    colores = serializers.DictField(child=serializers.RegexField(r'^#[0-9a-fA-F]{6}$'))

    def validate_colores(self, value):
        if set(value) != set(ROLES):
            raise serializers.ValidationError('Define los 12 colores de la paleta.')
        return value


def read_data(config):
    return config.personalizacion if config and isinstance(config.personalizacion, dict) else {}


class PalettesAPIView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def get(self, request):
        store = resolver_tienda(request)
        data = read_data(ConfiguracionVisual.objects.filter(tienda=store).first())
        response = success_response(data={'sistema': SYSTEM_PALETTES, 'compatibles': LEGACY_SYSTEM_PALETTES, 'propias': data.get('paletas', []), 'limite': 2})
        response['Cache-Control'] = 'no-store'
        return response

    def mutate(self, request, palette_id=None, deleting=False):
        store = resolver_tienda(request, exigir_propietario=True)
        serializer = PaletteSerializer(data=request.data)
        if not deleting:
            serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            config, _ = ConfiguracionVisual.objects.get_or_create(tienda=store)
            data = read_data(config)
            palettes = list(data.get('paletas', []))
            existing = next((item for item in palettes if item['id'] == str(palette_id)), None)
            if palette_id and not existing:
                raise NotFound('No encontramos esa paleta en tu tienda.')
            if deleting:
                if any(value.get('paleta_id') == str(palette_id) for value in data.get('editor', {}).values()):
                    return error_response('Aplica y guarda otra paleta antes de eliminar esta.', 'PALETA_EN_USO', status=409)
                palettes = [item for item in palettes if item['id'] != str(palette_id)]
            else:
                if not existing and len(palettes) >= 2:
                    raise serializers.ValidationError('Puedes guardar un máximo de 2 paletas personalizadas. Edita o elimina una para crear otra.')
                if any(item['nombre'].casefold() == serializer.validated_data['nombre'].casefold() and item != existing for item in palettes):
                    raise serializers.ValidationError({'nombre': 'Ya tienes una paleta con ese nombre.'})
                value = {'id': str(palette_id or uuid.uuid4()), **serializer.validated_data}
                palettes = [value if item == existing else item for item in palettes] if existing else palettes + [value]
            config.personalizacion = {**data, 'paletas': palettes}
            config.save(update_fields=['personalizacion'])
        return success_response(data={'propias': palettes}, status=201 if not palette_id else 200)

    def post(self, request):
        return self.mutate(request)

    def put(self, request, palette_id):
        return self.mutate(request, palette_id)

    def delete(self, request, palette_id):
        return self.mutate(request, palette_id, deleting=True)


class AppearanceAPIView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def get(self, request):
        store = resolver_tienda(request)
        data = read_data(ConfiguracionVisual.objects.filter(tienda=store).first())
        response = success_response(data={'plantillas': data.get('editor', {})})
        response['Cache-Control'] = 'no-store'
        return response

    def put(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        templates = request.data.get('plantillas')
        if not isinstance(templates, dict) or set(templates) - set(TEMPLATES) or len(json.dumps(templates)) > 200000:
            raise serializers.ValidationError('Envía ajustes de las cuatro plantillas compatibles.')
        # OPENMIND_SAFE_ONLINE_EFFECTS_V1: compatibilidad con Magic CSS y presets previos.
        # No habilita CSS o JavaScript arbitrarios en ninguna propiedad.
        effect_fields = frozenset((
            'carouselTransition',
            'hoverFeaturedMotion', 'hoverFeaturedLight',
            'hoverCatalogMotion', 'hoverCatalogLight',
            'hoverCategoryMotion', 'hoverCategoryLight',
        ))
        magic_id = re.compile(r'magic:[a-zA-Z][a-zA-Z0-9]{1,47}\Z')

        def valid_legacy_presets(serialized):
            # Compatibilidad con un dato existente de una versión anterior del editor.
            # Solo se aceptan recetas declarativas en el formato que ya generaba OpenMind.
            if len(serialized) > 24000:
                return False
            try:
                presets = json.loads(serialized)
            except (ValueError, TypeError):
                return False
            if not isinstance(presets, list) or len(presets) > 16:
                return False
            for preset in presets:
                if not isinstance(preset, dict) or set(preset) != {'id', 'name', 'kind', 'settings'}:
                    return False
                if not isinstance(preset['id'], str) or not re.fullmatch(r'[0-9a-fA-F-]{36}', preset['id']):
                    return False
                name = preset['name']
                if not isinstance(name, str) or not (3 <= len(name) <= 60) or any(ord(ch) < 32 or ch in '<>' for ch in name):
                    return False
                settings = preset['settings']
                if not isinstance(settings, dict):
                    return False
                if preset['kind'] == 'product':
                    if set(settings) != {'motion', 'light'} or any(
                        not isinstance(v, str) or not (
                            re.fullmatch(r'[a-zA-Z][a-zA-Z0-9]*', v) or magic_id.fullmatch(v)
                        ) for v in settings.values()
                    ):
                        return False
                elif preset['kind'] == 'carousel':
                    if set(settings) != {'mode', 'interval', 'transition', 'indicators'}:
                        return False
                    transition = settings['transition']
                    if settings['mode'] not in ('static', 'manual', 'automatic') or type(settings['interval']) is not int or settings['interval'] not in (5, 10, 20) or type(settings['indicators']) is not bool or not isinstance(transition, str) or not (re.fullmatch(r'[a-zA-Z][a-zA-Z0-9]*', transition) or magic_id.fullmatch(transition)):
                        return False
                else:
                    return False
            return True

        def validate_tree(value, depth=0, field=None, path=()):
            if depth > 12:
                return False
            if isinstance(value, dict):
                return len(value) <= 100 and all(
                    isinstance(key, str)
                    and re.fullmatch(r'[a-zA-Z][a-zA-Z0-9]*', key)
                    and key not in ('constructor', 'prototype')
                    and validate_tree(child, depth+1, key, (*path, key))
                    for key, child in value.items()
                )
            if isinstance(value, bool):
                return True
            if isinstance(value, (int, float)):
                return 0 <= value <= 10000
            if not isinstance(value, str):
                return False
            # OPENMIND_PROMO_TEXT_PERSISTENCE_FIX_V1
            # Texto de la etiqueta: el frontend permite hasta 100 caracteres,
            # incluidos espacios, tildes y signos. Es texto plano, NO CSS.
            # Solo se acepta en la propiedad de etiqueta del hero.
            if path in (
                ('hero', 'promoText'),
                ('responsive', 'tablet', 'hero', 'promoText'),
                ('responsive', 'mobile', 'hero', 'promoText'),
            ):
                return len(value) <= 100 and all(
                    char.isprintable() and char not in '<>' for char in value
                )
            if field in effect_fields and magic_id.fullmatch(value):
                return True
            if field == 'importedEffectPresets':
                return valid_legacy_presets(value)
            return len(value) <= 60 and bool(re.fullmatch(r'#[0-9a-fA-F]{3,8}|[a-zA-Z][a-zA-Z0-9]*', value))
        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=store.pk)
            config, _ = ConfiguracionVisual.objects.get_or_create(tienda=store)
            data = read_data(config)
            ids = {item['id'] for item in data.get('paletas', [])}
            for value in templates.values():
                if not isinstance(value, dict) or set(value) - {'visualConfig', 'paleta_id'} or not validate_tree(value.get('visualConfig', {})):
                    raise serializers.ValidationError('Apariencia inválida.')
                if value.get('paleta_id') is not None and value['paleta_id'] not in ids:
                    raise serializers.ValidationError('La paleta ya no pertenece a esta tienda. Selecciona otra.')
            config.personalizacion = {**data, 'editor': {**data.get('editor', {}), **templates}}
            config.save(update_fields=['personalizacion'])
        return success_response(data={'plantillas': config.personalizacion['editor']})
