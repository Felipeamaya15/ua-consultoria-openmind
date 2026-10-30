"""Migration compatibility check; run only through Django's disposable test DB."""
from datetime import datetime, timezone
from unittest.mock import patch

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.core.models import Tienda


class ConsentMigrationTests(TransactionTestCase):
    def test_additive_migrations_preserve_legacy_dates_without_fabricating_verification(self):
        target = [('core', '0028_bind_consent_management_link')]
        old = [('core', '0026_merge_20261022_0527')]
        final_targets = MigrationExecutor(connection).loader.graph.leaf_nodes()
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(old)
            apps = executor.loader.project_state(old).apps
            user = apps.get_model('auth', 'User').objects.create(username='legacy-migration-owner')
            store = apps.get_model('core', 'Tienda').objects.create(nombre='Migration QA', id_usuario_propietario_id=user.pk)
            instant = datetime(2025, 2, 3, 12, 30, tzinfo=timezone.utc)
            record = apps.get_model('core', 'ConsentimientoComercial').objects.create(tienda_id=store.pk,
                email='legacy-migration@example.test', estado='autorizado', version_texto='legacy-text',
                referencia_evidencia='legacy-reference', fecha_actualizacion=instant)
            client = APIClient()
            client.force_authenticate(get_user_model().objects.get(pk=user.pk))
            # Isolate this consent migration from later Tienda columns. Ownership
            # has separate API tests; current Tienda queries cannot run on 0026.
            current_store = Tienda(pk=store.pk, nombre=store.nombre, id_usuario_propietario_id=user.pk)
            with patch('apps.core.presentation.commercial_exports.resolver_tienda', return_value=current_store):
                unavailable = client.get('/api/tienda/contactos/')
            self.assertEqual(unavailable.status_code, 503)
            self.assertEqual(unavailable.json()['error']['codigo'], 'CONTACTOS_ACTUALIZACION_PENDIENTE')
            self.assertNotIn('verificado', unavailable.content.decode())
            executor = MigrationExecutor(connection)
            executor.migrate(target)
            apps = executor.loader.project_state(target).apps
            updated = apps.get_model('core', 'ConsentimientoComercial').objects.get(pk=record.pk)
            self.assertEqual(updated.fecha_actualizacion, instant)
            self.assertEqual(updated.estado, 'autorizado')
            self.assertEqual(updated.version_texto, 'legacy-text')
            self.assertFalse(updated.verificado)
            self.assertIsNone(updated.fecha_autorizacion)
            self.assertIsNone(updated.fecha_verificacion)
            self.assertIsNone(updated.fecha_retirada)
            self.assertEqual(apps.get_model('core', 'EventoConsentimiento').objects.count(), 0)
            self.assertEqual(apps.get_model('core', 'SolicitudConsentimiento').objects.count(), 0)
            with patch('apps.core.presentation.commercial_exports.resolver_tienda', return_value=current_store):
                available = client.get('/api/tienda/contactos/')
            self.assertEqual(available.status_code, 200)
            self.assertEqual(available.json()['data'][0]['consentimiento'], 'pendiente')
        finally:
            MigrationExecutor(connection).migrate(final_targets)
