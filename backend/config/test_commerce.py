"""Opt-in QA settings for disposable local services, never development data.

Run with --settings=config.test_commerce. PostgreSQL and MongoDB must be
dedicated instances on ports 55439/55440; no project .env is loaded here.
"""
import os

os.environ.setdefault('DEBUG', '1')
os.environ.setdefault('SECRET_KEY', 'openmind-qa-only-not-for-production')

from .settings import *  # noqa: F403,E402

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'testserver']
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'postgres',
        'USER': 'openmind_qa',
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '55439',
        # The Instagram HTTP stand-in explicitly requires this QA-only prefix.
        'TEST': {'NAME': 'test_instagram_qa_openmind_commerce'},
    }
}
MONGO_HOST = '127.0.0.1'
MONGO_PORT = 55440
MONGO_USER = ''
MONGO_PASSWORD = ''
MONGO_URI = 'mongodb://127.0.0.1:55440/?directConnection=true'
MONGO_DB_NAME = 'openmind_commerce_qa'
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
EMAIL_HOST = '127.0.0.1'
EMAIL_PORT = 55441
EMAIL_HOST_USER = ''
EMAIL_HOST_PASSWORD = ''
DEFAULT_FROM_EMAIL = 'qa@openmind.test'
STORE_MAIL_EXTERNAL_ENABLED = False
MEDIA_ROOT = BASE_DIR / '.pytest_cache' / 'commerce-qa' / 'media'  # noqa: F405
