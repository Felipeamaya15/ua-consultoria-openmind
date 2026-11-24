from pathlib import Path
from uuid import uuid4
from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateRecordingStorage(FileSystemStorage):
    def __init__(self):
        root = Path(getattr(settings, 'PRIVATE_RECORDINGS_ROOT', Path(settings.BASE_DIR) / 'private_recordings')).resolve()
        media = Path(settings.MEDIA_ROOT).resolve()
        if root == media or media in root.parents:
            raise ValueError('El almacenamiento de grabaciones debe estar fuera de los medios públicos.')
        super().__init__(location=root, base_url=None, file_permissions_mode=0o600, directory_permissions_mode=0o700)

    def url(self, name):
        raise ValueError('Las grabaciones privadas no tienen URL pública.')


def recording_path(instance, filename):
    return f'{instance.tienda_id}/{uuid4().hex}.mp4'
