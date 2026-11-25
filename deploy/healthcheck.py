"""Comprobación de salud del backend para Docker: pide una ruta pública y exige respuesta 200.

Se hace como si la petición viniera de Caddy por HTTPS (cabeceras Host y X-Forwarded-Proto);
sin ellas Django respondería con una redirección a HTTPS.
"""
import os
import sys
import urllib.request

peticion = urllib.request.Request(
    'http://127.0.0.1:8000/api/version/',
    headers={'Host': os.environ.get('DOMAIN', 'localhost'), 'X-Forwarded-Proto': 'https'},
)
try:
    with urllib.request.urlopen(peticion, timeout=5) as respuesta:
        sys.exit(0 if respuesta.status == 200 else 1)
except Exception:
    sys.exit(1)
