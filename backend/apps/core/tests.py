from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user, get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, connection, connections, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.models.deletion import ProtectedError
from django.test import RequestFactory, TestCase, TransactionTestCase

from apps.core.admin import TiendaAdmin
from apps.core.models import Tienda, Usuario
from apps.core.services import configurar_tienda


class TiendaPropietarioTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            username='propietario', email='owner@example.test', password='test-password',
            is_staff=True,
        )
        self.other = get_user_model().objects.create_user(
            username='otro', email='otro@example.test', password='test-password',
            is_staff=True,
        )
        self.shop = Tienda.objects.create(nombre='Tienda', id_usuario_propietario=self.owner)
        self.other_shop = Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.other)
        self.admin = TiendaAdmin(Tienda, AdminSite())
        self.factory = RequestFactory()

    def test_recupera_tienda_de_usuario_autenticado(self):
        self.assertTrue(self.client.login(username='propietario', password='test-password'))
        request = self.factory.get('/')
        request.session = self.client.session
        usuario = get_user(request)
        self.assertEqual(Tienda.objects.del_propietario(usuario).get(), self.shop)
        self.assertEqual(usuario.tiendas_propias.get(), self.shop)

    def test_no_devuelve_tiendas_ajenas(self):
        self.assertFalse(Tienda.objects.del_propietario(self.owner).filter(pk=self.other_shop.pk).exists())

    def test_cuenta_sin_tienda_no_adquiere_propiedad(self):
        customer = get_user_model().objects.create_user(username='cliente')
        self.assertFalse(Tienda.objects.del_propietario(customer).exists())

    def test_anonimo_inactivo_y_usuario_no_guardado_no_recuperan_tienda(self):
        self.owner.is_active = False
        self.owner.save(update_fields=['is_active'])
        for usuario in (AnonymousUser(), self.owner, get_user_model()(username='nuevo')):
            with self.subTest(usuario=type(usuario).__name__):
                self.assertFalse(Tienda.objects.del_propietario(usuario).exists())
        self.assertTrue(Tienda.objects.filter(pk=self.shop.pk).exists())

    def test_usuario_legacy_con_mismo_id_no_es_propietario(self):
        legacy = Usuario.objects.create(
            id_usuario=self.owner.pk, correo='legacy@example.test', password_hash='legacy',
            nombre='Legacy', apellido='Usuario', rol='admin',
        )
        self.assertFalse(Tienda.objects.del_propietario(legacy).exists())
        with self.assertRaises(ValueError):
            Tienda(nombre='Incorrecta', id_usuario_propietario=legacy)
        legacy.delete()
        self.assertTrue(Tienda.objects.filter(pk=self.shop.pk).exists())

    def test_propietario_es_obligatorio(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Tienda.objects.create(nombre='Sin propietario')

    def test_borrar_propietario_no_elimina_la_tienda(self):
        with self.assertRaises(ProtectedError):
            self.owner.delete()
        self.assertTrue(Tienda.objects.filter(pk=self.shop.pk).exists())

    def test_admin_filtra_por_propietario_y_no_por_is_staff(self):
        request = self.factory.get('/admin/core/tienda/')
        request.user = self.owner
        self.assertQuerySetEqual(self.admin.get_queryset(request), [self.shop])
        request.user = get_user_model().objects.create_user(username='staff', is_staff=True)
        self.assertFalse(self.admin.get_queryset(request).exists())
        self.assertFalse(self.admin.has_add_permission(request))

    def test_superusuario_configura_sin_adquirir_propiedad(self):
        request = self.factory.get('/admin/core/tienda/add/')
        request.user = get_user_model().objects.create_superuser(
            username='configurador', email='config@example.test', password='test-password',
        )
        self.assertEqual(self.admin.get_queryset(request).count(), 2)
        self.assertFalse(Tienda.objects.del_propietario(request.user).exists())
        self.assertFalse(self.admin.has_add_permission(request))

    def test_admin_no_permite_transferencia_en_edicion_comun(self):
        request = self.factory.get('/admin/core/tienda/')
        request.user = self.owner
        self.assertIn('id_usuario_propietario', self.admin.get_readonly_fields(request, self.shop))


class ConfiguracionTiendaTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='emprendedor')
        self.configurador = get_user_model().objects.create_superuser(
            username='configurador', email='config@example.test', password='test-password',
        )
        self.client.force_login(self.configurador)

    def test_configura_primera_tienda_y_la_recupera_por_propietario(self):
        tienda, creada = configurar_tienda(self.owner, nombre='Mi tienda')
        self.assertTrue(creada)
        self.assertEqual(Tienda.objects.count(), 1)
        self.assertEqual(tienda.id_usuario_propietario, self.owner)
        self.assertEqual(Tienda.objects.del_propietario(self.owner).get(), tienda)
        with self.assertRaises(ProtectedError):
            self.owner.delete()

    def test_repetir_configuracion_reutiliza_sin_cambiar_datos_ni_propietario(self):
        primera, _ = configurar_tienda(self.owner, nombre='Original', descripcion='Conservar')
        for propietario in (self.owner, self.configurador):
            tienda, creada = configurar_tienda(propietario, nombre='Otro nombre')
            self.assertFalse(creada)
            self.assertEqual(tienda.pk, primera.pk)
            self.assertEqual(tienda.nombre, 'Original')
            self.assertEqual(tienda.descripcion, 'Conservar')
            self.assertEqual(tienda.id_usuario_propietario, self.owner)
        self.assertEqual(Tienda.objects.count(), 1)

    def test_admin_crea_primera_y_rechaza_segunda_por_get_y_post(self):
        url = '/admin/core/tienda/add/'
        self.assertEqual(self.client.get(url).status_code, 200)
        data = {'nombre': 'Primera', 'id_usuario_propietario': self.owner.pk, '_save': 'Save'}
        self.assertEqual(self.client.post(url, data).status_code, 302)
        tienda = Tienda.objects.del_propietario(self.owner).get()
        self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(self.client.post(url, {**data, 'nombre': 'Segunda'}).status_code, 403)
        self.assertEqual(Tienda.objects.count(), 1)
        self.assertEqual(Tienda.objects.get(), tienda)

    def test_admin_rechaza_formulario_abierto_antes_de_otra_configuracion(self):
        request = RequestFactory().post('/admin/core/tienda/add/')
        request.user = self.configurador
        admin = TiendaAdmin(Tienda, AdminSite())
        self.assertTrue(admin.has_add_permission(request))
        formulario = admin.get_form(request)(data={
            'nombre': 'Segunda', 'id_usuario_propietario': self.owner.pk,
        })
        self.assertTrue(formulario.is_valid(), formulario.errors)
        primera, _ = configurar_tienda(self.owner, nombre='Primera')
        with self.assertRaises(PermissionDenied):
            admin.save_model(request, formulario.save(commit=False), formulario, change=False)
        self.assertEqual(Tienda.objects.get(), primera)

    def test_admin_sigue_permitiendo_editar_tienda_existente(self):
        tienda, _ = configurar_tienda(self.owner, nombre='Original')
        response = self.client.post(
            f'/admin/core/tienda/{tienda.pk}/change/',
            {'nombre': 'Actualizada', 'descripcion': 'Nueva', '_save': 'Save'},
        )
        self.assertEqual(response.status_code, 302)
        tienda.refresh_from_db()
        self.assertEqual(tienda.nombre, 'Actualizada')
        self.assertEqual(tienda.id_usuario_propietario, self.owner)
        self.assertEqual(Tienda.objects.count(), 1)

    def test_datos_previos_con_varias_tiendas_no_se_ocultan_ni_modifican(self):
        Tienda.objects.create(nombre='Primera', id_usuario_propietario=self.owner)
        Tienda.objects.create(nombre='Segunda', id_usuario_propietario=self.configurador)
        with self.assertRaises(Tienda.MultipleObjectsReturned):
            configurar_tienda(self.owner, nombre='Tercera')
        self.assertEqual(Tienda.objects.count(), 2)

    def test_configuracion_rechaza_propietario_invalido(self):
        self.owner.is_active = False
        for propietario in (AnonymousUser(), get_user_model()(username='sin-guardar'), self.owner):
            with self.subTest(propietario=type(propietario).__name__):
                with self.assertRaises(ValidationError):
                    configurar_tienda(propietario, nombre='Mi tienda')
        self.assertFalse(Tienda.objects.exists())


class ConfiguracionTiendaConcurrenteTests(TransactionTestCase):
    def test_dos_configuraciones_simultaneas_crean_una_sola_tienda(self):
        propietarios = [get_user_model().objects.create_user(username=f'owner-{i}') for i in range(2)]
        inicio = Barrier(2)

        def configurar(pk):
            try:
                propietario = get_user_model().objects.get(pk=pk)
                inicio.wait(timeout=10)
                tienda, creada = configurar_tienda(propietario, nombre='Tienda')
                return tienda.pk, creada
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            resultados = list(executor.map(configurar, [usuario.pk for usuario in propietarios]))
        self.assertEqual(resultados[0][0], resultados[1][0])
        self.assertEqual(sum(creada for _, creada in resultados), 1)
        self.assertEqual(Tienda.objects.count(), 1)


class TiendaPropietarioMigrationTests(TransactionTestCase):
    migrate_from = ('core', '0003_itempedido_id_variante')
    migrate_to = ('core', '0004_tienda_propietario_auth')

    def setUp(self):
        executor = MigrationExecutor(connection)
        self.other_targets = [node for node in executor.loader.graph.leaf_nodes() if node[0] != 'core']
        targets = [self.migrate_from, *self.other_targets]
        executor.migrate(targets)
        self.old_apps = executor.loader.project_state(targets).apps

    def tearDown(self):
        # Solo datos de la base de pruebas; deja el esquema actual para los siguientes tests.
        executor = MigrationExecutor(connection)
        if self.migrate_to not in executor.loader.applied_migrations:
            self.old_apps.get_model('core', 'Tienda').objects.all().delete()
        executor.migrate([self.migrate_to, *self.other_targets])
        super().tearDown()

    def legacy(self, pk, email):
        return self.old_apps.get_model('core', 'Usuario').objects.create(
            id_usuario=pk, correo=email, password_hash='hash-conservado',
            nombre='Nombre', apellido='Apellido', rol='admin',
        )

    def auth(self, pk, email):
        return self.old_apps.get_model('auth', 'User').objects.create(
            id=pk, username=f'usuario-{pk}', email=email, password='hash-auth-conservado',
        )

    def migrate(self):
        executor = MigrationExecutor(connection)
        targets = [self.migrate_to, *self.other_targets]
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def test_migra_ids_cruzados_conserva_datos_y_revierte(self):
        first = self.legacy(10, 'first@example.test')
        second = self.legacy(20, 'second@example.test')
        self.auth(20, 'FIRST@example.test')
        self.auth(10, 'second@example.test')
        OldShop = self.old_apps.get_model('core', 'Tienda')
        shop = OldShop.objects.create(nombre='Primera', descripcion='Conservar', id_usuario_propietario=first)
        other_shop = OldShop.objects.create(nombre='Segunda', id_usuario_propietario=second)
        product = self.old_apps.get_model('core', 'Producto').objects.create(
            nombre='Producto', precio=100, stock=3, id_tienda=shop,
        )
        apps = self.migrate()
        NewShop = apps.get_model('core', 'Tienda')
        migrated = NewShop.objects.get(pk=shop.pk)
        self.assertEqual(migrated.id_usuario_propietario_id, 20)
        self.assertEqual(NewShop.objects.get(pk=other_shop.pk).id_usuario_propietario_id, 10)
        self.assertEqual(migrated.descripcion, 'Conservar')
        self.assertEqual(apps.get_model('core', 'Producto').objects.get(pk=product.pk).id_tienda_id, shop.pk)
        self.assertEqual(apps.get_model('core', 'Usuario').objects.get(pk=10).password_hash, 'hash-conservado')
        self.assertEqual(apps.get_model('auth', 'User').objects.get(pk=20).password, 'hash-auth-conservado')
        MigrationExecutor(connection).migrate([self.migrate_from, *self.other_targets])
        self.assertEqual(OldShop.objects.get(pk=shop.pk).id_usuario_propietario_id, 10)
        self.assertEqual(OldShop.objects.get(pk=other_shop.pk).id_usuario_propietario_id, 20)

    def test_no_reutiliza_id_sin_correo_coincidente(self):
        legacy = self.legacy(10, 'owner@example.test')
        self.auth(10, 'otra-persona@example.test')
        shop = self.old_apps.get_model('core', 'Tienda').objects.create(nombre='Existente', id_usuario_propietario=legacy)
        with self.assertRaisesRegex(RuntimeError, 'no se puede conciliar'):
            self.migrate()
        shop.refresh_from_db()
        self.assertEqual(shop.id_usuario_propietario_id, 10)

    def test_correo_destino_duplicado_aborta_sin_reasignaciones_parciales(self):
        valid = self.legacy(10, 'valid@example.test')
        ambiguous = self.legacy(20, 'duplicado@example.test')
        self.auth(30, 'valid@example.test')
        self.auth(40, 'duplicado@example.test')
        self.auth(50, 'DUPLICADO@example.test')
        OldShop = self.old_apps.get_model('core', 'Tienda')
        shop = OldShop.objects.create(nombre='Válida', id_usuario_propietario=valid)
        OldShop.objects.create(nombre='Ambigua', id_usuario_propietario=ambiguous)
        with self.assertRaisesRegex(RuntimeError, 'no se puede conciliar'):
            self.migrate()
        self.assertEqual(OldShop.objects.get(pk=shop.pk).id_usuario_propietario_id, 10)

    def test_correo_origen_duplicado_no_fusiona_propietarios(self):
        owner = self.legacy(10, 'owner@example.test')
        self.legacy(20, 'OWNER@example.test')
        self.auth(30, 'owner@example.test')
        self.old_apps.get_model('core', 'Tienda').objects.create(nombre='Existente', id_usuario_propietario=owner)
        with self.assertRaisesRegex(RuntimeError, 'no se puede conciliar'):
            self.migrate()

    def test_instalacion_vacia_no_crea_usuarios_ni_tiendas(self):
        apps = self.migrate()
        self.assertEqual(apps.get_model('core', 'Tienda').objects.count(), 0)
        self.assertEqual(apps.get_model('core', 'Usuario').objects.count(), 0)
        self.assertEqual(apps.get_model('auth', 'User').objects.count(), 0)
