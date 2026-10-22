const { test } = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./source-loader.cjs');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const money = load('src/features/admin/services/reportFormatting.ts');
const dates = load('src/features/admin/services/businessTime.ts');
const pickup = load('src/features/storefront/services/pickupSchedule.ts');

test('CLP/USD explícitos, decimales exactos y sin alterar valores de API', () => {
  assert.equal(money.formatReportMoney('12500.00'), '$12.500 CLP');
  assert.equal(money.formatReportMoney('9999999999.99'), '$9.999.999.999,99 CLP');
  assert.equal(money.formatReportMoney('25.00', 'USD'), 'US$25,00 USD');
  assert.equal(money.formatReportMoney('25.05', 'USD'), 'US$25,05 USD');
  assert.equal(money.formatReportMoney('0.01'), '$0,01 CLP');
  assert.equal(money.formatReportMoney('NaN'), '—');
});

test('fechas calendario y timestamps en Chile conservan día, mes, año y límites de año/DST', () => {
  assert.equal(dates.formatBusinessDate('2026-10-21'), '21/10/2026');
  assert.equal(dates.formatBusinessDate('2026-02-30'), '');
  assert.equal(dates.formatBusinessDate('2027-01-01T02:59:00Z', true), '31/12/2026, 23:59');
  assert.equal(dates.formatBusinessDate('2026-07-01T03:30:00Z', true), '30/06/2026, 23:30');
  assert.equal(dates.formatBusinessDate('2026-10-01T03:30:00Z', true), '01/10/2026, 00:30');
});

test('retiro respeta días, límites exactos y minutos; hoy excluye la hora actual/pasada', () => {
  const config = { enabled: true, version: 2, hours: { mon: { enabled: true, start: '09:15', end: '18:10' } } };
  const now = new Date('2026-10-26T12:30:20Z');
  const times = pickup.pickupTimes(config, '2026-10-26', now);
  assert.equal(times[0], '09:31'); assert.equal(times.at(-1), '18:10');
  assert.ok(times.includes('10:07')); assert.ok(!times.includes('09:30'));
  for (const date of ['2026-10-19', '2026-10-27', '2026-02-30', '26/10/2026']) assert.equal(pickup.pickupTimes(config, date, now).length, 0);
  assert.equal(pickup.pickupTimes(config, '2026-11-02', now)[0], '09:15');
  assert.equal(pickup.pickupSelectionLabel({ fecha: '2026-11-02', hora: '10:07' }), '02/11/2026 a las 10:07 h · Hora de Chile');
  const dst = pickup.pickupTimes({ enabled: true, version: 2, hours: { sun: { enabled: true, start: '00:00', end: '02:00' } } }, '2026-09-06', new Date('2026-09-01T00:00:00Z'));
  assert.ok(!dst.includes('00:30')); assert.ok(dst.includes('01:30'));
});

test('selector accesible separa horas y minutos, limita opciones y conserva elección exacta', () => {
  const TimePicker = load('src/shared/components/TimePicker.tsx').default;
  const props = { id: 'qa', label: 'Hora de retiro', value: '10:07', times: ['09:59', '10:07', '10:08'], onChange: value => { selected = value; } };
  let selected;
  const html = renderToStaticMarkup(React.createElement(TimePicker, props));
  assert.ok(html.includes('Hora de retiro: hora') && html.includes('Hora de retiro: minutos') && html.includes('24 horas'));
  assert.ok(html.includes('aria-label="Hora de retiro: hora"'));
  assert.ok(html.includes('aria-label="Hora de retiro: minutos"'));
  assert.ok(/value="10"[^>]*selected/.test(html));
  assert.ok(/value="07"[^>]*selected/.test(html));
  assert.ok(!html.includes('value="11"'));
  assert.equal(selected, undefined, 'renderizar no modifica la hora');
});

const ok = data => ({ ok: true, status: 200, json: async () => ({ exito: true, data }) });
const api = fetch => load('src/shared/services/apiRequest.ts', {}, { fetch }).requestJson;
test('API: éxito real, errores HTTP y validación útil sin revelar detalles técnicos o secretos', async () => {
  assert.equal(await api(async () => ok('confirmado'))('http://qa.test'), 'confirmado');
  for (const [status, pattern] of [[400, /Ingresa un nombre/], [401, /sesión/], [403, /permiso/], [404, /encontró/], [500, /disponible/]]) {
    await assert.rejects(api(async () => ({ ok: false, status, json: async () => ({ exito: false, error: { detalles: { name: ['Ingresa un nombre'] } } }) }))('http://qa.test'), pattern);
  }
  for (const message of ['TypeError: invalid JSON payload', 'client_secret=fixture-private', 'mongodb://fixture-user:fixture-pass@local']) {
    await assert.rejects(api(async () => ({ ok: false, status: 400, json: async () => ({ exito: false, mensaje: message }) }))('http://qa.test'), error => !error.message.includes(message));
  }
});

test('API: red, JSON inválido, tiempo de espera y cancelación sin reintentar escrituras', async () => {
  await assert.rejects(api(async () => { throw TypeError('Failed to fetch'); })('http://qa.test'), /conectar/);
  await assert.rejects(api(async () => ({ ok: true, status: 200, json: async () => { throw SyntaxError('html'); } }))('http://qa.test'), /no es válida/);
  let calls = 0;
  const slow = api((url, options) => { calls++; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))); });
  await assert.rejects(slow('http://qa.test', { method: 'POST' }, 'fallback', 5), /tardó demasiado/);
  assert.equal(calls, 1);
  const controller = new AbortController(), promise = slow('http://qa.test', { signal: controller.signal });
  controller.abort(); await assert.rejects(promise, /aborted/);
});

test('servicio promociones rechaza listas y escrituras malformadas antes de confirmar éxito', async () => {
  const globals = { localStorage: { getItem: () => 'owner-fixture' }, sessionStorage: { getItem: () => null }, fetch: async () => ok({}) };
  const service = load('src/features/admin/services/promotionService.ts', { '../../../api': { API_BASE_URL: 'http://qa.test' } }, globals).promotionService;
  await assert.rejects(service.list(), /listado/);
  await assert.rejects(service.create({ name: 'QA', type: 'percentage', value: 10 }), /no es válida/);
});

test('caché excluye secretos, preserva identificadores públicos y no muta formulario original', () => {
  const { withoutPrivateCredentials } = load('src/shared/services/sensitiveConfiguration.ts');
  const original = { linkify: { fields: { idCuenta: 'cuenta-publica', clavePrivada: 'fixture-private' } }, paypal: { fields: { client_id: 'public-client', client_secret: 'fixture-secret' } },
    mercadopago: { fields: { public_key: 'public-key', access_token: 'fixture-token' } }, gaId: 'G-TEST', pixelId: '123456' };
  const safe = withoutPrivateCredentials(original);
  assert.ok(!JSON.stringify(safe).includes('fixture-'));
  assert.equal(safe.linkify.fields.idCuenta, 'cuenta-publica'); assert.equal(safe.paypal.fields.client_id, 'public-client');
  assert.equal(safe.mercadopago.fields.public_key, 'public-key'); assert.equal(safe.gaId, 'G-TEST');
  assert.equal(original.linkify.fields.clavePrivada, 'fixture-private');
});

test('pagos no confirma ni persiste antes de todas las respuestas y conserva formulario ante fallo', async () => {
  for (const fails of [false, true]) {
    const states = [], refs = [], effects = [], saves = [], calls = [];
    let cursor = 0, refCursor = 0, form = { linkify: { enabled: true, fields: { idCuenta: 'CUENTA-QA', clavePrivada: 'fixture-private',
      environment: 'sandbox', expirationHours: '48', returnUrl: 'https://qa.example.test/return', notificationEmail: 'qa@example.test' } }, transfer: { enabled: false, fields: {} } };
    const setForm = next => { form = next; }, jsx = (type, props) => ({ type, props });
    let release; const gate = new Promise(resolve => { release = resolve; });
    const fetch = async (url, options = {}) => {
      calls.push({ url, method: options.method });
      if (url.endsWith('/mi-tienda/')) return ok({ id_tienda: 1 });
      if (options.method !== 'GET') await gate;
      if (fails && options.method === 'POST' && url.includes('/paypal/')) return { ok: false, json: async () => ({ exito: false, mensaje: 'No se pudo guardar.' }) };
      return ok({ activo: false, configurado: false });
    };
    const page = load('src/features/admin/pages/Payments.tsx', {
      react: { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
        useRef(initial) { const i = refCursor++; return refs[i] ||= { current: initial }; }, useEffect(fn) { if (!effects.length) effects.push(fn); } },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      '../hooks/useAdminForm': { useAdminForm: () => ({ form, setForm, save: value => saves.push(value), saved: false }) },
      '../components/ui': Object.fromEntries(['AdminCard', 'Alert', 'Input', 'Toggle', 'Button', 'Icon', 'Select', 'Textarea'].map(name => [name, name])),
      '../components/PendingTransfers': { PendingTransfers: 'PendingTransfers' },
    }, { fetch, localStorage: { getItem: () => 'owner-fixture' }, sessionStorage: { getItem: () => null }, window: { location: { origin: 'http://qa.test' } } }).default;
    const render = () => { cursor = refCursor = 0; return page(); };
    render(); effects[0](); await new Promise(setImmediate); await new Promise(setImmediate);
    const submit = render().props.onSubmit;
    const first = submit({ preventDefault() {} }), duplicate = submit({ preventDefault() {} });
    assert.equal(saves.length, 0); release(); await Promise.all([first, duplicate]);
    assert.equal(calls.filter(call => call.method === 'POST' && call.url.includes('/paypal/')).length, 1);
    assert.equal(saves.length, fails ? 0 : 1);
    assert.equal(form.linkify.fields.clavePrivada, 'fixture-private');
    if (!fails) assert.ok(!JSON.stringify(saves).includes('fixture-private'));
  }
});
