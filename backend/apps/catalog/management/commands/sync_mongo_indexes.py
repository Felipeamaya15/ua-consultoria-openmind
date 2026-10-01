from django.core.management.base import BaseCommand
from django.core.management.base import CommandError
from apps.catalog.infrastructure.indexes import create_catalog_indexes


class Command(BaseCommand):
    help = "Crea/actualiza los índices y la restricción de stock del catálogo en MongoDB"

    def handle(self, *args, **options):
        try:
            create_catalog_indexes()
        except ValueError as error:
            raise CommandError(str(error)) from error
