"""AUD-001 regression tests: synthetic files only, no application databases."""
import importlib
import tempfile
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.test import SimpleTestCase, override_settings
from django.urls import Resolver404, clear_url_caches, resolve

from apps.landing.block_images import block_storage
from config.media import CompatibleImageStorage, media_urlpatterns


urlpatterns = media_urlpatterns()


@override_settings(ROOT_URLCONF=__name__, DEBUG=True)
class MediaSecurityTests(SimpleTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name) / 'backend'
        self.media = self.base / 'media'
        self.base.mkdir()
        self.override = override_settings(BASE_DIR=self.base, MEDIA_ROOT=self.media, MEDIA_URL='/media/')
        self.override.enable()
        self.addCleanup(self.override.disable)
        for root in (self.base, self.media):
            for tree in ('images', 'logos', 'blocks'):
                (root / 'landing' / tree).mkdir(parents=True)
        # These are harmless markers, never actual backend/private file content.
        (self.base / 'manage.py').write_text('AUD001 synthetic source marker')
        (self.base / 'outside.png').write_bytes(b'outside-boundary-marker')

    def body(self, response):
        try:
            return b''.join(response.streaming_content)
        finally:
            response.close()

    def test_documented_source_paths_are_not_routes(self):
        for name in ('manage.py', 'requirements.txt', 'scripts/serve_sprint6_qa.py'):
            with self.subTest(name=name):
                self.assertEqual(self.client.get('/' + name).status_code, 404)
                self.assertEqual(self.client.get('/media/' + name).status_code, 404)

    def test_each_tree_serves_new_and_legacy_images_under_both_prefixes(self):
        for tree in ('images', 'logos', 'blocks'):
            for root, name, content in ((self.base, 'old.png', b'legacy-image'),
                                        (self.media, 'new.webp', b'new-image')):
                (root / 'landing' / tree / name).write_bytes(content)
                for prefix in ('/media/landing/', '/landing/'):
                    with self.subTest(tree=tree, root=root, prefix=prefix):
                        response = self.client.get(f'{prefix}{tree}/{name}')
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
                        self.assertEqual(self.body(response), content)

    def test_new_file_takes_precedence_over_legacy_file(self):
        for root, content in ((self.base, b'old'), (self.media, b'new')):
            (root / 'landing/logos/logo.png').write_bytes(content)
        self.assertEqual(self.body(self.client.get('/media/landing/logos/logo.png')), b'new')
        self.assertEqual(self.body(self.client.get('/landing/logos/logo.png')), b'old')

    def test_existing_model_names_keep_legacy_url_and_content_on_collision(self):
        for root, content in ((self.base, b'original-logo'), (self.media, b'other-logo')):
            (root / 'landing/logos/logo.png').write_bytes(content)
        storage = CompatibleImageStorage()
        self.assertEqual(storage.url('landing/logos/logo.png'), '/landing/logos/logo.png')
        with storage.open('landing/logos/logo.png') as image:
            self.assertEqual(image.read(), b'original-logo')
        self.assertEqual(storage.size('landing/logos/logo.png'), len(b'original-logo'))
        with self.assertRaises(ValueError):
            storage.open('landing/logos/logo.png', 'wb')
        self.assertEqual((self.base / 'landing/logos/logo.png').read_bytes(), b'original-logo')

    def test_new_upload_never_shadows_legacy_name(self):
        (self.base / 'landing/logos/logo.png').write_bytes(b'original-logo')
        storage = CompatibleImageStorage()
        name = storage.save('landing/logos/logo.png', ContentFile(b'new-upload'))
        self.assertNotEqual(name, 'landing/logos/logo.png')
        self.assertTrue((self.media / name).is_file())
        self.assertEqual(storage.url(name), '/media/' + name)
        self.assertEqual(self.body(self.client.get(storage.url(name))), b'new-upload')

    def test_traversal_and_non_image_files_are_rejected(self):
        (self.media / 'landing/logos/source.py').write_text('synthetic source')
        for name in ('../../../manage.py', '../../../outside.png', '%2e%2e/%2e%2e/outside.png',
                     '..%5c..%5coutside.png', 'source.py', 'C:%5coutside.png', '/outside.png'):
            for prefix in ('/media/landing/logos/', '/landing/logos/'):
                with self.subTest(name=name, prefix=prefix):
                    self.assertEqual(self.client.get(prefix + name).status_code, 404)

    def test_no_directory_indexes_or_unrelated_media_trees(self):
        for name in ('/media/', '/media/landing/', '/media/landing/logos/',
                     '/landing/', '/media/config/outside.png', '/media/outside.png'):
            self.assertEqual(self.client.get(name).status_code, 404)

    def test_symlink_to_file_outside_tree_is_rejected(self):
        (self.media / 'landing/logos/link.png').symlink_to(self.base / 'outside.png')
        self.assertEqual(self.client.get('/media/landing/logos/link.png').status_code, 404)

    def test_symlink_directory_outside_tree_is_rejected(self):
        (self.base / 'landing/logos/escape').symlink_to(self.base, target_is_directory=True)
        self.assertEqual(self.client.get('/landing/logos/escape/outside.png').status_code, 404)

    def test_symlink_replacing_legacy_tree_is_rejected(self):
        # Only removes an empty directory created in this disposable fixture.
        root = self.base / 'landing/images'
        root.rmdir()
        root.symlink_to(self.base, target_is_directory=True)
        self.assertEqual(self.client.get('/landing/images/outside.png').status_code, 404)

    def test_bad_settings_do_not_publish_backend_root(self):
        for media in ('', self.base, self.base.parent):
            with self.subTest(media=media), override_settings(MEDIA_ROOT=media, MEDIA_URL='/'):
                self.assertEqual(self.client.get('/manage.py').status_code, 404)
                self.assertEqual(self.client.get('/media/landing/logos/../../../outside.png').status_code, 404)
                with self.assertRaises(ImproperlyConfigured):
                    block_storage()

    def test_block_uploads_use_dedicated_root_and_keep_tenant_path(self):
        storage = block_storage()
        name = storage.save('store-a/block-a/image.png', ContentFile(b'upload-marker'))
        self.assertTrue((self.media / 'landing/blocks' / name).is_file())
        self.assertFalse((self.base / 'landing/blocks' / name).exists())
        url = storage.url(name)
        self.assertEqual(url, '/media/landing/blocks/store-a/block-a/image.png')
        self.assertEqual(self.body(self.client.get(url)), b'upload-marker')

    def test_main_urlconf_blocks_sources_with_debug_enabled_and_disabled(self):
        import config.urls
        try:
            for debug in (True, False):
                with override_settings(DEBUG=debug):
                    module = importlib.reload(config.urls)
                    clear_url_caches()
                    for url in ('/manage.py', '/requirements.txt', '/scripts/serve_sprint6_qa.py'):
                        with self.assertRaises(Resolver404):
                            resolve(url, urlconf=module)
                    if not debug:
                        with self.assertRaises(Resolver404):
                            resolve('/media/landing/logos/logo.png', urlconf=module)
        finally:
            importlib.reload(config.urls)
            clear_url_caches()
