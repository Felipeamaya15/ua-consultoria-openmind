"""Bounded development image serving, including read-only legacy locations."""
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.http import Http404
from django.urls import path
from django.views.static import serve


IMAGE_TREES = ('images', 'logos', 'blocks')
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def legacy_image(name):
    """Resolve only supported legacy images; never use BASE_DIR as a file root."""
    parts = PurePosixPath(name).parts
    if (len(parts) < 3 or parts[0] != 'landing' or parts[1] not in IMAGE_TREES
            or '\\' in name or name.startswith('/') or '..' in parts
            or any(':' in part for part in parts)
            or Path(name).suffix.lower() not in IMAGE_EXTENSIONS):
        return None
    boundary = Path(settings.BASE_DIR).resolve() / 'landing' / parts[1]
    candidate = (boundary / Path(*parts[2:])).resolve()
    if candidate.is_relative_to(boundary) and candidate.is_file():
        return candidate
    return None


class CompatibleImageStorage(FileSystemStorage):
    """New writes use MEDIA_ROOT; old model file names retain their original URL.

    Names in the legacy trees are also occupied, so an upload cannot shadow an
    existing image. No files are copied, renamed or removed.
    """
    def exists(self, name):
        return super().exists(name) or legacy_image(name) is not None

    def _open(self, name, mode='rb'):
        legacy = legacy_image(name)
        if legacy is not None:
            if mode not in ('r', 'rb'):
                raise ValueError('Legacy images are read-only; save a new upload instead.')
            from django.core.files import File
            return File(legacy.open(mode), name=name)
        return super()._open(name, mode)

    def size(self, name):
        legacy = legacy_image(name)
        return legacy.stat().st_size if legacy is not None else super().size(name)

    def url(self, name):
        if legacy_image(name) is not None:
            from django.utils.encoding import filepath_to_uri
            return '/' + filepath_to_uri(name)
        return super().url(name)


def serve_image(request, tree, name, legacy_first=False):
    # Check before normalization: neither separators nor dot segments may escape
    # the selected image tree. Resolve links as well as lexical traversal.
    parts = PurePosixPath(name).parts
    if (tree not in IMAGE_TREES or not parts or '\\' in name
            or name.startswith('/') or any(p in ('.', '..') or ':' in p for p in name.split('/'))
            or Path(name).suffix.lower() not in IMAGE_EXTENSIONS):
        raise Http404

    base = Path(settings.BASE_DIR).resolve()
    roots = []
    if settings.MEDIA_ROOT:
        media = Path(settings.MEDIA_ROOT).resolve()
        # Fail closed even if a caller overrides MEDIA_ROOT with the old value.
        if media != base and not base.is_relative_to(media):
            roots.append((media / 'landing' / tree, media))
    legacy = base / 'landing' / tree
    if legacy_first:
        roots.insert(0, (legacy, legacy))
    else:
        roots.append((legacy, legacy))
    for root, boundary in roots:
        resolved_root = root.resolve()
        candidate = (root / name).resolve()
        if (resolved_root.is_relative_to(boundary)
                and candidate.is_relative_to(resolved_root) and candidate.is_file()):
            response = serve(request, name, document_root=resolved_root, show_indexes=False)
            response['X-Content-Type-Options'] = 'nosniff'
            return response
    raise Http404


def media_urlpatterns():
    # Explicit prefixes, independent of an accidentally broad MEDIA_URL setting.
    # Cached /landing/... URLs and old block URLs remain readable; new uploads
    # always use MEDIA_ROOT. Nothing publishes BASE_DIR or a directory index.
    patterns = []
    for tree in IMAGE_TREES:
        for prefix in ('media/landing/', 'landing/'):
            patterns.append(path(f'{prefix}{tree}/<path:name>', serve_image,
                                 {'tree': tree, 'legacy_first': prefix == 'landing/'}))
    return patterns
