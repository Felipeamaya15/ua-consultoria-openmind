"""SCRUM-500: pruebas de integración logística (caja negra).

Cada escenario se registra con: id, área, escenario, esperado, obtenido y estado.
Ejecutar (SQLite de prueba, tablas creadas desde los modelos):
    python manage.py test apps.core.qa_s9_logistica --settings=qa_settings
Resultado: /tmp/s9/qa_logistica.json
"""
import json
import math
import os
import time as _t
from decimal import Decimal
from unittest.mock import MagicMock, patch

import requests
from django.contrib.auth import get_user_model
from django.core import signing
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.catalog.domain.seguimiento import estandarizar_estado
from apps.catalog.infrastructure.adapters.chilexpress_response import procesar_respuesta_chilexpress
from apps.catalog.infrastructure.adapters.seguimiento_response import procesar_respuesta_seguimiento
from apps.catalog.infrastructure.adapters.starken_response import procesar_respuesta_starken
from apps.core import shipping as core_shipping
from apps.core.delivery import delivery_defaults
from apps.core.models import ConfiguracionEntrega, ConfiguracionPago, Pedido, Tienda
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from uuid import uuid4
from apps.shipping.domain.dtos import DireccionDespachoDTO, PaqueteDTO
from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException, validar_tiempo_espera)
from apps.shipping.domain.services import ShippingDomainService
from apps.shipping.infrastructure.adapters import (
    ChilexpressAdapter, StandardLogisticsAdapter, StarkenAdapter, get_logistics_adapter)

RES = []


def reg(id_, area, esc, esp, obt, ok, nota=''):
    RES.append({'id': id_, 'area': area, 'escenario': esc, 'esperado': esp, 'obtenido': obt,
                'estado': 'CUMPLE' if ok else 'NO CUMPLE', 'nota': nota})


def scen(id_, area, esc, esp):
    """Ejecuta el escenario al definirlo; una excepción inesperada cuenta como NO CUMPLE."""
    def deco(fn):
        try:
            res = fn()
            obt, ok = res[0], res[1]
            nota = res[2] if len(res) > 2 else ''
        except Exception as exc:  # noqa: BLE001
            obt, ok, nota = f'Excepción {type(exc).__name__}: {str(exc)[:110]}', False, ''
        reg(id_, area, esc, esp, obt, ok, nota)
        return fn
    return deco


def volcar():
    os.makedirs('/tmp/s9', exist_ok=True)
    with open('/tmp/s9/qa_logistica.json', 'w', encoding='utf-8') as f:
        json.dump(sorted(RES, key=lambda r: (r['id'][0], int(r['id'][1:]))), f, ensure_ascii=False, indent=1)
    ok = sum(1 for r in RES if r['estado'] == 'CUMPLE')
    print(f'\n=== SCRUM-500: {len(RES)} escenarios, {ok} CUMPLE, {len(RES) - ok} NO CUMPLE ===')
    for r in RES:
        if r['estado'] != 'CUMPLE':
            print(f"  NO CUMPLE {r['id']}: {r['escenario']} -> {r['obtenido']}")


def j(resp):
    try:
        return json.loads(resp.content)
    except ValueError:
        return {}


def cod(resp):
    body = j(resp)
    err = body.get('error') if isinstance(body, dict) else None
    return err.get('codigo') if isinstance(err, dict) else None


def dto_dir(region='METROPOLITANA', comuna='Providencia'):
    return DireccionDespachoDTO(calle='Calle', numero='1', comuna=comuna, region=region)


PAQ = [PaqueteDTO(peso_kg=Decimal('1'), alto_cm=Decimal('10'), ancho_cm=Decimal('10'), largo_cm=Decimal('10'), valor_declarado=Decimal('10000'))]
ORIGEN = dto_dir('Metropolitana', 'Santiago')


class LogisticaQA(TestCase):
    URL_Q = '/api/entregas/cotizacion/'
    L = '/api/logistica/'

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='qa-owner', is_staff=True)
        self.store = Tienda.objects.create(nombre='QA Logística', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.data = delivery_defaults()
        for carrier, amount in (('chilexpress', 4500), ('starken', 6900)):
            self.data[carrier].update(enabled=True, tarifas=[
                {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': amount, 'plazo_dias': 2},
                {'region': 'Valparaíso', 'comuna': 'Viña del Mar', 'monto': amount + 1000, 'plazo_dias': None},
            ])
        self.config = ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.data)
        self.req = {'operador': 'Chilexpress', 'region': 'Metropolitana', 'comuna': 'Providencia'}

    @classmethod
    def tearDownClass(cls):
        volcar()
        super().tearDownClass()

    # ------------------------------------------------------------------
    def q(self, **ch):
        return self.api.post(self.URL_Q, {**self.req, **ch}, format='json')

    def set_rate(self, carrier='chilexpress', **ch):
        self.data[carrier]['tarifas'][0].update(ch)
        self.config.datos = self.data
        self.config.save()

    # ================= A. COTIZACIÓN DE LA TIENDA =====================
    def test_A_cotizacion_tienda(self):
        A = 'A. Cotización de la tienda'

        @scen('A01', A, 'Cotizar Chilexpress a Providencia con tarifa configurada', '200; monto 4500 CLP, plazo 2, origen configuracion_tienda y cotización firmada con vencimiento')
        def _():
            r = self.q(); d = j(r)['data']['tarifas'][0]
            ok = (r.status_code == 200 and d['monto'] == '4500' and d['moneda'] == 'CLP' and d['plazo_dias'] == 2
                  and d['origen'] == 'configuracion_tienda' and bool(d['cotizacion']) and d['vence_en'] > _t.time())
            return f"{r.status_code}; monto {d['monto']} {d['moneda']}, plazo {d['plazo_dias']}, origen {d['origen']}, vence en {d['vence_en'] - int(_t.time())} s", ok, 'El endpoint es público (sin sesión)'

        @scen('A02', A, 'Cotizar Starken a Providencia', '200; monto 6900 CLP y plazo 2 días')
        def _():
            r = self.q(operador='Starken'); d = j(r)['data']['tarifas'][0]
            return f"{r.status_code}; monto {d['monto']}, plazo {d['plazo_dias']}, operador {d['operador']}", r.status_code == 200 and d['monto'] == '6900' and d['plazo_dias'] == 2

        @scen('A03', A, 'Tarifa sin plazo configurado (Viña del Mar)', '200; plazo_dias nulo')
        def _():
            r = self.q(region='Valparaíso', comuna='Viña del Mar'); d = j(r)['data']['tarifas'][0]
            return f"{r.status_code}; monto {d['monto']}, plazo {d['plazo_dias']}", r.status_code == 200 and d['monto'] == '5500' and d['plazo_dias'] is None

        @scen('A04', A, 'Operador no permitido (Correos)', '400 sin llegar al cálculo')
        def _():
            r = self.q(operador='Correos'); return f'{r.status_code}; {list(j(r).keys())}', r.status_code == 400

        @scen('A05', A, 'Operador ausente', '400')
        def _():
            body = {k: v for k, v in self.req.items() if k != 'operador'}
            r = self.api.post(self.URL_Q, body, format='json'); return f'{r.status_code}', r.status_code == 400

        @scen('A06', A, 'Comuna que no pertenece a la región', '400 con código DESTINO_INVALIDO')
        def _():
            r = self.q(comuna='Viña del Mar'); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'DESTINO_INVALIDO'

        @scen('A07', A, 'Comuna inexistente', '400 con código DESTINO_INVALIDO')
        def _():
            r = self.q(comuna='Narnia'); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'DESTINO_INVALIDO'

        @scen('A08', A, 'Comuna válida sin tarifa configurada (Santiago)', '400 con código TARIFA_NO_DISPONIBLE')
        def _():
            r = self.q(comuna='Santiago'); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'TARIFA_NO_DISPONIBLE'

        @scen('A09', A, 'Transportista deshabilitado en la tienda', '400 con código TRANSPORTISTA_NO_HABILITADO')
        def _():
            self.data['starken']['enabled'] = False; self.config.datos = self.data; self.config.save()
            r = self.q(operador='Starken'); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'TRANSPORTISTA_NO_HABILITADO'

        @scen('A10', A, 'Campo no permitido en el cuerpo (costo)', '400: el serializer estricto lo rechaza')
        def _():
            r = self.q(costo=1); return f'{r.status_code}', r.status_code == 400

        @scen('A11', A, 'Intento de elegir otra tienda con tienda_id en el cuerpo', '400')
        def _():
            r = self.q(tienda_id=999); return f'{r.status_code}', r.status_code == 400

        @scen('A12', A, 'Cabecera X-Tienda-ID de otra tienda', '400: la tienda se contrasta, no se selecciona')
        def _():
            r = self.api.post(self.URL_Q, self.req, format='json', HTTP_X_TIENDA_ID='999'); return f'{r.status_code}', r.status_code == 400

        @scen('A13', A, 'Tarifas corruptas en la base (monto texto, negativo, decimal, enorme, booleano; plazo 0, 366, texto)', 'Siempre 400 TARIFA_NO_DISPONIBLE, nunca 500')
        def _():
            malos = [('monto', '4500'), ('monto', -1), ('monto', 1.5), ('monto', 10 ** 11), ('monto', True), ('plazo_dias', 0), ('plazo_dias', 366), ('plazo_dias', '2')]
            res = []
            for campo, valor in malos:
                self.data['chilexpress']['tarifas'][0] = {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': 4500, 'plazo_dias': 2}
                self.set_rate(**{campo: valor})
                r = self.q(); res.append((campo, repr(valor)[:12], r.status_code, cod(r)))
            ok = all(s == 400 and c == 'TARIFA_NO_DISPONIBLE' for _, _, s, c in res)
            return '; '.join(f'{c}={v}→{s} {k}' for c, v, s, k in res), ok

        @scen('A14', A, 'Dos tarifas duplicadas para el mismo destino', '400 TARIFA_NO_DISPONIBLE (ambigüedad)')
        def _():
            fila = {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': 4500, 'plazo_dias': 2}
            self.data['chilexpress']['tarifas'] = [dict(fila), dict(fila)]
            self.config.datos = self.data; self.config.save()
            r = self.q(); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'TARIFA_NO_DISPONIBLE'

        @scen('A15', A, 'Método GET en la cotización', '405')
        def _():
            r = self.api.get(self.URL_Q); return f'{r.status_code}', r.status_code == 405

        @scen('A16', A, 'JSON mal formado', '400')
        def _():
            r = self.api.post(self.URL_Q, data='{"operador":', content_type='application/json'); return f'{r.status_code}', r.status_code == 400

        @scen('A17', A, 'Tipos inválidos (región numérica, comuna lista)', '400')
        def _():
            r = self.q(region=123, comuna=['x']); return f'{r.status_code}', r.status_code == 400

        @scen('A18', A, 'Texto demasiado largo (200 caracteres)', '400')
        def _():
            r = self.q(comuna='x' * 200); return f'{r.status_code}', r.status_code == 400

    def test_A_instalacion_sin_tienda_o_con_varias(self):
        A = 'A. Cotización de la tienda'
        otro = get_user_model().objects.create_user(username='qa-otro')

        @scen('A19', A, 'Instalación con dos tiendas', '503: nunca elige una al azar')
        def _():
            Tienda.objects.create(nombre='Otra', id_usuario_propietario=otro)
            r = self.q(); return f'{r.status_code}; {cod(r) or j(r).get("detail", "")[:50]}', r.status_code == 503

        @scen('A20', A, 'Instalación sin tienda configurada', '503')
        def _():
            Tienda.objects.all().delete()
            r = self.q(); return f'{r.status_code}', r.status_code == 503

    # ================= B. COTIZACIÓN FIRMADA ==========================
    def test_B_cotizacion_firmada(self):
        B = 'B. Cotización firmada (validación en el pedido)'
        addr = {'region': 'Metropolitana', 'city': 'Providencia'}
        token = j(self.q())['data']['tarifas'][0]['cotizacion']

        def vq(tok, op='Chilexpress'):
            try:
                core_shipping.validate_quote(self.store, op, addr, tok)
                return 'aceptada'
            except core_shipping.ErrorCotizacion as e:
                return e.codigo_error

        @scen('B01', B, 'Cotización vigente y sin cambios', 'Aceptada')
        def _():
            r = vq(token); return r, r == 'aceptada'

        @scen('B02', B, 'Cotización vencida (más de 15 minutos)', 'COTIZACION_VENCIDA')
        def _():
            real = _t.time()
            with patch('time.time', return_value=real + 1000):
                r = vq(token)
            return r, r == 'COTIZACION_VENCIDA'

        @scen('B03', B, 'Cotización manipulada (se altera la firma)', 'COTIZACION_INVALIDA')
        def _():
            mala = token[:-3] + ('AAA' if not token.endswith('AAA') else 'BBB'); r = vq(mala); return r, r == 'COTIZACION_INVALIDA'

        @scen('B04', B, 'Cotización vacía o ausente', 'COTIZACION_INVALIDA')
        def _():
            a, b = vq(''), vq(None); return f'vacía→{a}; None→{b}', a == b == 'COTIZACION_INVALIDA'

        @scen('B05', B, 'Cotización firmada para otra tienda', 'COTIZACION_CAMBIO')
        def _():
            p = signing.loads(token, salt=core_shipping.QUOTE_SALT); p['tienda'] = 999999
            r = vq(signing.dumps(p, salt=core_shipping.QUOTE_SALT)); return r, r == 'COTIZACION_CAMBIO'

        @scen('B06', B, 'La tienda cambia el monto de la tarifa después de cotizar', 'COTIZACION_CAMBIO')
        def _():
            self.set_rate(monto=5000); r = vq(token); return r, r == 'COTIZACION_CAMBIO'

        @scen('B07', B, 'La tienda elimina la tarifa después de cotizar', 'TARIFA_NO_DISPONIBLE')
        def _():
            self.data['chilexpress']['tarifas'] = []; self.config.datos = self.data; self.config.save()
            r = vq(token); return r, r == 'TARIFA_NO_DISPONIBLE'

        @scen('B08', B, 'La tienda deshabilita el transportista después de cotizar', 'TRANSPORTISTA_NO_HABILITADO')
        def _():
            self.data['chilexpress']['enabled'] = False; self.config.datos = self.data; self.config.save()
            r = vq(token); return r, r == 'TRANSPORTISTA_NO_HABILITADO'

        @scen('B09', B, 'Cotización de Chilexpress usada para pedir con Starken', 'COTIZACION_CAMBIO')
        def _():
            r = vq(token, 'Starken'); return r, r == 'COTIZACION_CAMBIO'

        @scen('B10', B, 'Contenido firmado que no es un objeto', 'COTIZACION_INVALIDA')
        def _():
            r = vq(signing.dumps('texto', salt=core_shipping.QUOTE_SALT)); return r, r == 'COTIZACION_INVALIDA'

        @scen('B11', B, 'Firma hecha con otra sal (otro uso de la clave)', 'COTIZACION_INVALIDA')
        def _():
            p = signing.loads(token, salt=core_shipping.QUOTE_SALT)
            r = vq(signing.dumps(p, salt='otra.sal')); return r, r == 'COTIZACION_INVALIDA'

    # ================= C. MÓDULO LOGÍSTICO: COTIZACIÓN ================
    def test_C_cotizacion_logistica(self):
        C = 'C. Módulo logístico: cotización'
        base = {'comuna': 'Providencia', 'region': 'Metropolitana', 'total_carrito': 20000, 'total_items': 2}

        def post(path, data=None, **kw):
            return self.api.post(self.L + path, data if data is not None else base, format='json', **kw)

        @scen('C01', C, 'Cotizar con todos los transportistas (RM, compra de $ 20.000)', '200; 3 transportistas, opciones ordenadas por costo y recomendada = la más barata')
        def _():
            r = post('cotizar/'); d = j(r)['data']; ops = d['opciones']
            costos = [o['costo'] for o in ops]; provs = sorted({o['proveedor'] for o in ops})
            ok = r.status_code == 200 and len(provs) == 3 and costos == sorted(costos) and d['opcion_recomendada'] == ops[0]
            return f"{r.status_code}; {len(ops)} opciones de {', '.join(provs)}; costos {costos}", ok

        @scen('C02', C, 'Envío gratis en RM al llegar al umbral ($ 30.000) y no antes ($ 29.999)', 'Con 30.000 hay opciones gratis; con 29.999 no')
        def _():
            a = j(post('cotizar/', {**base, 'total_carrito': 30000}))['data']['opciones']
            b = j(post('cotizar/', {**base, 'total_carrito': 29999}))['data']['opciones']
            ga, gb = [o for o in a if o['es_gratis']], [o for o in b if o['es_gratis']]
            return f'$30.000: {len(ga)} gratis ({", ".join(o["servicio"] for o in ga)}); $29.999: {len(gb)} gratis', len(ga) >= 1 and len(gb) == 0

        @scen('C03', C, 'Envío gratis no aplica fuera de la RM', 'Sin opciones gratis en Valparaíso con $ 50.000')
        def _():
            ops = j(post('cotizar/', {**base, 'region': 'Valparaiso', 'comuna': 'Viña del Mar', 'total_carrito': 50000}))['data']['opciones']
            return f'{sum(o["es_gratis"] for o in ops)} gratis de {len(ops)}', not any(o['es_gratis'] for o in ops)

        @scen('C04', C, 'Cotización con transportista fijo (Chilexpress y Starken)', '200; todas las opciones del transportista pedido')
        def _():
            a = j(post('cotizar/chilexpress/'))['data']['opciones']; b = j(post('cotizar/starken/'))['data']['opciones']
            pa, pb = {o['proveedor'] for o in a}, {o['proveedor'] for o in b}
            return f'Chilexpress→{sorted(pa)}; Starken→{sorted(pb)}', len(pa) == 1 and len(pb) == 1 and pa != pb

        @scen('C05', C, 'Recargo por peso: 3,5 kg frente a 1,5 kg en Chilexpress', 'Diferencia de $ 1.900 por servicio ($ 950 por kg extra)')
        def _():
            a = {o['servicio']: o['costo'] for o in j(post('cotizar/chilexpress/', {**base, 'peso_kg': '1.5'}))['data']['opciones']}
            b = {o['servicio']: o['costo'] for o in j(post('cotizar/chilexpress/', {**base, 'peso_kg': '3.5'}))['data']['opciones']}
            difs = {s: b[s] - a[s] for s in a}
            return f'diferencias {difs}', all(v == 1900 for v in difs.values())

        @scen('C06', C, 'Región inexistente (Atlantis)', '400 con el error en el campo region')
        def _():
            r = post('cotizar/', {**base, 'region': 'Atlantis'}); return f'{r.status_code}; {list(j(r).get("errores", {}))}', r.status_code == 400 and 'region' in j(r).get('errores', {})

        @scen('C07', C, 'Comuna ausente o vacía', '400')
        def _():
            a = post('cotizar/', {k: v for k, v in base.items() if k != 'comuna'}); b = post('cotizar/', {**base, 'comuna': ''})
            return f'ausente→{a.status_code}; vacía→{b.status_code}', a.status_code == b.status_code == 400

        @scen('C08', C, 'Valores fuera de rango (items 0, total 0, peso 0,05, total negativo)', '400 en todos')
        def _():
            casos = [{'total_items': 0}, {'total_carrito': 0}, {'peso_kg': '0.05'}, {'total_carrito': -5}]
            codes = [post('cotizar/', {**base, **c}).status_code for c in casos]
            return f'{codes}', all(c == 400 for c in codes)

        @scen('C09', C, 'Tipos inválidos (total texto, items decimal)', '400')
        def _():
            codes = [post('cotizar/', {**base, 'total_carrito': 'abc'}).status_code, post('cotizar/', {**base, 'total_items': 1.5}).status_code]
            return f'{codes}', all(c == 400 for c in codes)

        @scen('C10', C, 'Alias de región (RM, Región Metropolitana, Araucanía, OHiggins)', '200 en todos')
        def _():
            codes = {a: post('cotizar/', {**base, 'region': a}).status_code for a in ('RM', 'Región Metropolitana', 'Araucanía', 'OHiggins')}
            return f'{codes}', all(c == 200 for c in codes.values())

        @scen('C11', C, 'Transportista desconocido en el cuerpo (fedex)', 'Se comporta como "todos" (comportamiento registrado)')
        def _():
            r = post('cotizar/', {**base, 'proveedor': 'fedex'}); n = len(j(r).get('data', {}).get('opciones', []))
            return f'{r.status_code}; {n} opciones', r.status_code == 200 and n > 0, 'No avisa que el transportista pedido no existe'

        @scen('C12', C, 'Método GET en la cotización', '405')
        def _():
            r = self.api.get(self.L + 'cotizar/'); return f'{r.status_code}', r.status_code == 405

        @scen('C13', C, 'Tiempo de espera agotado con Chilexpress fijo', '504 TIEMPO_ESPERA_AGOTADO con cabecera Retry-After: 30')
        def _():
            with patch.object(ChilexpressAdapter, '_obtener_tarifas_region', side_effect=TimeoutError):
                r = post('cotizar/chilexpress/')
            return f"{r.status_code}; {cod(r)}; Retry-After={r.get('Retry-After')}", r.status_code == 504 and cod(r) == 'TIEMPO_ESPERA_AGOTADO' and r.get('Retry-After') == '30'

        @scen('C14', C, 'Tiempo de espera agotado en los tres transportistas', '504 TIEMPO_ESPERA_AGOTADO')
        def _():
            with patch.object(ChilexpressAdapter, 'cotizar_envio', side_effect=TimeoutError), \
                 patch.object(StarkenAdapter, 'cotizar_envio', side_effect=requests.exceptions.Timeout), \
                 patch.object(StandardLogisticsAdapter, 'cotizar_envio', side_effect=TimeoutError):
                r = post('cotizar/')
            return f'{r.status_code}; {cod(r)}', r.status_code == 504 and cod(r) == 'TIEMPO_ESPERA_AGOTADO'

        @scen('C15', C, 'Un transportista falla y los otros responden', '200 con las opciones de los transportistas restantes (degradación parcial)')
        def _():
            with patch.object(ChilexpressAdapter, 'cotizar_envio', side_effect=RuntimeError('caído')):
                r = post('cotizar/')
            provs = sorted({o['proveedor'] for o in j(r).get('data', {}).get('opciones', [])})
            return f'{r.status_code}; proveedores {provs}', r.status_code == 200 and 'CHILEXPRESS' not in provs and len(provs) == 2

        @scen('C16', C, 'Todos los transportistas fallan (no por tiempo)', '502 PROVEEDOR_NO_DISPONIBLE')
        def _():
            with patch.object(ChilexpressAdapter, 'cotizar_envio', side_effect=RuntimeError('x')), \
                 patch.object(StarkenAdapter, 'cotizar_envio', side_effect=RuntimeError('x')), \
                 patch.object(StandardLogisticsAdapter, 'cotizar_envio', side_effect=RuntimeError('x')):
                r = post('cotizar/')
            return f'{r.status_code}; {cod(r)}', r.status_code == 502 and cod(r) == 'PROVEEDOR_NO_DISPONIBLE'

        @scen('C17', C, 'Un transportista no cubre el destino y otros sí', '200 con los que cubren')
        def _():
            with patch.object(ChilexpressAdapter, 'cotizar_envio', side_effect=DireccionFueraDeCoberturaException('sin cobertura')):
                r = post('cotizar/')
            return f'{r.status_code}; {len(j(r).get("data", {}).get("opciones", []))} opciones', r.status_code == 200

        @scen('C18', C, 'Ningún transportista cubre el destino', '400 SIN_COBERTURA')
        def _():
            with patch.object(ChilexpressAdapter, 'cotizar_envio', side_effect=DireccionFueraDeCoberturaException('x')), \
                 patch.object(StarkenAdapter, 'cotizar_envio', side_effect=DireccionFueraDeCoberturaException('x')), \
                 patch.object(StandardLogisticsAdapter, 'cotizar_envio', side_effect=DireccionFueraDeCoberturaException('x')):
                r = post('cotizar/')
            return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'SIN_COBERTURA'

        @scen('C19', C, 'Respuesta inválida de un transportista fijo (ValueError)', '502 RESPUESTA_OPERADOR_INVALIDA')
        def _():
            with patch.object(ChilexpressAdapter, 'cotizar_envio', side_effect=ValueError('respuesta corrupta')):
                r = post('cotizar/chilexpress/')
            return f'{r.status_code}; {cod(r)}', r.status_code == 502 and cod(r) == 'RESPUESTA_OPERADOR_INVALIDA'

        @scen('C20', C, 'Error inesperado interno', '500 ERROR_INTERNO sin filtrar detalles técnicos')
        def _():
            falso = MagicMock(); falso.return_value.cotizar.side_effect = RuntimeError('SECRETO-INTERNO')
            with patch('apps.shipping.presentation.views.ShippingQuotationService', falso):
                r = post('cotizar/')
            return f'{r.status_code}; {cod(r)}; filtra el detalle: {"SECRETO-INTERNO" in r.content.decode()}', r.status_code == 500 and cod(r) == 'ERROR_INTERNO' and b'SECRETO-INTERNO' not in r.content

    # ================= D. SEGUIMIENTO ==================================
    def test_D_seguimiento(self):
        D = 'D. Seguimiento de envíos'
        S = self.L + 'seguimiento/'

        def get(path, **kw):
            return self.api.get(S + path, **kw)

        @scen('D01', D, 'Seguimiento Chilexpress con código válido (CHILEX-ABC12345)', '200; proveedor CHILEXPRESS con historial de eventos y estado estándar')
        def _():
            r = get('chilexpress/CHILEX-ABC12345/'); d = j(r).get('data', {})
            ok = r.status_code == 200 and d.get('proveedor') == 'CHILEXPRESS' and len(d.get('historial', [])) >= 1 and d.get('estado_estandar')
            return f"{r.status_code}; {d.get('proveedor')}; {len(d.get('historial', []))} eventos; estado {d.get('estado_actual')} → {d.get('estado_estandar')}", ok

        @scen('D02', D, 'Seguimiento Starken con código STK-', '200 con proveedor STARKEN (se registra el formato aceptado)')
        def _():
            r = get('starken/STK-ABC12345/'); d = j(r).get('data', {})
            return f"{r.status_code}; {d.get('proveedor')}; {len(d.get('historial', []))} eventos", r.status_code == 200 and d.get('proveedor') == 'STARKEN'

        @scen('D03', D, 'Seguimiento del operador estándar (TRK-ABCD1234) por la ruta genérica', '200; LOGISTICA_CENTRAL con 3 eventos')
        def _():
            r = get('TRK-ABCD1234/'); d = j(r).get('data', {})
            return f"{r.status_code}; {d.get('proveedor')}; {len(d.get('historial', []))} eventos; {d.get('estado_actual')}", r.status_code == 200 and len(d.get('historial', [])) == 3

        @scen('D04', D, 'Chilexpress: código con formato inválido (ABC)', '400 FORMATO_TRACKING_INVALIDO')
        def _():
            r = get('chilexpress/ABC/'); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'FORMATO_TRACKING_INVALIDO'

        @scen('D05', D, 'Chilexpress: orden de transporte numérica de 8 dígitos', '200')
        def _():
            r = get('chilexpress/12345678/'); return f'{r.status_code}', r.status_code == 200

        @scen('D06', D, 'Códigos que no existen (terminan en 0000 o contienen NOTFOUND)', '404 TRACKING_NO_ENCONTRADO en Chilexpress, Starken y estándar')
        def _():
            rs = [get('chilexpress/CHILEX-ABC10000/'), get('starken/STK-ABC10000/'), get('TRK-NOTFOUND/')]
            return '; '.join(f'{r.status_code} {cod(r)}' for r in rs), all(r.status_code == 404 and cod(r) == 'TRACKING_NO_ENCONTRADO' for r in rs)

        @scen('D07', D, 'Tiempo de espera simulado con la palabra TIMEOUT en el código', '504 TIEMPO_ESPERA_AGOTADO con Retry-After')
        def _():
            r = get('chilexpress/CHILEX-TIMEOUT1/'); return f"{r.status_code}; {cod(r)}; Retry-After={r.get('Retry-After')}", r.status_code == 504 and r.get('Retry-After') == '30', 'Comportamiento de prueba presente en código de producción'

        @scen('D08', D, 'Ruta genérica con un código que no corresponde a ningún transportista (ABC12345)', '400 FORMATO_TRACKING_INVALIDO (error de entrada del usuario)')
        def _():
            r = get('ABC12345/'); return f'{r.status_code}; {cod(r)}', r.status_code == 400

        @scen('D09', D, 'Ruta genérica con código numérico de 8 dígitos (válido en Chilexpress por la ruta fija)', '200 o 400, no 500')
        def _():
            r = get('12345678/'); return f'{r.status_code}; {cod(r)}', r.status_code in (200, 400), 'En la ruta genérica, un código sin prefijo reconocido se atiende con Chilexpress (adaptador por defecto)'

        def con_resp(valor):
            with patch.object(ChilexpressAdapter, '_obtener_respuesta_seguimiento', return_value=valor):
                return get('chilexpress/CHILEX-ABC12345/')

        @scen('D10', D, 'Respuesta del operador inválida o incompleta (objeto vacío, sin eventos, nula, texto, lista)', '502 RESPUESTA_OPERADOR_INVALIDA en todos los casos')
        def _():
            casos = {'{}': {}, 'sin_data': {'data': {}}, 'sin_eventos': {'data': {'statusList': []}}, 'None': None, 'texto': 'ok', 'lista': []}
            rs = {k: con_resp(v) for k, v in casos.items()}
            return '; '.join(f'{k}→{r.status_code}' for k, r in rs.items()), all(r.status_code == 502 and cod(r) == 'RESPUESTA_OPERADOR_INVALIDA' for r in rs.values())

        @scen('D11', D, 'Eventos con datos corruptos (fecha inválida, estado nulo, descripción nula)', '502, o 200 sin datos corruptos hacia el comprador')
        def _():
            r = con_resp({'data': {'statusList': [{'date': 'no-es-fecha', 'status': None, 'description': None}]}})
            d = j(r).get('data', {})
            return f'{r.status_code}; {json.dumps(d.get("historial", [])[:1], ensure_ascii=False)[:110]}', r.status_code in (200, 502), 'Se registra el comportamiento'

        @scen('D12', D, 'Tiempo de espera real del operador (requests.Timeout)', '504 TIEMPO_ESPERA_AGOTADO')
        def _():
            with patch.object(ChilexpressAdapter, '_obtener_respuesta_seguimiento', side_effect=requests.exceptions.Timeout):
                r = get('chilexpress/CHILEX-ABC12345/')
            return f'{r.status_code}; {cod(r)}', r.status_code == 504 and cod(r) == 'TIEMPO_ESPERA_AGOTADO'

        @scen('D13', D, 'Operador caído: conexión rechazada (requests.ConnectionError)', '502 PROVEEDOR_NO_DISPONIBLE')
        def _():
            with patch.object(ChilexpressAdapter, '_obtener_respuesta_seguimiento', side_effect=requests.exceptions.ConnectionError):
                r = get('chilexpress/CHILEX-ABC12345/')
            return f'{r.status_code}; {cod(r)}', r.status_code == 502 and cod(r) == 'PROVEEDOR_NO_DISPONIBLE', 'El adaptador solo traduce los tiempos de espera; una conexión rechazada termina como error interno'

        @scen('D14', D, 'Operador caído en Starken (conexión rechazada)', '502 PROVEEDOR_NO_DISPONIBLE')
        def _():
            with patch.object(StarkenAdapter, '_obtener_respuesta_seguimiento', side_effect=requests.exceptions.ConnectionError):
                r = get('starken/STK-ABC12345/')
            return f'{r.status_code}; {cod(r)}', r.status_code == 502 and cod(r) == 'PROVEEDOR_NO_DISPONIBLE'

        @scen('D15', D, 'Código con caracteres especiales y HTML (<img src=x>)', 'Respuesta JSON controlada, sin 500')
        def _():
            r = get('chilexpress/CHILEX-%3Cimg%20src%3Dx%3E/')
            return f"{r.status_code}; tipo {r['Content-Type'].split(';')[0]}; {cod(r)}", r.status_code in (200, 400, 404) and 'json' in r['Content-Type']

        @scen('D20', D, 'Código con una barra codificada (%2F) que parte la ruta', '404 controlado sin 500')
        def _():
            r = get('chilexpress/CHILEX-AB%2FCD/')
            return f"{r.status_code}; tipo {r['Content-Type'].split(';')[0]}", r.status_code == 404, 'La respuesta 404 es la página HTML de Django, no el formato JSON de la API'

        @scen('D16', D, 'Código extremadamente largo (5.000 caracteres)', 'Rechazado o controlado, sin 500')
        def _():
            r = get('chilexpress/CHILEX-' + 'A' * 5000 + '/'); return f'{r.status_code}; {cod(r)}', r.status_code != 500, 'No hay límite de longitud del código'

        @scen('D17', D, 'Consulta de seguimiento sin sesión', 'Se registra si el endpoint es público')
        def _():
            r = APIClient().get(S + 'chilexpress/CHILEX-ABC12345/'); return f'{r.status_code}', r.status_code == 200, 'Endpoint público: cualquier persona con un código puede consultarlo'

        @scen('D18', D, 'Seguimiento: los datos del envío coinciden entre generar despacho y consultar', 'El código emitido por cada adaptador es aceptado al consultar')
        def _():
            res = []
            for ad, nombre in ((ChilexpressAdapter(), 'Chilexpress'), (StarkenAdapter(), 'Starken'), (StandardLogisticsAdapter(), 'Estándar')):
                guia = ad.generar_despacho('ORD-1', ORIGEN, dto_dir(), PAQ)
                det = ad.consultar_seguimiento(guia.numero_seguimiento)
                res.append((nombre, guia.numero_seguimiento[:16], guia.estado, det.numero_seguimiento == guia.numero_seguimiento and bool(guia.url_etiqueta)))
            return '; '.join(f'{n}: {c} {e} {"ok" if o else "falla"}' for n, c, e, o in res), all(o for *_, o in res)

        @scen('D19', D, 'Estado del operador traducido al estado estándar de la tienda', 'Todos los estados de los eventos tienen traducción')
        def _():
            d = j(get('chilexpress/CHILEX-ABC12345/'))['data']
            est = [(e['estado'], e['estado_estandar']) for e in d['historial']]
            return '; '.join(f'{a}→{b}' for a, b in est), all(b for _, b in est)

    # ================= E. CONTRATOS Y VALIDACIONES INTERNAS ============
    def test_E_contratos(self):
        E = 'E. Contratos y validaciones internas'

        @scen('E01', E, 'Tiempo de espera configurable: valores válidos (0,1; 10; 60)', 'Aceptados')
        def _():
            vals = [validar_tiempo_espera(v) for v in (0.1, 10, 60)]; return f'{vals}', vals == [0.1, 10.0, 60.0]

        @scen('E02', E, 'Tiempo de espera inválido (0, -1, 61, NaN, infinito, True, None, texto)', 'ValueError en todos')
        def _():
            malos = [0, -1, 61, float('nan'), float('inf'), True, None, 'abc']; fallas = []
            for v in malos:
                try:
                    validar_tiempo_espera(v); fallas.append(repr(v))
                except ValueError:
                    pass
            return f'aceptados indebidamente: {fallas or "ninguno"}', not fallas

        @scen('E03', E, 'Los adaptadores validan el tiempo de espera al crearse', 'ValueError con 0 y con 61')
        def _():
            r = []
            for ad in (ChilexpressAdapter, StarkenAdapter, StandardLogisticsAdapter):
                for v in (0, 61):
                    try:
                        ad(timeout_segundos=v); r.append('acepta')
                    except ValueError:
                        r.append('rechaza')
            return f'{r}', all(x == 'rechaza' for x in r)

        @scen('E04', E, 'Normalizador de Chilexpress ante respuestas inválidas (10 variantes)', 'ValueError en todas')
        def _():
            casos = [None, [], {}, {'data': None}, {'data': {}}, {'data': {'courierServiceOptions': []}},
                     {'data': {'courierServiceOptions': [{'serviceValue': 'abc'}]}}, {'data': {'courierServiceOptions': [{'serviceValue': True}]}},
                     {'data': {'courierServiceOptions': [{'serviceValue': float('nan')}]}}, {'data': {'courierServiceOptions': [{'serviceValue': -5}]}}]
            ok_idx = []
            for i, c in enumerate(casos):
                try:
                    procesar_respuesta_chilexpress(c); ok_idx.append(i)
                except (ValueError, TypeError):
                    pass
            return f'aceptadas indebidamente: {ok_idx or "ninguna"}', not ok_idx

        @scen('E05', E, 'Normalizador de Chilexpress con varios servicios', 'Elige el de menor valor')
        def _():
            r = procesar_respuesta_chilexpress({'data': {'courierServiceOptions': [{'serviceValue': 4500}, {'serviceValue': '3990'}, {'serviceValue': 'x'}]}})
            return f'{r}', r['monto'] == 3990

        @scen('E06', E, 'Normalizador de Starken ante respuestas inválidas (7 variantes)', 'ValueError en todas')
        def _():
            casos = [None, {}, {'valor': None}, {'valor': True}, {'valor': 'x'}, {'valor': -1}, {'valor': float('inf')}]
            ok_idx = []
            for i, c in enumerate(casos):
                try:
                    procesar_respuesta_starken(c); ok_idx.append(i)
                except (ValueError, TypeError):
                    pass
            return f'aceptadas indebidamente: {ok_idx or "ninguna"}', not ok_idx

        @scen('E07', E, 'Normalizador de Starken: plazo válido y plazo inválido', 'Plazo 2 y plazo nulo')
        def _():
            a = procesar_respuesta_starken({'valor': '6900', 'plazo_entrega': '2'}); b = procesar_respuesta_starken({'valor': 6900, 'plazo_entrega': 'pronto'})
            return f"{a['plazo_dias']} y {b['plazo_dias']}", a['plazo_dias'] == 2 and b['plazo_dias'] is None

        @scen('E08', E, 'Normalizador de seguimiento ante respuestas inválidas', 'Rechaza (ValueError, TypeError o KeyError) o devuelve vacío')
        def _():
            casos = [None, [], {}, 'texto', {'data': {}}, {'data': {'statusList': 'no'}}, {'data': {'statusList': [None]}}, {'data': {'statusList': [{}]}}]
            res = []
            for c in casos:
                try:
                    out = procesar_respuesta_seguimiento('Chilexpress', c); res.append('vacío' if not out else f'{len(out)} eventos')
                except (ValueError, TypeError, KeyError):
                    res.append('rechaza')
                except Exception as e:  # noqa: BLE001
                    res.append('ERROR ' + type(e).__name__)
            return f'{res}', not any(x.startswith('ERROR') for x in res)

        @scen('E09', E, 'Regla de envío gratis: límites exactos y valores inválidos', '30.000 cumple, 29.999,99 no; negativo, NaN y booleano lanzan ValueError')
        def _():
            f = ShippingDomainService.cumple_monto_minimo_envio_gratis
            a, b = f(Decimal('30000')), f(Decimal('29999.99')); err = []
            for v in (Decimal('-1'), Decimal('NaN'), True, None, 'abc'):
                try:
                    f(v); err.append(repr(v))
                except ValueError:
                    pass
            return f'30.000→{a}; 29.999,99→{b}; aceptados indebidamente: {err or "ninguno"}', a is True and b is False and not err

        @scen('E10', E, 'Tarifas por región de Chilexpress (RM, Valparaíso, Magallanes, región desconocida)', 'Tarifa base de cada región y tarifa por defecto en la desconocida')
        def _():
            ad = ChilexpressAdapter(); out = {}
            for reg_ in ('METROPOLITANA', 'VALPARAISO', 'MAGALLANES', 'MARTE'):
                cot = ad.cotizar_envio(ORIGEN, dto_dir(reg_), PAQ); out[reg_] = min(c.costo for c in cot)
            return f'{ {k: int(v) for k, v in out.items()} }', out['METROPOLITANA'] < out['MAGALLANES'] and out['MARTE'] > 0, 'Una región desconocida recibe una tarifa por defecto en lugar de rechazarse (el serializer la rechaza antes)'

        @scen('E11', E, 'Selección de adaptador según el código o el proveedor', 'CHILEX→Chilexpress, STK→Starken, TRK→Estándar, sin código→Chilexpress; un código desconocido no devuelve None')
        def _():
            nom = lambda x: type(x).__name__ if x is not None else 'None'
            r = {c: nom(get_logistics_adapter(c)) for c in ('CHILEX-1', 'STK-1', 'TRK-12345678', None, 'ABC12345', '12345678')}
            return f'{r}', r['CHILEX-1'] == 'ChilexpressAdapter' and r['STK-1'] == 'StarkenAdapter' and r['TRK-12345678'] == 'StandardLogisticsAdapter' and r['ABC12345'] != 'None', 'Un código sin prefijo reconocido se asigna a Chilexpress (adaptador por defecto)'


class CheckoutEnvioQA(TestCase):
    """F. Datos de envío dentro del pedido (checkout) con el catálogo simulado."""
    URL_Q = '/api/entregas/cotizacion/'
    URL_P = '/api/checkout/pedidos/'

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='qa-owner-f', is_staff=True)
        self.store = Tienda.objects.create(nombre='QA Pedido', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.data = delivery_defaults()
        for carrier, amount in (('chilexpress', 4500), ('starken', 6900)):
            self.data[carrier].update(enabled=True, tarifas=[
                {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': amount, 'plazo_dias': 2}])
        self.data['pickup'] = {'enabled': True, 'address': 'Local 123', 'schedule': '9 a 18'}
        self.config = ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.data)
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True, 'fields': {f: 'qa' for f in TRANSFER_PUBLIC_FIELDS}}})
        self.order = {
            'clave_checkout': str(uuid4()), 'items': [{'producto_id': 'product', 'sku': 'QA', 'cantidad': 1}],
            'contacto': {'nombre': 'Comprador', 'email': 'comprador@example.com'},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Chilexpress',
            'direccion': {'street': 'Calle', 'number': '123', 'apt': '1', 'city': 'Providencia', 'region': 'Metropolitana'},
        }
        patcher = patch('apps.core.presentation.checkout.ProductRepository'); self.repo_cls = patcher.start(); self.addCleanup(patcher.stop)
        self.repo = self.repo_cls.return_value
        self.repo.get_by_id.return_value = {'_id': 'product', 'nombre': 'Producto', 'activo': True, 'variantes': [{'sku': 'QA', 'precio': 60000, 'stock': 10}]}
        self.repo.decrease_stock.return_value = True

    @classmethod
    def tearDownClass(cls):
        volcar()
        super().tearDownClass()

    def token(self, operador='Chilexpress'):
        return j(self.api.post(self.URL_Q, {'operador': operador, 'region': 'Metropolitana', 'comuna': 'Providencia'}, format='json'))['data']['tarifas'][0]['cotizacion']

    def reset(self):
        """Cada escenario parte de una tienda y un pedido limpios."""
        Pedido.objects.all().delete()
        self.repo.decrease_stock.reset_mock()
        self.data = delivery_defaults()
        for carrier, amount in (('chilexpress', 4500), ('starken', 6900)):
            self.data[carrier].update(enabled=True, tarifas=[
                {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': amount, 'plazo_dias': 2}])
        self.data['pickup'] = {'enabled': True, 'address': 'Local 123', 'schedule': '9 a 18'}
        self.config.datos = self.data
        self.config.save()
        self.order['clave_checkout'] = str(uuid4())

    def submit(self, **ch):
        return self.api.post(self.URL_P, {**self.order, **ch}, format='json')

    def test_F_pedido_con_envio(self):
        F = 'F. Datos de envío en el pedido'

        @scen('F01', F, 'Pedido con despacho Chilexpress y cotización vigente', '201; costo de envío 4.500 y total 64.500; se guardan método, dirección y cotización')
        def _():
            self.reset()
            r = self.submit(cotizacion=self.token()); o = Pedido.objects.get()
            ok = (r.status_code == 201 and o.costo_envio == Decimal(4500) and o.monto_total == Decimal(64500) and o.entrega['metodo'] == 'Chilexpress'
                  and o.entrega['direccion'] == self.order['direccion'] and o.entrega['cotizacion']['monto'] == '4500')
            return f'{r.status_code}; envío {o.costo_envio}, total {o.monto_total}, método {o.entrega["metodo"]}, cotización guardada {o.entrega["cotizacion"]["monto"]}', ok

        @scen('F02', F, 'Pedido con Starken usa la tarifa de Starken', '201; costo de envío 6.900')
        def _():
            self.reset()
            r = self.submit(clave_checkout=str(uuid4()), metodo_entrega='Starken', cotizacion=self.token('Starken')); o = Pedido.objects.latest('pk')
            return f'{r.status_code}; envío {o.costo_envio}', r.status_code == 201 and o.costo_envio == 6900

        @scen('F03', F, 'Pedido con despacho sin cotización', '400 y sin reservar stock ni crear pedido')
        def _():
            self.reset()
            self.repo_cls.reset_mock(); r = self.submit()
            return f'{r.status_code}; {cod(r)}; pedidos creados {Pedido.objects.count()}; reservas {self.repo.decrease_stock.call_count}', r.status_code == 400 and not Pedido.objects.exists() and self.repo.decrease_stock.call_count == 0

        @scen('F04', F, 'Cotización vencida al pagar', '400 COTIZACION_VENCIDA o COTIZACION_INVALIDA, sin reservar stock')
        def _():
            self.reset()
            tok = self.token(); real = _t.time()
            with patch('time.time', return_value=real + 1000):
                r = self.submit(cotizacion=tok)
            return f'{r.status_code}; {cod(r)}; reservas {self.repo.decrease_stock.call_count}', r.status_code == 400 and cod(r) in ('COTIZACION_VENCIDA', 'COTIZACION_INVALIDA') and self.repo.decrease_stock.call_count == 0

        @scen('F05', F, 'Cotización manipulada', '400 COTIZACION_INVALIDA, sin reservar stock')
        def _():
            self.reset()
            tok = self.token(); r = self.submit(cotizacion=tok[:-3] + ('AAA' if not tok.endswith('AAA') else 'BBB'))
            return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'COTIZACION_INVALIDA' and self.repo.decrease_stock.call_count == 0

        @scen('F06', F, 'El comprador intenta fijar el costo de envío (costo_envio=1)', '400 sin pedido ni reserva')
        def _():
            self.reset()
            r = self.submit(cotizacion=self.token(), costo_envio=1)
            return f'{r.status_code}; pedidos {Pedido.objects.count()}; reservas {self.repo.decrease_stock.call_count}', r.status_code == 400 and not Pedido.objects.exists() and self.repo.decrease_stock.call_count == 0

        @scen('F07', F, 'La tienda cambia la tarifa entre cotizar y pagar', '400 COTIZACION_CAMBIO, sin reservar stock')
        def _():
            self.reset()
            tok = self.token(); self.data['chilexpress']['tarifas'][0]['monto'] = 9000; self.config.datos = self.data; self.config.save()
            r = self.submit(cotizacion=tok); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'COTIZACION_CAMBIO' and self.repo.decrease_stock.call_count == 0

        @scen('F08', F, 'Cotización de Chilexpress usada con método Starken', '400 COTIZACION_CAMBIO')
        def _():
            self.reset()
            r = self.submit(metodo_entrega='Starken', cotizacion=self.token('Chilexpress')); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and cod(r) == 'COTIZACION_CAMBIO'

        @scen('F09', F, 'Retiro en tienda sin dirección ni cotización', '201; envío 0 y datos del local guardados')
        def _():
            self.reset()
            orden = {k: v for k, v in self.order.items() if k != 'direccion'}; orden['metodo_entrega'] = 'Retiro'
            r = self.api.post(self.URL_P, orden, format='json'); o = Pedido.objects.get()
            return f'{r.status_code}; envío {o.costo_envio}; retiro {o.entrega.get("retiro")}', r.status_code == 201 and o.costo_envio == 0 and o.entrega['retiro']['address'] == 'Local 123'

        @scen('F10', F, 'Reintento con la misma clave: no duplica el pedido ni reserva dos veces', '200 con el mismo pedido y una sola reserva')
        def _():
            self.reset()
            tok = self.token(); a = self.submit(cotizacion=tok); b = self.submit(cotizacion=tok)
            return f'{a.status_code}→{b.status_code}; pedidos {Pedido.objects.count()}; reservas {self.repo.decrease_stock.call_count}', a.status_code == 201 and b.status_code == 200 and Pedido.objects.count() == 1 and self.repo.decrease_stock.call_count == 1

        @scen('F11', F, 'Dirección de despacho sin comuna', '400 sin pedido')
        def _():
            self.reset()
            dire = {k: v for k, v in self.order['direccion'].items() if k != 'city'}
            r = self.submit(cotizacion=self.token(), direccion=dire); return f'{r.status_code}; pedidos {Pedido.objects.count()}', r.status_code == 400 and not Pedido.objects.exists()

        @scen('F12', F, 'Comuna que no pertenece a la región indicada en la dirección', '400 sin pedido')
        def _():
            self.reset()
            dire = {**self.order['direccion'], 'city': 'Viña del Mar'}
            r = self.submit(cotizacion=self.token(), direccion=dire); return f'{r.status_code}; {cod(r)}', r.status_code == 400 and not Pedido.objects.exists()
