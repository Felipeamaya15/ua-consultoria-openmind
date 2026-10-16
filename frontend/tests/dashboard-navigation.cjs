// Contrato de navegación y filtrado real del listado autorizado.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { test } = require('node:test'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const resolved = path.resolve(root, file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, require: name => load(path.resolve(path.dirname(resolved), name) + '.ts') });
  return module.exports;
}
const api = load('src/features/admin/services/orderNavigation.ts');
const states = ['pendiente', 'pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado', 'cancelado'];
const orders = states.map((estado, i) => ({ id: i + 1, estado, fecha_creacion: '2026-10-14T12:00:00Z' }));
const filter = query => api.readOrderFilters(new URLSearchParams(query));
const ids = rows => Array.from(rows, row => row.id);

test('cada tarjeta transmite fechas exactas y período; ventas solo estados confirmados', () => {
  for (const period of ['7', '30', 'year']) {
    const url = new URL(api.ordersDestination('2026-10-08', '2026-10-14', 'confirmed', period), 'http://test');
    assert.equal(url.pathname, '/emprendedor/pedidos');
    assert.equal(url.searchParams.get('periodo'), period);
    assert.equal(url.searchParams.get('fecha_desde'), '2026-10-08');
    assert.deepEqual(ids(api.filterStoreOrders(orders, api.readOrderFilters(url.searchParams))), [2, 3, 4, 5, 6, 7]);
  }
});

test('órdenes cuenta todos y por despachar coincide con los cuatro estados del backend', () => {
  assert.deepEqual(ids(api.filterStoreOrders(orders, filter(''))), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(ids(api.filterStoreOrders(orders, filter('estado=dispatch'))), [1, 2, 3, 4]);
  for (const [index, estado] of states.entries()) assert.deepEqual(ids(api.filterStoreOrders(orders, filter(`estado=${estado}`))), [index + 1]);
  const backend = fs.readFileSync(path.join(root, '../backend/apps/core/infrastructure/dashboard.py'), 'utf8');
  assert.ok(backend.includes("('pendiente', 'pagado', 'preparando', 'en_origen')"));
  const model = fs.readFileSync(path.join(root, '../backend/apps/core/models.py'), 'utf8');
  assert.ok(model.includes("ESTADOS_PAGADOS = ('pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado')"));
});

test('fechas inclusivas interpretadas en Chile, sin depender de zona del navegador', () => {
  const list = [
    { id: 1, estado: 'pagado', fecha_creacion: '2026-10-08T02:59:59Z' },
    { id: 2, estado: 'pagado', fecha_creacion: '2026-10-08T03:00:00Z' },
    { id: 3, estado: 'pagado', fecha_creacion: '2026-10-15T02:59:59Z' },
    { id: 4, estado: 'pagado', fecha_creacion: '2026-10-15T03:00:00Z' },
  ];
  assert.deepEqual(ids(api.filterStoreOrders(list, filter('fecha_desde=2026-10-08&fecha_hasta=2026-10-14'))), [2, 3]);
  assert.equal(api.orderDateInChile('2026-09-06T03:30:00Z'), '2026-09-05');
  assert.equal(api.orderDateInChile('2026-09-06T04:30:00Z'), '2026-09-06');
});

test('histórico de un día y detalle emplean la página existente', () => {
  const url = new URL(api.ordersDestination('2026-10-14', '2026-10-14'), 'http://test');
  assert.equal(url.searchParams.get('fecha_desde'), url.searchParams.get('fecha_hasta'));
  assert.equal(api.orderDetailDestination(123), '/emprendedor/pedidos?pedido=123');
  assert.equal(filter('pedido=123').selectedId, 123);
  assert.equal(filter('pedido=9007199254740992').error, 'El identificador del pedido no es válido.');
});

test('rangos inválidos no amplían la consulta; fechas, estado e identificador se validan', () => {
  for (const query of ['fecha_desde=2026-02-30', 'fecha_desde=2026-10-15&fecha_hasta=2026-10-14',
    'estado=paid', 'fecha_hasta=invalid', 'pedido=-1', 'pedido=abc', 'estado=all&estado=confirmed']) {
    const filters = filter(query); assert.ok(filters.error, query); assert.deepEqual(ids(api.filterStoreOrders(orders, filters)), []);
  }
  assert.equal(api.validOrderDate('2024-02-29'), true); assert.equal(api.validOrderDate('2026-02-29'), false);
});
