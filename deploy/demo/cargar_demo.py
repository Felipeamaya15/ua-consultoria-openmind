#!/usr/bin/env python3
"""Carga una tienda de demostración completa (datos ficticios) usando la misma API que usa el panel.

Se puede ejecutar varias veces: lo que ya existe se omite o se vuelve a guardar igual.
Variables de entorno:
  SEED_USUARIO  correo de la dueña de la tienda (obligatorio)
  SEED_CLAVE    contraseña de la dueña (obligatorio)
  SEED_BASE     dirección del backend (por defecto http://127.0.0.1:8000)
  SEED_HOST     nombre de dominio con el que responde la tienda (por defecto localhost)
"""
import base64
import json
import os
import sys
import time

import requests

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from catalogo_demo import (CLAVE_CLIENTES, CLIENTES, LEGAL, PAGO_TRANSFERENCIA, PRODUCTOS, PROMOCIONES, RETIRO, TIENDA,  # noqa: E402
                           TRANSBANK_INTEGRACION, ZONAS)

BASE = os.environ.get('SEED_BASE', 'http://127.0.0.1:8000').rstrip('/')
HOST = os.environ.get('SEED_HOST', 'localhost')
USUARIO, CLAVE = os.environ.get('SEED_USUARIO'), os.environ.get('SEED_CLAVE')
if not USUARIO or not CLAVE:
    sys.exit('Faltan SEED_USUARIO y SEED_CLAVE (el correo y la contraseña de la dueña de la tienda).')

S = requests.Session()
S.headers.update({'Host': HOST, 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json'})  # como si llegara por HTTPS desde Caddy
resumen = []


def llamar(metodo, ruta, **kw):
    return S.request(metodo, BASE + ruta, timeout=180, **kw)


def detalle(r):
    try:
        j = r.json()
        return (j.get('mensaje') or j.get('detail') or json.dumps(j.get('detalles') or j, ensure_ascii=False))[:300]
    except Exception:  # noqa: BLE001
        return r.text[:200]


def paso(nombre, r, ok=(200, 201), tolerar=()):
    bueno = r.status_code in ok
    marca = 'OK ' if bueno else ('--' if r.status_code in tolerar else 'ERROR')
    print(f'  [{marca}] {nombre}' + ('' if bueno else f'  (HTTP {r.status_code}: {detalle(r)})'))
    resumen.append((nombre, bueno or r.status_code in tolerar))
    return bueno


def nombres_de(obj, acumulado=None):
    acumulado = set() if acumulado is None else acumulado
    if isinstance(obj, dict):
        if 'nombre' in obj and ('variantes' in obj or 'slug' in obj or 'categoria' in obj):
            acumulado.add(obj['nombre'])
        for v in obj.values():
            nombres_de(v, acumulado)
    elif isinstance(obj, list):
        for v in obj:
            nombres_de(v, acumulado)
    return acumulado


print(f'Cargando la tienda de demostración en {BASE} (host {HOST})')

# 1. Inicio de sesión de la dueña
r = llamar('POST', '/api/auth/login/', data=json.dumps({'username': USUARIO, 'password': CLAVE}))
if r.status_code != 200 or 'token' not in (r.json().get('data') or {}):
    sys.exit(f'No pude iniciar sesión como {USUARIO}: HTTP {r.status_code} {detalle(r)}')
S.headers['Authorization'] = 'Token ' + r.json()['data']['token']
print(f'  [OK ] Sesión iniciada como {USUARIO}')

# 2. Datos de la tienda
paso('Datos de la tienda (nombre, descripción, correo)', llamar('PUT', '/api/tienda/configuracion/', data=json.dumps(TIENDA)))

# 3. Medios de pago: Transbank (ambiente de integración) y transferencia
r = llamar('GET', '/api/pagos/mi-tienda/')
id_tienda = (r.json().get('data') or {}).get('id_tienda') if r.status_code == 200 else None
if id_tienda:
    paso('Webpay (Transbank) en ambiente de integración', llamar('POST', f'/api/catalog/tiendas/{id_tienda}/configuracion/transbank/', data=json.dumps(TRANSBANK_INTEGRACION)))
else:
    print('  [ERROR] No pude identificar la tienda; se omite Transbank')
r = llamar('GET', '/api/pagos/configuracion/')
datos_pago = (r.json().get('data') or {}) if r.status_code == 200 else {}
datos_pago['transfer'] = {'enabled': True, 'fields': PAGO_TRANSFERENCIA}
paso('Transferencia bancaria', llamar('PUT', '/api/pagos/configuracion/', data=json.dumps(datos_pago)))

# 4. Despachos: tarifas por región y comuna (nombres oficiales) y retiro en tienda
with open(os.path.join(AQUI, 'chileTerritory.json'), encoding='utf-8') as f:
    territorio = {reg['nombre']: [c for prov in reg['provincias'] for c in prov['comunas']] for reg in json.load(f)}


def tarifas(indice):
    filas = []
    for region, valores in ZONAS.items():
        monto, plazo = valores[indice * 2], valores[indice * 2 + 1]
        for comuna in territorio[region]:
            filas.append({'region': region, 'comuna': comuna, 'monto': monto, 'plazo_dias': plazo})
    return filas


envios = {'chilexpress': {'enabled': True, 'tarifas': tarifas(0)}, 'starken': {'enabled': True, 'tarifas': tarifas(1)}, 'pickup': RETIRO}
paso(f'Despachos: Chilexpress y Starken ({len(envios["chilexpress"]["tarifas"])} destinos cada uno) y retiro en tienda', llamar('PUT', '/api/entregas/configuracion/', data=json.dumps(envios)))

# 5. Promociones y códigos de descuento
for promo in PROMOCIONES:
    paso(f'Promoción {promo["code"]}', llamar('POST', '/api/promociones/', data=json.dumps(promo)), tolerar=(409,))

# 6. Textos legales
for tipo, texto in LEGAL.items():
    paso(f'Texto legal publicado: {tipo}', llamar('PUT', '/api/legal/configuracion/', data=json.dumps({'accion': 'publish', 'tipo': tipo, 'content': texto})))

# 7. Productos con fotos, variantes y stock
r = llamar('GET', '/api/catalog/productos/admin/')
existentes = nombres_de(r.json()) if r.status_code == 200 else set()


def foto(slug, n):
    with open(os.path.join(AQUI, 'imagenes', f'{slug}-{n}.jpg'), 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()


def cuerpo(p):
    variantes = []
    for color in p['colores']:
        for talla in (p['tallas'] or [None]):
            atributos = ([{'clave': 'talla', 'etiqueta': 'Talla', 'valor': talla}] if talla else []) + [{'clave': 'color', 'etiqueta': 'Color', 'valor': color}]
            stock = 0 if (talla, color) in p['sin_stock'] else p['stock']
            variantes.append({'sku': '-'.join([p['prefijo'], color[:3].upper(), talla or 'U']), 'precio': p['precio'], 'stock': stock, 'atributos_variante': atributos})
    return {
        'nombre': p['nombre'], 'descripcion': p['descripcion'], 'categoria': p['categoria'], 'activo': p['activo'],
        'imagenes': [foto(p['slug'], n) for n in range(1, p['fotos'] + 1)],
        'atributos_generales': [{'clave': 'material', 'etiqueta': 'Material', 'valor': p['material']},
                                {'clave': 'cuidado', 'etiqueta': 'Cuidado', 'valor': 'Lavar en ciclo suave con agua fría'},
                                {'clave': 'origen', 'etiqueta': 'Origen', 'valor': 'Hecho en Chile'}],
        'variantes': variantes,
        'seo': {'meta_titulo': f'{p["nombre"]} | {TIENDA["nombre"]}', 'meta_descripcion': p['descripcion'][:155]},
    }


creados = 0
for p in PRODUCTOS:
    if p['nombre'] in existentes:
        print(f'  [--] Producto ya existía: {p["nombre"]}')
        continue
    t0 = time.time()
    r = llamar('POST', '/api/catalog/productos/crear/', data=json.dumps(cuerpo(p)))
    if r.status_code == 400 and 'ya existe' in detalle(r):
        print(f'  [--] Producto ya existía: {p["nombre"]}')
        continue
    if paso(f'Producto {p["nombre"]} ({p["categoria"]}, {len(p["colores"]) * len(p["tallas"] or [1])} variantes, {p["fotos"]} fotos, {time.time() - t0:.1f} s)', r):
        creados += 1

# 7b. Reemplazar solo las fotos de los productos ya cargados (SEED_FOTOS=1), sin borrar nada
if os.environ.get('SEED_FOTOS') == '1':
    print('\nActualizando las fotos de los productos ya cargados')
    pub = requests.get(BASE + '/api/catalog/productos/', headers={'Host': HOST, 'X-Forwarded-Proto': 'https'}, timeout=120).json()
    filas = pub if isinstance(pub, list) else (pub.get('data') or pub.get('productos') or [])
    filas = filas.get('productos', []) if isinstance(filas, dict) else filas
    por_nombre = {p['nombre']: p for p in PRODUCTOS}

    def buscar(obj, clave):
        if isinstance(obj, dict):
            if clave in obj and isinstance(obj[clave], str):
                return obj[clave]
            for v in obj.values():
                r = buscar(v, clave)
                if r:
                    return r
        elif isinstance(obj, list):
            for v in obj:
                r = buscar(v, clave)
                if r:
                    return r
        return None

    for fila in filas:
        p = por_nombre.get(fila.get('nombre'))
        if not p:
            continue
        det = llamar('GET', f'/api/catalog/productos/{fila["id"]}/admin/')
        revision = buscar(det.json(), 'revision') if det.status_code == 200 else None
        if not revision:
            print(f'  [ERROR] {p["nombre"]}: no pude leer la revisión del producto (HTTP {det.status_code})')
            resumen.append((f'Fotos de {p["nombre"]}', False))
            continue
        r = llamar('PATCH', f'/api/catalog/productos/{fila["id"]}/actualizar/', data=json.dumps({'revision': revision, 'imagenes': [foto(p['slug'], n) for n in range(1, p['fotos'] + 1)]}))
        paso(f'Fotos nuevas de {p["nombre"]} ({p["fotos"]})', r)

# 8. Clientes de prueba
for c in CLIENTES:
    nombre, apellido = c['nombre'].split(' ', 1)
    r = llamar('POST', '/api/auth/register/', data=json.dumps({'username': c['correo'], 'email': c['correo'], 'password': CLAVE_CLIENTES, 'first_name': nombre, 'last_name': apellido}))
    paso(f'Cliente de prueba {c["correo"]}', r, tolerar=(400, 409))

# 9. Comprobación final, como la vería un cliente
print('\nComprobación final')
cat = requests.get(BASE + '/api/catalog/productos/', headers={'Host': HOST, 'X-Forwarded-Proto': 'https'}, timeout=120)
publicos = nombres_de(cat.json()) if cat.status_code == 200 else set()
print(f'  Catálogo público: {len(publicos)} productos visibles ({cat.status_code}), {len(cat.content) / 1e6:.2f} MB por visita')
ocultos = [p['nombre'] for p in PRODUCTOS if not p['activo'] and p['nombre'] in publicos]
print('  Producto en borrador oculto al público:', 'SÍ' if not ocultos else 'NO, se ve: ' + ', '.join(ocultos))
for operador, region, comuna in (('Chilexpress', 'Metropolitana de Santiago', 'Providencia'), ('Starken', 'Biobío', 'Concepción'), ('Chilexpress', 'Antofagasta', 'Antofagasta')):
    q = requests.post(BASE + '/api/entregas/cotizacion/', headers={'Host': HOST, 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json'}, data=json.dumps({'operador': operador, 'region': region, 'comuna': comuna}), timeout=60)
    t = ((q.json().get('data') or {}).get('tarifas') or [{}])[0] if q.status_code == 200 else {}
    print(f'  Cotización {operador} a {comuna}: HTTP {q.status_code}' + (f' -> $ {int(float(t.get("monto", 0))):,} en {t.get("plazo_dias")} días'.replace(',', '.') if q.status_code == 200 else ' ' + detalle(q)))
act = requests.get(BASE + '/api/pagos/activos/', headers={'Host': HOST, 'X-Forwarded-Proto': 'https'}, timeout=60)
print(f'  Medios de pago activos: {json.dumps(act.json().get("data"), ensure_ascii=False)[:240]}')
malos = [n for n, ok in resumen if not ok]
print(f'\nResultado: {len(resumen) - len(malos)} pasos bien, {len(malos)} con error. Productos nuevos creados: {creados}.')
if malos:
    print('Con error:', '; '.join(malos))
    sys.exit(1)
