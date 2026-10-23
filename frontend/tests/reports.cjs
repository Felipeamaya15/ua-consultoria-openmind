// Contratos de servicio, descarga real y render accesible de los agregados.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { test } = require('node:test'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const resolved = path.resolve(root, file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, require: id => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    return load(path.resolve(path.dirname(resolved), id) + '.ts', mocks, globals);
  }, ...globals });
  return module.exports;
}
const data = { tienda: 'Tienda prueba', anio: 2026, mes: null, anios_disponibles: [2026, 2024], fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31',
  moneda: 'CLP', zona_horaria: 'America/Santiago', total_ventas: '1200.00', total_pedidos: 2, pedidos_pagados: 1, ticket_promedio: '1200.00',
  meses: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, etiqueta: `Mes ${i + 1}`, ventas: i === 9 ? '1200.00' : '0.00', pedidos: i === 9 ? 2 : 0, pagados: i === 9 ? 1 : 0 })),
  distribucion_estados: [{ estado: 'pagado', etiqueta: 'Pagado', pedidos: 1 }, { estado: 'pendiente', etiqueta: 'Pendiente', pedidos: 1 }],
  mejores_meses: { ventas: [10], pedidos: [10] }, nota_fechas: 'Fecha de creación; estado actual del pedido.',
};
function service(fetch, token = 'test-token', globals = {}) {
  return load('src/features/admin/services/reportService.ts', {
    '../../../api': { API_BASE_URL: 'http://test' }, '../../auth/services/authService': { authService: { getToken: () => token } },
  }, { fetch, ...globals });
}
const response = body => ({ ok: true, status: 200, json: async () => body });
test('consulta propietario, filtros opcionales y cancelación; no envía tienda elegida por navegador', async () => {
  let request;
  const api = service(async (...args) => { request = args; return response({ exito: true, data }); });
  const signal = new AbortController().signal;
  assert.equal((await api.getReport(2024, 10, signal)).total_ventas, '1200.00');
  assert.equal(request[0], 'http://test/api/tienda/informes/?anio=2024&mes=10');
  assert.equal(request[1].headers.Authorization, 'Token test-token');
  assert.equal(request[1].cache, 'no-store'); assert.equal(request[1].signal, signal);
  await api.getReport(); assert.equal(request[0], 'http://test/api/tienda/informes/?');
});
test('ausencia de sesión y errores HTTP no se presentan como datos válidos', async () => {
  await assert.rejects(service(() => assert.fail('no debe consultar'), '').getReport(), /sesión/);
  for (const status of [401, 403, 500]) await assert.rejects(service(async () => ({ ok: false, status })).getReport());
  for (const body of [{ exito: false }, { exito: true, data: {} }, { exito: true, data: { ...data, meses: [] } }, { exito: true, data: { ...data, total_ventas: 'NaN' } }]) {
    await assert.rejects(service(async () => response(body)).getReport(), /válido/);
  }
});
test('descarga un blob PDF, asigna nombres anual/mensual y libera recursos', async () => {
  let clicked = false, removed = false, revoked, filename, requested;
  const api = service(async url => { requested = url; return { ok: true, headers: new Headers({ 'Content-Type': 'application/pdf' }), blob: async () => new Blob(['%PDF-test']) }; }, 'test-token', {
    URL: { createObjectURL: () => 'blob:pdf', revokeObjectURL: url => { revoked = url; } },
    document: { createElement: () => ({ set download(value) { filename = value; }, click() { clicked = true; }, remove() { removed = true; } }), body: { appendChild() {} } },
    window: { setTimeout: fn => fn() },
  });
  await api.downloadReport(2026, 10);
  assert.equal(requested, 'http://test/api/tienda/informes/pdf/?anio=2026&mes=10');
  assert.equal(filename, 'informe-ventas-pedidos-2026-10.pdf');
  assert(clicked && removed); assert.equal(revoked, 'blob:pdf');
  assert.equal(api.reportFilename(2024, null), 'informe-ventas-pedidos-2024.pdf');
  await assert.rejects(service(async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'text/html' }) })).downloadReport(2026, null), /PDF/);
});
test('tabla mensual completa, totales, empates y cero accesibles sin pedidos individuales', () => {
  const component = load('src/features/admin/components/dashboard/Reports.tsx', {
    '../ui': { AdminCard: ({ children }) => React.createElement('section', null, children), Alert: ({ children }) => React.createElement('p', null, children) },
    '../../data/mockAdminData': { formatPrice: n => `$${n}` }, '../../services/reportService': {},
    '../../hooks/useCommercialHistory': {}, '../../../../shared/components/states': {},
  });
  const html = renderToStaticMarkup(React.createElement(component.ReportResults, { data }));
  assert(html.includes('Evolución mensual')); assert(html.includes('scope="col"'));
  assert.equal((html.match(/scope="row"/g) || []).length, 13);
  assert(html.includes('Octubre')); assert(html.includes('$1.200')); assert(html.includes('documento tributario oficial'));
  const empty = { ...data, total_ventas: '0.00', total_pedidos: 0, pedidos_pagados: 0, ticket_promedio: null, mejores_meses: { ventas: [], pedidos: [] }, meses: data.meses.map(r => ({ ...r, ventas: '0.00', pedidos: 0, pagados: 0 })) };
  const zero = renderToStaticMarkup(React.createElement(component.ReportResults, { data: empty }));
  assert(zero.includes('No hay pedidos')); assert(zero.includes('Sin actividad')); assert(!zero.includes('NaN'));
});
test('información del negocio persiste con Token, solo sus campos y evento de actualización', async () => {
  let request, event;
  const api = load('src/features/storefront/services/storeInformationService.ts', {
    '../../../api': { API_BASE_URL: 'http://test' }, '../../auth/services/authService': { authService: { getToken: () => 'owner' } },
  }, { fetch: async (...args) => { request = args; return response({ exito: true, data: { nombre: 'Real', descripcion: 'Negocio' } }); }, window: { dispatchEvent: e => { event = e.type; } }, Event });
  await api.saveStoreInformation({ nombre: 'Real', descripcion: 'Negocio' });
  assert.equal(request[0], 'http://test/api/tienda/configuracion/');
  assert.equal(request[1].method, 'PUT'); assert.equal(request[1].headers.Authorization, 'Token owner');
  assert.deepEqual(JSON.parse(request[1].body), { nombre: 'Real', descripcion: 'Negocio' });
  assert.equal(event, api.STORE_INFORMATION_CHANGED);
});
test('CLP conserva los centavos del backend incluso en importes mayores que Number.MAX_SAFE_INTEGER', () => {
  const { formatReportMoney } = load('src/features/admin/services/reportFormatting.ts');
  assert.equal(formatReportMoney('12345678.50'), '$12.345.678,50 CLP');
  assert.equal(formatReportMoney('0.10'), '$0,10 CLP');
  assert.equal(formatReportMoney('9007199254740993.25'), '$9.007.199.254.740.993,25 CLP');
});
