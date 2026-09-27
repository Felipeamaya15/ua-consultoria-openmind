from django.core.management.base import BaseCommand
from apps.catalog.infrastructure.indexes import create_catalog_indexes


class Command(BaseCommand):
    help = "Crea/actualiza los índices del catálogo en MongoDB"

    def handle(self, *args, **options):
        create_catalog_indexes()
