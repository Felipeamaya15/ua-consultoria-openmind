"""Ajustes extra de producción del kit de despliegue (carpeta deploy/).

Se apoya en config.settings sin modificarlo: todo lo que ese archivo lee del entorno
(SECRET_KEY, DEBUG, hosts, correo, bases de datos...) sigue funcionando igual.
Aquí solo se agrega lo que falta para producción:
  - STATIC_ROOT: carpeta donde "collectstatic" deja los estilos del administrador de Django.
"""
from config.settings import *  # noqa: F401,F403
from config.settings import BASE_DIR

STATIC_ROOT = BASE_DIR / 'staticfiles'
ROOT_URLCONF = 'config.urls_produccion'
