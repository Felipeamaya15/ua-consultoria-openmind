from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from apps.instagram.models import PublicacionInstagram


class Command(BaseCommand):
    help = 'Elimina solo JPG temporales vencidos de Instagram; conserva el historial.'

    def handle(self, *args, **options):
        count = 0
        for row in PublicacionInstagram.objects.filter(imagen_vence_en__lte=timezone.now()).exclude(imagen='')[:1000]:
            if not row.imagen.name.startswith('instagram/publicaciones/') or '..' in row.imagen.name:
                raise CommandError('Ruta de imagen temporal no permitida.')
            row.imagen.delete(save=True); count += 1
        self.stdout.write(f'{count} imágenes temporales vencidas eliminadas; historial conservado.')
