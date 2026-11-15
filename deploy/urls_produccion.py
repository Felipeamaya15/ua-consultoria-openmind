"""Rutas de producción del kit de despliegue (carpeta deploy/).

Reutiliza las rutas del proyecto y agrega la entrega de las imágenes de la tienda
(/media/landing/... y /landing/...), que config/urls.py solo publica cuando DEBUG está activo.
Usa las mismas funciones acotadas del proyecto (config.media): solo entregan imágenes de las
carpetas permitidas, nunca el código ni directorios completos.
"""
from config.media import media_urlpatterns
from config.urls import urlpatterns as _rutas_del_proyecto

urlpatterns = list(_rutas_del_proyecto) + media_urlpatterns()
