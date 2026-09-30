import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.services import configurar_tienda


class Command(BaseCommand):
    help = 'Inicializa la cuenta y tienda de demostración solo con DEV_BOOTSTRAP=1 y DEBUG=1.'

    @transaction.atomic
    def handle(self, *args, **options):
        if os.getenv('DEV_BOOTSTRAP', '0') != '1':
            return
        if not settings.DEBUG:
            raise CommandError('DEV_BOOTSTRAP requiere DEBUG=1; desactívelo fuera de desarrollo.')

        User = get_user_model()
        email = 'emprendedor@gmail.com'
        matches = User.objects.filter(email__iexact=email)
        if matches.count() > 1:
            raise CommandError('Hay varias cuentas con el correo de demostración; revise los datos.')
        user = matches.first()
        if user is None:
            if User.objects.filter(username='emprendedor').exists():
                raise CommandError('El username emprendedor ya pertenece a otra cuenta.')
            user = User.objects.create_user(
                username='emprendedor', email=email, password='123456',
            )
            self.stdout.write('Cuenta de desarrollo creada.')
        else:
            self.stdout.write('Cuenta existente conservada, incluida su contraseña y permisos.')
        if not user.is_active:
            raise CommandError('La cuenta existente está inactiva; no se modificó.')

        tienda, created = configurar_tienda(user, nombre='Mi tienda')
        if tienda.id_usuario_propietario_id != user.pk:
            raise CommandError('La tienda existente tiene otro propietario; no se modificó.')
        self.stdout.write('Tienda de desarrollo creada.' if created else 'Tienda existente conservada.')
