const assert = require('node:assert/strict'), { test } = require('node:test');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./source-loader.cjs');
const auth = { '../../../api': { API_BASE_URL: 'http://test' }, '../../auth/services/authService': { authService: { getToken: () => 'fixture-token' } } };
const order = { id_pedido: 1, identificador: 'SALE-1', nombre_contacto: 'QA', correo_contacto: 'qa@example.test', monto_total: '18500.50', estado: 'pagado', estado_etiqueta: 'Pagado', fecha_creacion: '2025-10-10T15:00:00Z', metodo_pago: 'Transferencia', pago_estado: 'confirmado', moneda: 'CLP', costo_envio: '1000.00', descuento: '2500.00', items: [{ id_item_pedido: 1, nombre_producto: 'Producto QA', sku: 'SKU-QA', cantidad: 2, precio_unitario: '10000.25', total_linea: '20000.50', descuento_linea: null, atributos: { Color: 'Azul' }, atributos_variante: [] }] };
const pagination = { pagina: 1, tamano: 20, total: 1, total_paginas: 1 };
const sales = { resumen: { cantidad_ventas: 1, total_vendido: '18500.50', ticket_promedio: '18500.50' }, importes: { bruto_productos: '20000.50', descuentos: '2500.00', neto_productos: '17500.50', envio: '1000.00', importe_confirmado: '18500.50', nota_fechas: 'Registro del pedido en Chile.', nota_descuentos: 'Descuento por pedido.', pedidos_sin_lineas: 0 }, productos: [{ nombre: 'Producto QA', sku: 'SKU-QA', cantidad: 2, bruto_lineas: '20000.50' }], agrupacion: 'mes', serie: [{ periodo: '2025-10', cantidad_ventas: 1, total_vendido: '18500.50' }], ventas: [order] };
function api(fetch, extra = {}, mocks = {}) { return load('src/features/admin/services/commercialService.ts', { ...auth, ...mocks }, { fetch, ...extra }); }
function reply(data) { return { ok: true, json: async () => ({ exito: true, data, paginacion: pagination }) }; }

test('parámetros de pantalla no se convierten en filtros privados ni limitan la exportación al detalle', () => {
  const service = api(); const source = new URLSearchParams('vista=historial&pedido=5&periodo=7&tienda_id=999&q=SKU&fecha_desde=2025-10-01&pagina=2');
  assert.equal(String(service.historyParams(source)), 'q=SKU&fecha_desde=2025-10-01&pagina=2');
});
test('listado paginado real conserva Token, filtros y cancelación', async () => {
  let request; const service = api(async (...args) => { request = args; return reply([order]); });
  const signal = new AbortController().signal;
  const result = await service.getOrderHistory(new URLSearchParams('q=SKU&pago=confirmado'), signal);
  assert.equal(result.paginacion.total, 1); assert.equal(result.data[0].items[0].sku, 'SKU-QA');
  assert.equal(request[1].headers.Authorization, 'Token fixture-token'); assert.equal(request[1].signal, signal); assert.equal(request[1].cache, 'no-store');
  assert(request[0].includes('q=SKU&pago=confirmado'));
});
test('respuestas inválidas o sin autorización no se aceptan como listas vacías', async () => {
  await assert.rejects(api(async () => reply([{ ...order, monto_total: 'NaN' }])).getOrderHistory(new URLSearchParams()), /no es válido/);
  await assert.rejects(api(async () => ({ ok: false, status: 403 })).getContacts(new URLSearchParams()), /propietario/);
  await assert.rejects(api(async () => ({ ok: false, status: 500, json: () => ({ secret: 'private' }) })).getOrderHistory(new URLSearchParams()), /consulta/);
  await assert.rejects(api(() => assert.fail('sin Token no debe consultar'), {}, { '../../auth/services/authService': { authService: { getToken: () => null } } }).getContacts(new URLSearchParams()), /sesión/);
});
test('ventas conservan desglose y contactos conservan consentimiento', async () => {
  assert.equal((await api(async () => reply(sales)).getSalesHistory(new URLSearchParams())).data.importes.descuentos, '2500.00');
  const contact = { email: 'qa@example.test', cantidad_pedidos: 10, ultimo_pedido: order.fecha_creacion, consentimiento: 'sin_registro', fecha_consentimiento: null };
  assert.equal((await api(async () => reply([contact])).getContacts(new URLSearchParams())).data[0].cantidad_pedidos, 10);
  await assert.rejects(api(async () => reply([{ ...contact, consentimiento: 'guess' }])).getContacts(new URLSearchParams()), /no es válida/);
});
test('descarga Excel comprueba formato, crea archivo y libera URL', async () => {
  let name, clicked = 0, revoked; const NativeURL = URL;
  class DownloadURL extends NativeURL { static createObjectURL() { return 'blob:qa'; } static revokeObjectURL(value) { revoked = value; } }
  const globals = { URL: DownloadURL, document: { createElement: () => ({ set download(value) { name = value; }, click() { clicked++; }, remove() {} }), body: { appendChild() {} } }, window: { setTimeout: fn => fn() } };
  const response = { ok: true, headers: new Headers({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="historico-ventas-202510.xlsx"' }), blob: async () => new Blob(['PK-test']) };
  await api(async () => response, globals).downloadCommercial('ventas/exportar/', new URLSearchParams(), 'ventas.xlsx');
  assert.equal(name, 'historico-ventas-202510.xlsx'); assert.equal(clicked, 1); assert.equal(revoked, 'blob:qa');
  await assert.rejects(api(async () => ({ ...response, headers: new Headers({ 'Content-Type': 'text/html' }) })).downloadCommercial('ventas/exportar/', new URLSearchParams(), 'ventas.xlsx'), /formato/);
});
function renderSales(view) {
  const component = load('src/features/admin/pages/Sales.tsx', { ...auth,
    'react-router-dom': { useSearchParams: () => [new URLSearchParams(`vista=${view}`), () => {}], Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
    '../hooks/useCommercialHistory': { useCommercialHistory: () => ({ data: sales, page: pagination, loading: false, error: '' }), useCommercialExport: () => ({ busy: false, error: '', message: '', download() {} }) },
  });
  return renderToStaticMarkup(React.createElement(component.default));
}
test('Ventas reúne resumen e historial en pestañas accesibles y conserva detalle', () => {
  const summary = renderSales('resumen'); assert(summary.includes('role="tablist"')); assert(summary.includes('Resumen de ventas')); assert(summary.includes('Historial de ventas'));
  assert(summary.includes('Ticket promedio')); assert(summary.includes('Productos más vendidos')); assert(summary.includes('$18.500,50 CLP'));
  const history = renderSales('historial'); assert(history.includes('Productos del pedido')); assert(history.includes('SKU-QA')); assert(history.includes('Descuento del pedido'));
  assert(history.includes('scope="col"')); assert(history.includes('Exportar Excel')); assert(history.includes('10/10/2025'));
  const navigation = load('src/features/admin/config/navigation.ts');
  assert.deepEqual(Array.from(navigation.menuItems.filter(r => r.path === '/emprendedor/ventas').map(r => r.label)), ['Ventas']);
  assert.equal(navigation.menuItems.filter(r => /hist[oó]ri/i.test(r.label)).length, 0);
});
