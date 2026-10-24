// Ejecuta TypeScript real. No credenciales ni escrituras externas.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./source-loader.cjs');
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const make = fetch => load('src/shared/services/apiRequest.ts', {}, { fetch });

test('devuelve únicamente datos confirmados; rechaza sobres y JSON inválidos', async () => {
  for (const body of [null, [], {}, { exito: true }, { exito: 'true', data: {} }]) {
    await assert.rejects(make(async () => response(200, body)).requestJson('/test'), /respuesta recibida no es válida/);
  }
  const api = make(async () => response(200, { exito: true, data: { id: 7 } }));
  assert.equal((await api.requestJson('/test')).id, 7);
  assert.equal(await make(async () => response(200, { exito: true, data: null })).requestJson('/delete'), null);
  await assert.rejects(make(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('secret'); } })).requestJson('/test'), /respuesta recibida no es válida/);
});

test('400 y 422 conservan validaciones seguras de Django y detail de DRF', async () => {
  for (const status of [400, 422]) {
    for (const body of [{ exito: false, error: { detalles: { nombre: ['Ingresa el nombre de tu tienda.'] } } }, { detail: 'Ingresa el nombre de tu tienda.' }]) {
      await assert.rejects(make(async () => response(status, body)).requestJson('/test'), error => error.status === status && error.message === 'Ingresa el nombre de tu tienda.');
    }
  }
  await assert.rejects(make(async () => response(400, { exito: false, error: { detalles: { current_password: ['La contraseña actual es incorrecta.'] } } })).requestJson('/profile'), /La contraseña actual es incorrecta/);
});

test('401/403/404/409/429 y 5xx tienen mensajes en español, incluso con HTML', async () => {
  const expectations = [[401, /sesión/], [403, /permiso/], [404, /recurso/], [409, /conflicto/], [429, /demasiadas/], ...[500, 502, 503, 504].map(s => [s, /servicio no está disponible/])];
  for (const [status, expected] of expectations) {
    const error = await make(async () => ({ status, ok: false, json: async () => { throw new SyntaxError('<html>private</html>'); } })).requestJson('/test').catch(e => e);
    assert.equal(error.status, status); assert.match(error.message, expected);
  }
});

test('no filtra secretos, rutas, trazas ni cuerpos externos a mensajes o consola', async () => {
  const logs = [];
  const secrets = ['api_key=abc', 'Bearer abc', 'access_token=abc', 'enc::abc', 'postgresql://user:pass@db', 'C:\\Users\\private\\settings.py', '/srv/private/settings.py', 'Traceback line 42', 'https://provider.test/?key=abc', 'eyJhbGciOiJIUzI1NiJ9.abc.def'];
  for (const secret of secrets) {
    const api = load('src/shared/services/apiRequest.ts', {}, { fetch: async () => response(400, { exito: false, mensaje: secret }), console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) } });
    await assert.rejects(api.requestJson('/test'), error => !error.message.includes(secret) && /Revisa los datos/.test(error.message));
  }
  const api = make(async () => response(422, { exito: false, error: { detalles: { api_key: ['abc'], provider_response: { private: 'abc' } } } }));
  await assert.rejects(api.requestJson('/test'), /Revisa los datos/);
  assert.equal(logs.length, 0);
});

test('errores de conexión se explican y ninguna escritura se reintenta', async () => {
  let calls = 0;
  const api = make(async () => { calls++; throw new TypeError('ECONNREFUSED private'); });
  await assert.rejects(api.requestJson('/payment', { method: 'POST' }), /conectar con el servidor/);
  assert.equal(calls, 1);
});

test('timeout de conexión y lectura conserva la incertidumbre de una escritura', async () => {
  for (const reading of [false, true]) {
    let calls = 0;
    const api = make(async (_, options) => {
      calls++;
      const hanging = () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
      return reading ? { ok: true, status: 200, json: hanging } : hanging();
    });
    await assert.rejects(api.requestJson('/write', { method: 'PUT' }, undefined, 15), /Comprueba si se guardó/);
    assert.equal(calls, 1);
  }
});

test('cancelaciones antes, durante y al leer son AbortError; no son errores de red', async () => {
  for (const stage of ['before', 'fetch', 'body']) {
    const controller = new AbortController(); let calls = 0;
    if (stage === 'before') controller.abort('motivo privado');
    const api = make(async (_, options) => {
      calls++;
      if (stage === 'fetch') { controller.abort(); throw options.signal.reason; }
      return { ok: true, status: 200, json: async () => { controller.abort(); throw options.signal.reason; } };
    });
    await assert.rejects(api.requestJson('/test', { signal: controller.signal }), error => api.isRequestCancelled(error) && !error.message.includes('privado'));
    assert.equal(calls, stage === 'before' ? 0 : 1);
  }
});

test('401 en una operación administrativa no elimina credenciales ni redirige', async () => {
  const api = make(async () => response(401, {}));
  await assert.rejects(api.requestJson('/admin'), /sesión/);
  // El módulo se ejecuta sin acceso a window ni a storage: estas acciones fallarían.
});
