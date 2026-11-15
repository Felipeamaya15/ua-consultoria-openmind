from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import APIException
from apps.core.models import Tienda
from apps.landing.models import CampanaPromocional
from apps.landing.campaign_delivery import process_one


class Command(BaseCommand):
    help = 'Procesa un lote limitado de destinatarios ya confirmados. Nunca confirma campañas ni reintenta resultados inciertos.'

    def add_arguments(self, parser):
        parser.add_argument('--tienda', type=int, required=True)
        parser.add_argument('--limite', type=int, default=20)

    def handle(self, *args, **options):
        if not 1 <= options['limite'] <= 100:
            raise CommandError('El límite debe estar entre 1 y 100.')
        try:
            store = Tienda.objects.get(pk=options['tienda'])
        except Tienda.DoesNotExist:
            raise CommandError('No existe la tienda indicada.') from None
        processed = 0
        for _ in range(options['limite']):
            row = CampanaPromocional.objects.filter(tienda=store, estado__in=['pendiente', 'procesando'],
                destinatarios__estado='pendiente').order_by('confirmada_en', 'pk').first()
            if row is None:
                break
            try:
                process_one(store, row.pk)
            except (APIException, ValueError):
                raise CommandError('Lote detenido. Revisa la conexión y los límites; los pendientes se conservan.') from None
            processed += 1
        self.stdout.write(f'Destinatarios procesados: {processed}. Aceptación no acredita entrega al buzón.')
