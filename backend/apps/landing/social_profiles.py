"""Social links share the landing contact source; this is not account authorization."""
import re
from urllib.parse import parse_qs, unquote, urlsplit

from rest_framework import serializers
from apps.authentication.presentation.profile import StrictSerializer

NETWORKS = ('instagram', 'facebook', 'youtube', 'whatsapp')


def normalize_profile(network, value):
    value = value.strip()
    if network == 'whatsapp':
        if not re.fullmatch(r'\+?[0-9 ()-]+', value):
            raise serializers.ValidationError('Ingresa un número internacional con código de país.')
        digits = re.sub(r'\D', '', value)
        if not re.fullmatch(r'[1-9][0-9]{7,14}', digits):
            raise serializers.ValidationError('Usa entre 8 y 15 dígitos, incluyendo el código de país.')
        return '+' + digits

    hosts = {'instagram': ('instagram.com', 'www.instagram.com'),
             'facebook': ('facebook.com', 'www.facebook.com', 'm.facebook.com'),
             'youtube': ('youtube.com', 'www.youtube.com', 'm.youtube.com')}
    # A domain without scheme is accepted, but cannot be mistaken for a handle.
    if value.lower().startswith(hosts[network]):
        value = 'https://' + value
    if '://' not in value:
        path = value.removeprefix('@')
        if network == 'youtube':
            path = '@' + path
        value = f'https://{hosts[network][0]}/{path}'
    try:
        url = urlsplit(value)
        if url.scheme.lower() not in ('http', 'https') or url.hostname not in hosts[network] or url.username or url.password or url.port or url.fragment:
            raise ValueError
    except ValueError:
        raise serializers.ValidationError('Usa un enlace de perfil de la red indicada.') from None
    path = unquote(url.path).strip('/')
    if network == 'instagram':
        valid = re.fullmatch(r'[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?', path) and '..' not in path and path.lower() not in ('p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct')
    elif network == 'facebook':
        if path == 'profile.php':
            query = parse_qs(url.query)
            if set(query) == {'id'} and len(query['id']) == 1 and re.fullmatch(r'[0-9]+', query['id'][0]):
                return f'https://facebook.com/profile.php?id={query["id"][0]}'
            raise serializers.ValidationError('Usa un identificador de perfil de Facebook válido.')
        valid = re.fullmatch(r'[A-Za-z0-9.]{1,100}', path) and path.lower() not in ('watch', 'reel', 'reels', 'stories', 'groups', 'events', 'sharer.php', 'login', 'plugins')
        valid = valid or re.fullmatch(r'people/[A-Za-z0-9_-]+/[0-9]+', path)
    else:
        valid = re.fullmatch(r'@[\w.-]{3,30}', path) or re.fullmatch(r'channel/UC[A-Za-z0-9_-]{22}', path) or re.fullmatch(r'(?:c|user)/[A-Za-z0-9_-]{1,100}', path)
    if not valid:
        raise serializers.ValidationError('Ingresa un identificador o enlace de perfil válido; no una publicación.')
    # Tracking parameters are not part of profile identity.
    return f'https://{hosts[network][0]}/{path}'


def read_profiles(contact):
    metadata = contact.get('redes_sociales', {})
    return {network: {
        'perfil': contact.get(network, ''),
        'activo': metadata.get(network, {}).get('activo', bool(contact.get(network))),
        'mensaje': metadata.get(network, {}).get('mensaje', '') if network == 'whatsapp' else '',
    } for network in NETWORKS}


class ProfileSerializer(StrictSerializer):
    perfil = serializers.CharField(max_length=500)
    activo = serializers.JSONField()
    mensaje = serializers.CharField(max_length=500, allow_blank=True, required=False, default='')

    def validate_activo(self, value):
        if not isinstance(value, bool):
            raise serializers.ValidationError('La activación debe ser true o false.')
        return value


class SocialProfilesSerializer(StrictSerializer):
    instagram = ProfileSerializer(required=False, allow_null=True)
    facebook = ProfileSerializer(required=False, allow_null=True)
    youtube = ProfileSerializer(required=False, allow_null=True)
    whatsapp = ProfileSerializer(required=False, allow_null=True)

    def validate(self, data):
        if not data:
            raise serializers.ValidationError('Indica al menos una red social.')
        errors = {}
        for network, profile in data.items():
            if profile is None:
                continue
            try:
                profile['perfil'] = normalize_profile(network, profile['perfil'])
                if network != 'whatsapp' and profile['mensaje']:
                    raise serializers.ValidationError('El mensaje solo está disponible para WhatsApp.')
            except serializers.ValidationError as error:
                errors[network] = error.detail
        if errors:
            raise serializers.ValidationError(errors)
        return data
