#!/usr/bin/env python3
"""Borra los productos de pruebas anteriores, dejando solo los de la tienda de demostración.

Por defecto SOLO MUESTRA qué borraría. Para borrar de verdad: SEED_CONFIRMAR=1.
Variables: SEED_USUARIO, SEED_CLAVE (obligatorias), SEED_BASE, SEED_HOST (opcionales).
"""
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalogo_demo import PRODUCTOS  # noqa: E402

BASE = os.environ.get('SEED_BASE', 'http://127.0.0.1:8000').rstrip('/')
HOST = os.environ.get('SEED_HOST', 'localhost')
if not os.environ.get('SEED_USUARIO') or not os.environ.get('SEED_CLAVE'):
    sys.exit('Faltan SEED_USUARIO y SEED_CLAVE.')
H = {'Host': HOST, 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json'}
r = requests.post(BASE + '/api/auth/login/', headers=H, data=json.dumps({'username': os.environ['SEED_USUARIO'], 'password': os.environ['SEED_CLAVE']}), timeout=60)
if r.status_code != 200:
    sys.exit(f'No pude iniciar sesión: HTTP {r.status_code}')
H['Authorization'] = 'Token ' + r.json()['data']['token']
demo = {p['nombre'] for p in PRODUCTOS}
publico = {k: v for k, v in H.items() if k not in ('Authorization', 'Content-Type')}
respuesta = requests.get(BASE + '/api/catalog/productos/', headers=publico, timeout=120).json()
lista = respuesta if isinstance(respuesta, list) else (respuesta.get('data') or respuesta.get('productos') or [])
lista = lista.get('productos', []) if isinstance(lista, dict) else lista
sobran = [p for p in lista if p['nombre'] not in demo]
print(f'Productos visibles: {len(lista)}. De la tienda de demostración: {len(lista) - len(sobran)}. De pruebas anteriores: {len(sobran)}.')
for p in sobran:
    print(f'  - {p["nombre"]}')
if not sobran:
    sys.exit(0)
if os.environ.get('SEED_CONFIRMAR') != '1':
    print('\nNo se borró nada. Para borrarlos de verdad, repite con SEED_CONFIRMAR=1.')
    sys.exit(0)
for p in sobran:
    d = requests.delete(f'{BASE}/api/catalog/productos/{p["id"]}/eliminar/', headers=H, timeout=60)
    print(f'  [{"OK " if d.status_code == 200 else "ERROR"}] borrado: {p["nombre"]} (HTTP {d.status_code})')
