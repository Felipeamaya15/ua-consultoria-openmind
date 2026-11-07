"""Activities reuse saved section UUIDs and their editable visual blocks."""
from datetime import date, datetime, time, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError

from apps.authentication.presentation.profile import StrictSerializer
from apps.landing.media_library import media_url

CONSULT_STATES = ('nueva', 'en_revision', 'respondida', 'cerrada')
ENROLL_STATES = ('pendiente', 'confirmada', 'cancelada')
CONSENT_VERSION = 'actividad-gestion-v1'


class ActivityConfigSerializer(StrictSerializer):
    tipo = serializers.ChoiceField(choices=('servicio', 'taller'))
    estado = serializers.ChoiceField(choices=('activa', 'cancelada'), default='activa')
    categoria = serializers.CharField(max_length=100, allow_blank=True, default='')
    zona_horaria = serializers.CharField(max_length=80, default='America/Santiago')
    plataforma = serializers.CharField(max_length=100, allow_blank=True, default='')
    enlace_reunion = serializers.CharField(max_length=2000, allow_blank=True, default='')
    gratuito = serializers.BooleanField(default=False)
    inscripciones = serializers.BooleanField(default=False)
    cupos = serializers.IntegerField(min_value=1, max_value=10000, allow_null=True, default=None)
    confirmacion = serializers.ChoiceField(choices=('manual', 'automatica'), default='manual')

    def validate_zona_horaria(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError('Selecciona una zona horaria IANA válida.') from None
        return value

    def validate_enlace_reunion(self, value):
        return media_url('enlace', value) if value else ''

    def validate(self, data):
        if data['inscripciones'] and (data['tipo'] != 'taller' or not data['gratuito']):
            raise serializers.ValidationError('Las inscripciones de esta etapa son solo para talleres gratuitos.')
        return data


def activity_title(section):
    return next((element.get('texto', '').strip()[:255] for element in section.get('componentes', [])
                 if element.get('visible') and element.get('tipo') in ('titulo', 'nombre') and element.get('texto', '').strip()), section.get('titulo', '').strip())


def activity_schedule(section):
    elements = section.get('componentes', [])
    day = next((item for item in elements if item['tipo'] == 'fecha' and item.get('visible')), {})
    hours = next((item for item in elements if item['tipo'] == 'horario' and item.get('visible')), {})
    if not day.get('fecha') or not hours.get('inicio'):
        return None
    zone = ZoneInfo(section['actividad']['zona_horaria'])
    naive = datetime.combine(date.fromisoformat(day['fecha']), time.fromisoformat(hours['inicio']))
    start = naive.replace(tzinfo=zone)
    if start.astimezone(dt_timezone.utc).astimezone(zone).replace(tzinfo=None) != naive:
        raise ValidationError('La hora de inicio no existe en esa zona por un cambio de horario. Elige otra hora.')
    end_day = date.fromisoformat(day.get('hasta') or day['fecha'])
    end_naive = datetime.combine(end_day, time.fromisoformat(hours.get('termino') or hours['inicio']))
    end = end_naive.replace(tzinfo=zone)
    if end.astimezone(dt_timezone.utc).astimezone(zone).replace(tzinfo=None) != end_naive:
        raise ValidationError('La hora de término no existe en esa zona por un cambio de horario. Elige otra hora.')
    return start, end


def validate_activity(section):
    config = section.get('actividad')
    if not config:
        return
    if section['tipo'] != 'personalizada':
        raise ValidationError('Servicios y talleres requieren una sección configurable.')
    if config['gratuito'] and any(item['tipo'] == 'precio' and int(item.get('importe') or 0) > 0 for item in section.get('componentes', [])):
        raise ValidationError('Un taller o servicio gratuito no puede tener un precio positivo.')
    if section.get('visible') and not activity_title(section):
        raise ValidationError('Agrega un título público antes de publicar el servicio o taller.')
    schedule = activity_schedule(section)
    if section.get('visible') and config['tipo'] == 'taller' and not schedule:
        raise ValidationError('Agrega fecha y horario visibles antes de publicar el taller.')
    if schedule and schedule[1] < schedule[0]:
        raise ValidationError('La fecha y hora de término no pueden ser anteriores al inicio.')


def find_activity(config, section_id, *, published=True):
    section = next((block for block in config.contenido.get('bloques', []) if block.get('id') == str(section_id)), None) if config else None
    if not section or not section.get('actividad') or (published and (not section.get('visible') or section['actividad'].get('estado') != 'activa')):
        raise NotFound('El servicio o taller no está disponible.')
    return section


def require_enrollment(section):
    config = section['actividad']
    if config['tipo'] != 'taller' or not config['gratuito'] or not config['inscripciones']:
        raise ValidationError('Este taller no admite inscripciones gratuitas en línea.')
    schedule = activity_schedule(section)
    if not schedule or schedule[0] <= timezone.now():
        raise ValidationError('El taller ya comenzó o no tiene fecha disponible para inscribirse.')


class ActivitySubmissionSerializer(StrictSerializer):
    solicitud_id = serializers.UUIDField()
    nombre = serializers.CharField(max_length=100)
    apellido = serializers.CharField(max_length=100, allow_blank=True, default='')
    email = serializers.EmailField(max_length=254)
    telefono = serializers.RegexField(r'^\+?[0-9 ()-]{5,40}$', allow_blank=True, default='')
    mensaje = serializers.CharField(max_length=3000, allow_blank=True, default='')
    consentimiento = serializers.BooleanField()

    def validate_email(self, value):
        return value.strip().lower()

    def validate_consentimiento(self, value):
        if not value:
            raise serializers.ValidationError('Acepta el uso de tus datos para gestionar esta solicitud.')
        return value

    def validate(self, data):
        if self.context['tipo'] == 'consulta' and not data['mensaje']:
            raise serializers.ValidationError({'mensaje': 'Escribe tu consulta.'})
        return data
