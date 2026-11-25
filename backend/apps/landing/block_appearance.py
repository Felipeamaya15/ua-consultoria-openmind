"""Strict CSS value contract for content blocks; no arbitrary CSS is stored."""
import re
import uuid
from rest_framework import serializers

NUMBERS = {'width': (280,1800), 'height': (0,1200), 'margin': (0,160), 'padding': (0,120), 'gap': (0,120), 'borderWidth': (0,12), 'radius': (0,80), 'imageWidth': (20,100), 'imageHeight': (80,1000), 'imageX': (0,100), 'imageY': (0,100), 'imageScale': (1,2), 'galleryColumns': (1,4)}
CHOICES = {'verticalAlign': ['start','center','end'], 'layout': ['left','right','stack'], 'imageRatio': ['auto','1 / 1','4 / 3','3 / 2','16 / 9','3 / 4'], 'imageFit': ['cover','contain']}
COLORS = {'background','borderColor'}
for part in ('title','subtitle','body'):
    NUMBERS[f'{part}Size'] = (10,96)
    CHOICES[f'{part}Font'] = ['inherit','Arial','Georgia','Inter','DM Serif Display','Plus Jakarta Sans','system-ui']
    CHOICES[f'{part}Weight'] = ['300','400','500','600','700','800']
    CHOICES[f'{part}Align'] = ['left','center','right','justify']
    COLORS.add(f'{part}Color')


class BlockAppearanceSerializer(serializers.Serializer):
    plantilla = serializers.ChoiceField(choices=['editorial','minimal','visual','catalog'])
    bloques = serializers.JSONField()

    def validate_bloques(self, value):
        if not isinstance(value, dict) or len(value) > 100:
            raise serializers.ValidationError('Envía un objeto con hasta 100 ajustes de secciones.')
        for block_id, variants in value.items():
            try:
                if str(uuid.UUID(block_id)) != block_id:
                    raise ValueError()
            except (ValueError, TypeError, AttributeError):
                raise serializers.ValidationError('Identificador de sección inválido.') from None
            if not isinstance(variants, dict) or set(variants) - {'base','desktop','tablet','mobile'}:
                raise serializers.ValidationError('Variante de pantalla inválida.')
            for fields in variants.values():
                if not isinstance(fields, dict):
                    raise serializers.ValidationError('Ajustes inválidos.')
                for key, item in fields.items():
                    valid = False
                    if key in NUMBERS:
                        low, high = NUMBERS[key]
                        valid = type(item) in (int, float) and low <= item <= high
                    elif key in CHOICES:
                        valid = isinstance(item, str) and item in CHOICES[key]
                    elif key in COLORS:
                        valid = isinstance(item, str) and bool(re.fullmatch(r'#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{5})?|inherit|transparent', item))
                    if not valid:
                        raise serializers.ValidationError(f'Ajuste visual no admitido: {key}.')
        return value
