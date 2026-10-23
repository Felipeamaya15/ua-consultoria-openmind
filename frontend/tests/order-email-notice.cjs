// SCRUM-431: el propietario ve si el correo de despacho salió al cambiar el estado de un pedido.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative, mocks = {}, globals = {}) {
  const file = path.resolve(root, relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8').replaceAll('import.meta.env.VITE_API_URL', 'undefined'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const req = id => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    const p = path.resolve(path.dirname(file), id);
    return load(['.ts', '.tsx'].map(ext => p + ext).find(fs.existsSync) || path.join(p, 'index.ts'), mocks, globals);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: req, Error, ...globals });
  return module.exports;
}

// Cada módulo se carga en su propio contexto: se compara el contenido, no el prototipo.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
let passed = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(() => { console.log('OK ' + name); passed++; }); }

function servicio(respuesta, { token = 'abc' } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, options) => { llamadas.push({ url, options }); return respuesta; };
  const api = load('src/features/admin/services/recentOrdersService.ts', {
    '../../../api': { API_BASE_URL: 'http://api.test' }, '../../auth/services/authService': { authService: { getToken: () => token } },
  }, { fetch: fetchImpl });
  return { api, llamadas };
}
const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const exito = data => resp(200, { exito: true, mensaje: 'ok', data });
const pedido = extra => ({ id_pedido: 7, identificador: 'ORD-20261022-ABCD', estado: 'enviado', estado_etiqueta: 'Enviado', ...extra });
const motivo = async promesa => { try { await promesa; } catch (error) { return error.message; } return null; };

(async () => {
  const { describeShipmentEmail } = servicio(exito(pedido())).api;

  await test('cada resultado del correo se explica con una frase clara', async () => {
    const casos = [
      [{ enviado: true, codigo: 'enviado' }, 'Se envió el aviso de despacho al comprador por correo.', false],
      [{ enviado: false, codigo: 'ya_enviado' }, 'El aviso de despacho ya se había enviado antes a este comprador.', false],
      [{ enviado: false, codigo: 'envio_en_curso' }, 'El aviso de despacho se está enviando.', false],
      [{ enviado: false, codigo: 'plantilla_desactivada' }, 'No se envió correo: el correo "Pedido despachado" está desactivado.', false],
      [{ enviado: false, codigo: 'no_corresponde' }, '', false],
      [{ enviado: false, codigo: 'destinatario_invalido' }, 'No se pudo enviar el aviso: el pedido no tiene un correo válido del comprador.', true],
      [{ enviado: false, codigo: 'error_de_envio' }, 'No se pudo enviar el aviso de despacho al comprador. Revisa la configuración de correo.', true],
      [{ enviado: false, codigo: 'error_inesperado' }, 'No se pudo enviar el aviso de despacho al comprador. Revisa la configuración de correo.', true],
      [{ enviado: false, codigo: 'algo_nuevo' }, 'No se pudo enviar el aviso de despacho al comprador. Revisa la configuración de correo.', true],
    ];
    for (const [correo, texto, falla] of casos) same(describeShipmentEmail(correo), { text: texto, failed: falla }, correo.codigo);
  });

  await test('un cambio de estado sin correo no agrega ninguna frase', async () => {
    for (const nada of [null, undefined]) same(describeShipmentEmail(nada), { text: '', failed: false });
  });

  await test('solo un fallo real se muestra como error; lo demás es información', async () => {
    const fallos = ['destinatario_invalido', 'error_de_envio', 'error_inesperado', 'codigo_desconocido'];
    const informativos = ['enviado', 'ya_enviado', 'envio_en_curso', 'plantilla_desactivada', 'no_corresponde'];
    for (const codigo of fallos) assert.equal(describeShipmentEmail({ enviado: false, codigo }).failed, true, codigo);
    for (const codigo of informativos) assert.equal(describeShipmentEmail({ enviado: codigo === 'enviado', codigo }).failed, false, codigo);
  });

  await test('al cambiar el estado el servicio entrega el resultado del correo', async () => {
    const { api, llamadas } = servicio(exito(pedido({ correo: { enviado: true, codigo: 'enviado' } })));
    const actualizado = await api.updateOrderStatus(7, 'enviado');
    same(actualizado.correo, { enviado: true, codigo: 'enviado' });
    assert.equal(actualizado.estado, 'enviado');
    assert.equal(actualizado.estado_etiqueta, 'Enviado');
    assert.equal(llamadas[0].url, 'http://api.test/api/tienda/pedidos/7/estado/');
    assert.equal(llamadas[0].options.method, 'PATCH');
    same(JSON.parse(llamadas[0].options.body), { estado: 'enviado' });
  });

  await test('sin correo o con un resultado mal formado el servicio entrega null y no falla', async () => {
    for (const correo of [undefined, null, 'si', 5, [], {}, { enviado: 'si', codigo: 'enviado' }, { enviado: true }, { enviado: true, codigo: 7 }]) {
      const { api } = servicio(exito(pedido({ correo })));
      const actualizado = await api.updateOrderStatus(7, 'enviado');
      assert.equal(actualizado.correo, null, JSON.stringify(correo));
      assert.equal(actualizado.estado, 'enviado');
    }
  });

  await test('un campo extra del correo no afecta al resultado', async () => {
    const { api } = servicio(exito(pedido({ correo: { enviado: false, codigo: 'error_de_envio', detalle: 'interno' } })));
    same((await api.updateOrderStatus(7, 'enviado')).correo, { enviado: false, codigo: 'error_de_envio' });
  });

  await test('las validaciones de siempre se mantienen', async () => {
    const { api, llamadas } = servicio(exito(pedido()));
    assert.ok(await motivo(api.updateOrderStatus(7, 'inexistente')));
    assert.equal(llamadas.length, 0, 'un estado inválido no llega al servidor');
    const sinSesion = servicio(exito(pedido()), { token: null });
    assert.equal(await motivo(sinSesion.api.updateOrderStatus(7, 'enviado')), 'Inicia sesión como propietario para actualizar el estado.');
    const rechazo = servicio(resp(403, { exito: false, mensaje: 'Solo el propietario activo puede administrar esta tienda.' }));
    assert.equal(await motivo(rechazo.api.updateOrderStatus(7, 'enviado')), 'Solo el propietario activo puede administrar esta tienda.');
    const otroPedido = servicio(exito(pedido({ id_pedido: 99 })));
    assert.ok(await motivo(otroPedido.api.updateOrderStatus(7, 'enviado')), 'la respuesta de otro pedido se rechaza');
  });

  await test('la pantalla de pedidos usa el resultado del correo y conserva el texto de siempre', async () => {
    const codigo = fs.readFileSync(path.join(root, 'src/features/admin/pages/Orders.tsx'), 'utf8').replace(/\r/g, '');
    assert.ok(codigo.includes('describeShipmentEmail(updated.correo)'));
    assert.ok(codigo.includes("type: email.failed ? 'error' : 'success'"));
    assert.ok(codigo.includes('Estado logístico actualizado a: ${updated.estado_etiqueta}'), 'el texto base no cambia: una prueba visual lo busca');
  });

  await test('la pantalla de correos ya no afirma que no se envía ningún correo', async () => {
    const codigo = fs.readFileSync(path.join(root, 'src/features/admin/pages/Emails.tsx'), 'utf8').replace(/\r/g, '');
    assert.ok(!codigo.includes('Por ahora no se envían correos automáticos'));
    assert.ok(!codigo.includes('cuando se conecte el servicio de correo'));
    assert.ok(codigo.includes('«Pedido despachado» se envía automáticamente'));
  });

  console.log(`\n${passed} pruebas OK`);
})().catch(error => { console.error(error); process.exitCode = 1; });
