"""Contrato v2 de retiro; los textos legacy se conservan sin inferir horarios."""
import re
from datetime import datetime, timezone as datetime_timezone
from zoneinfo import ZoneInfo
from django.utils import timezone
from django.core import signing

DAYS = [('mon', 'Lunes'), ('tue', 'Martes'), ('wed', 'Miércoles'), ('thu', 'Jueves'),
        ('fri', 'Viernes'), ('sat', 'Sábado'), ('sun', 'Domingo')]
LOCATION_FIELDS = ('region', 'comuna', 'street', 'number', 'reference', 'verification')
SALT = 'core.pickup.address.v2'


def validate_pickup_selection(pickup, selection, now=None):
    """Calendario Santiago, precisión de un minuto; no inventa cupos ni intervalos.

    La selección es aditiva para conservar clientes antiguos y retiro legacy.
    Toda selección enviada se valida de nuevo con la configuración vigente.
    """
    from rest_framework.exceptions import ValidationError
    if selection is None:
        return None
    message = 'Selecciona una fecha y hora de retiro disponibles dentro del horario del local.'
    try:
        if pickup.get('version') != 2 or not pickup.get('enabled'):
            raise ValueError()
        date, hour = selection['fecha'], selection['hora']
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', hour):
            raise ValueError()
        calendar = datetime.strptime(f'{date} {hour}', '%Y-%m-%d %H:%M')
        zone = ZoneInfo('America/Santiago')
        selected = calendar.replace(tzinfo=zone)
        # El salto de horario de verano puede eliminar minutos del calendario local.
        if selected.astimezone(datetime_timezone.utc).astimezone(zone).replace(tzinfo=None) != calendar:
            raise ValueError()
        current = (now or timezone.now()).astimezone(zone)
        row = pickup.get('hours', {}).get(DAYS[calendar.weekday()][0], {})
        if (selected <= current or not row.get('enabled')
                or not row.get('start') or not row.get('end') or not row['start'] <= hour <= row['end']):
            raise ValueError()
        return {'fecha': date, 'hora': hour, 'zona_horaria': 'America/Santiago'}
    except (ValueError, TypeError, KeyError, AttributeError):
        raise ValidationError({'retiro_seleccion': message})


def grouped_hours(hours):
    hours = hours if isinstance(hours, dict) else {}
    groups = {}
    closed = []
    for day, label in DAYS:
        value = hours.get(day, {})
        value = value if isinstance(value, dict) else {}
        if value.get('enabled'):
            groups.setdefault((value.get('start', ''), value.get('end', '')), []).append(label)
        else:
            closed.append(label)
    lines = [f"{', '.join(labels)}: {start} a {end}" for (start, end), labels in groups.items()]
    if closed:
        lines.append(f"{', '.join(closed)}: cerrado")
    return '; '.join(lines)


def validate_pickup(pickup, tienda_id):
    """Retorna errores por campo; nunca confía en un boolean de verificación del cliente."""
    if not pickup.get('enabled'):
        return {}
    if pickup.get('version') != 2:
        return {} if pickup.get('address', '').strip() and pickup.get('schedule', '').strip() else {
            'address': 'La configuración antigua requiere dirección y horario; completa el formulario de retiro.'}
    from apps.core.shipping import validate_destination
    from rest_framework.exceptions import ValidationError
    errors = {}
    location = pickup.get('location', {})
    location = location if isinstance(location, dict) else {}
    for field in ('region', 'comuna', 'street'):
        if not str(location.get(field, '')).strip():
            errors[f'location.{field}'] = 'Este campo es obligatorio.'
    try:
        validate_destination(location.get('region'), location.get('comuna'))
    except ValidationError:
        errors['location.comuna'] = 'Selecciona una comuna de la región elegida.'
    from apps.core.infrastructure.pickup_address import configured
    token = location.get('verification', '')
    if token:
        try:
            proof = signing.loads(token, salt=SALT)
            expected = {key: location.get(key, '') for key in ('region', 'comuna', 'street', 'number')}
            if proof.get('tienda') != str(tienda_id) or proof.get('address') != expected:
                raise signing.BadSignature()
            manual = proof.get('provider') == 'manual'
            if not str(location.get('number', '')).strip() and (manual or not proof.get('special')):
                errors['location.number'] = 'Indica la numeración del local.'
        except (signing.BadSignature, ValueError, TypeError, AttributeError):
            errors['location.verification'] = 'La selección de dirección ya no es válida. Vuelve a seleccionarla o usa entrada manual cuando la búsqueda no esté configurada.'
            if not str(location.get('number', '')).strip():
                errors['location.number'] = 'Indica la numeración del local.'
    else:
        if configured():
            errors['location.verification'] = 'Busca y selecciona una dirección reconocida por el proveedor.'
        if not str(location.get('number', '')).strip():
            errors['location.number'] = 'Indica la numeración del local.'
    hours = pickup.get('hours', {})
    hours = hours if isinstance(hours, dict) else {}
    active = False
    for day, _ in DAYS:
        row = hours.get(day, {})
        row = row if isinstance(row, dict) else {}
        if not row.get('enabled'):
            continue
        active = True
        for field in ('start', 'end'):
            if not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]', str(row.get(field, ''))):
                errors[f'hours.{day}.{field}'] = 'Indica una hora válida.'
        if row.get('start') and row.get('end') and row['end'] <= row['start']:
            errors[f'hours.{day}.end'] = 'El término debe ser posterior al inicio.'
    if not active:
        errors['hours'] = 'Habilita al menos un día de retiro.'
    return errors


def prepare_pickup_for_save(pickup, tienda_id):
    """Después de validar, registra entrada manual sin presentarla como verificación Google.

    La firma conserva la procedencia al habilitar el proveedor más adelante y evita
    que un cliente falsifique una constancia manual o la use con otra dirección/tienda.
    """
    result = dict(pickup)
    if result.get('version') == 2 and result.get('enabled'):
        location = dict(result.get('location', {}))
        if not location.get('verification'):
            address = {key: location.get(key, '') for key in ('region', 'comuna', 'street', 'number')}
            location['verification'] = signing.dumps({'tienda': str(tienda_id), 'address': address,
                'provider': 'manual', 'special': False}, salt=SALT, compress=True)
        result['location'] = location
    return readable_pickup(result)


def readable_pickup(pickup):
    result = dict(pickup)
    if result.get('version') == 2:
        location = result.get('location', {})
        location = location if isinstance(location, dict) else {}
        result['address'] = ', '.join(filter(None, [
            ' '.join(filter(None, [location.get('street'), location.get('number')])),
            location.get('reference'), location.get('comuna'), location.get('region')]))
        result['schedule'] = grouped_hours(result.get('hours', {}))
        try:
            proof = signing.loads(location.get('verification', ''), salt=SALT)
            result['validation_method'] = 'manual' if proof.get('provider') == 'manual' else 'google'
        except (signing.BadSignature, ValueError, TypeError, AttributeError):
            result['validation_method'] = 'unverified'
    return result
