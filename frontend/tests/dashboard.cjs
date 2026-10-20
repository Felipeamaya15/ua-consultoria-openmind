const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function load(relative, mocks = {}, globals = {}) {
  const file = path.resolve(root, relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const req = id => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    const p = path.resolve(path.dirname(file), id);
    return load(['.ts', '.tsx'].map(ext => p + ext).find(fs.existsSync) || path.join(p, 'index.ts'), mocks, globals);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: req, URLSearchParams, AbortController, Error, ...globals });
  return module.exports;
}
const data = { fecha_desde: '2026-10-08', fecha_hasta: '2026-10-14', zona_horaria: 'America/Santiago', moneda: 'CLP', total_ventas: '12000.00', total_pedidos: 2, por_despachar: 1,
  historico: [{ fecha: '2026-10-08', ventas: '0.00', pedidos: 1 }, { fecha: '2026-10-14', ventas: '12000.00', pedidos: 1 }] };
const ui = {
  'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
  '../../data/mockAdminData': { formatPrice: value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value) },
  '../ui': { Icon: () => React.createElement('span', {'aria-hidden': true}), Alert: ({ children }) => React.createElement('div', { role: 'alert' }, children), Button: ({ children, onClick }) => React.createElement('button', { onClick }, children) },
  '../../../api': { API_BASE_URL: 'http://api.test' }, '../../auth/services/authService': { authService: { getToken: () => 'abc' } },
};
let passed = 0;
async function test(name, fn) { await fn(); console.log('OK ' + name); passed++; }
const view = load('src/features/admin/components/dashboard/DashboardMetrics.tsx', ui);
const html = state => renderToStaticMarkup(React.createElement(view.DashboardMetrics, { state, onRetry() {} }));
const walk = (node, visit) => { if (Array.isArray(node)) return node.forEach(n => walk(n, visit)); if (node && typeof node === 'object') { visit(node); walk(node.props?.children, visit); } };
function service(fetchImpl, token = 'abc') {
  return load('src/features/admin/services/dashboardService.ts', {
    '../../../api': { API_BASE_URL: 'http://api.test' }, '../../auth/services/authService': { authService: { getToken: () => token } },
  }, { fetch: fetchImpl });
}
const response = (status, body) => ({ status, ok: status === 200, json: async () => body });
function harness(fetchImpl) {
  let params = new URLSearchParams();
  let index = 0, effectIndex = 0; const slots = [], effects = [];
  const api = load('src/features/admin/pages/Dashboard.tsx', {
    'react-router-dom': { useSearchParams: () => [params, next => { params = typeof next === 'function' ? next(params) : next; }] },
    react: {
      useState: initial => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
      useEffect: (fn, deps) => { const i = effectIndex++; effects[i] ??= {}; effects[i].next = { fn, deps }; },
    }, '../components/ui': { Select: () => null },
    '../components/dashboard/RecentOrders': { default: () => React.createElement('div', null, 'ORDENES-REALES') },
    '../components/dashboard/Reports': { default: () => null },
    '../components/dashboard/DashboardMetrics': view,
    '../services/dashboardService': { getDashboard: fetchImpl },
  });
  return {
    render() { index = effectIndex = 0; return api.default(); },
    sync() { for (const e of effects) { const { fn, deps } = e.next; if (!e.deps || deps.some((v, i) => v !== e.deps[i])) { e.clean?.(); e.deps = deps; e.clean = fn(); } } },
    unmount() { effects.forEach(e => e.clean?.()); },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const metrics = tree => tree.props.children[1];
const select = tree => tree.props.children[0].props.children[1].props.children;
(async () => {
  await test('metadatos analíticos válidos conservan porcentajes, estados y ticket; rechaza campos inválidos', async () => {
    const extra = { ...data, pedidos_pagados: 1, ticket_promedio: '12000.00',
      distribucion_estados: [{estado:'pagado',etiqueta:'Pagado',pedidos:1}],
      comparacion:{fecha_desde:'2026-10-01',fecha_hasta:'2026-10-07',total_ventas:'6000.00',total_pedidos:4,variacion_ventas:'100.00',variacion_pedidos:'-50.00'} };
    const reply = value => service(async()=>response(200,{exito:true,data:value})).getDashboard('7');
    assert.equal((await reply(extra)).comparacion.variacion_ventas,'100.00');
    const output=html({status:'ready',data:extra});
    for(const text of ['Ticket promedio','+100%','-50%','Pedidos por estado'])assert.ok(output.includes(text),text);
    for(const invalid of [{ticket_promedio:'NaN'},{pedidos_pagados:-1},{distribucion_estados:[{estado:'pagado',etiqueta:'Pagado',pedidos:-1}]},{comparacion:{...extra.comparacion,variacion_ventas:'Infinity'}}])
      await assert.rejects(reply({...extra,...invalid}),/inválidas/);
    assert.equal((await reply({...extra,ticket_promedio:null,comparacion:{...extra.comparacion,variacion_ventas:null}})).ticket_promedio,null);
  });
  await test('contrato, token, período y cancelación viajan al endpoint real', async () => {
    let call; const signal = new AbortController().signal;
    const api = service(async (...args) => { call = args; return response(200, { exito: true, data }); });
    assert.equal((await api.getDashboard('7', signal)).total_ventas, '12000.00');
    assert.equal(call[0], 'http://api.test/api/tienda/dashboard/?periodo=7');
    assert.equal(call[1].headers.Authorization, 'Token abc'); assert.equal(call[1].signal, signal);
    assert.ok(!call[0].includes('tienda_id'));
  });
  await test('sesión ausente no consulta y 401/403/500 se explican', async () => {
    await assert.rejects(service(() => { throw Error('no debe llamar'); }, null).getDashboard('30'), /Inicia sesión/);
    for (const [status, message] of [[401, /sesión venció/], [403, /propietario/], [500, /consultar/]]) {
      await assert.rejects(service(async () => response(status, {})).getDashboard('30'), message);
    }
  });
  await test('red, JSON inválido, respuesta malformada y abort son tratados', async () => {
    await assert.rejects(service(async () => { throw Error('network'); }).getDashboard('30'), /conectar/);
    await assert.rejects(service(async () => ({ ok: true, status: 200, json() { throw Error(); } })).getDashboard('30'), /consultar/);
    for (const bad of [{ ...data, total_ventas: 'NaN' }, { ...data, total_pedidos: -1 }, { ...data, historico: [{}] }]) {
      await assert.rejects(service(async () => response(200, { exito: true, data: bad })).getDashboard('30'), /inválidas/);
    }
    const abort = Object.assign(Error('abort'), { name: 'AbortError' });
    await assert.rejects(service(async () => { throw abort; }).getDashboard('30'), error => error === abort);
  });
  await test('carga, error, reintento y vacío no inventan ventas', () => {
    assert.ok(html({ status: 'loading' }).includes('role="status"'));
    assert.ok(!html({ status: 'loading' }).includes('$0'));
    let attempts = 0; const tree = view.DashboardMetrics({ state: { status: 'error', message: 'Error de conexión' }, onRetry: () => attempts++ });
    walk(tree, n => { if (n.props?.onClick) n.props.onClick(); }); assert.equal(attempts, 1);
    assert.ok(html({ status: 'error', message: 'Error de conexión' }).includes('role="alert"'));
    const empty = html({ status: 'ready', data: { ...data, total_pedidos: 0, total_ventas: '0.00', por_despachar: 0 } });
    assert.ok(empty.includes('$0') && empty.includes('No hay pedidos')); assert.ok(!empty.includes('<table'));
  });
  await test('la tabla diaria solo consulta al abrir el detalle', () => {
    const output = html({ status: 'ready', data });
    assert.ok(output.includes('$12.000') && output.includes('08/10/2026') && output.includes('sm:grid-cols-2'));
    assert.ok(output.includes('Ver tabla diaria de ventas y pedidos') && output.includes('Hora de Chile'));
    assert.equal((output.match(/<tr[ >]/g) || []).length, 0, 'sin abrir el detalle no se consulta ni se dibuja la tabla');
  });
  await test('tabla diaria: fechas, CLP, pedidos, estructura accesible y estados', () => {
    const table = load('src/features/admin/components/dashboard/DailyHistoryTable.tsx', ui);
    const view = state => renderToStaticMarkup(React.createElement(table.DailyHistoryView, { state, period: '7', onRetry() {} }));
    const rows = [{ fecha: '2026-10-08', ventas: '12000.00', pedidos: 2 }, { fecha: '2026-10-09', ventas: '0.00', pedidos: 0 }];
    const output = view({ status: 'ready', rows });
    assert.ok(output.includes('$12.000') && output.includes('08/10/2026') && output.includes('09/10/2026'));
    assert.equal((output.match(/<tr[ >]/g) || []).length, 3);
    assert.ok(output.includes('overflow-x-auto') && output.includes('scope="col"') && output.includes('tabindex="0"'));
    assert.ok(output.includes('href="/emprendedor/pedidos?fecha_desde=2026-10-08&amp;fecha_hasta=2026-10-08&amp;periodo=7"'));
    assert.ok(view({ status: 'loading' }).includes('role="status"'));
    assert.ok(view({ status: 'error', message: 'Falló' }).includes('role="alert"'));
    assert.ok(view({ status: 'ready', rows: [{ fecha: '2026-10-08', ventas: '0.00', pedidos: 0 }] }).includes('No hay pedidos en el período seleccionado.'));
  });
  await test('servicio diario: une ventas y pedidos  y completa los días en cero', async () => {
    const calls = [];
    const sales = { exito: true, data: { resumen: {}, serie: [{ periodo: '2026-10-08', cantidad_ventas: 1, total_vendido: '12000.00' }], ventas: [] }, paginacion: {} };
    const orders = { exito: true, data: [], serie: [{ periodo: '2026-10-08', cantidad_pedidos: 2 }, { periodo: '2026-10-10', cantidad_pedidos: 1 }], paginacion: {} };
    const svc = (salesStatus = 200, ordersStatus = 200) => load('src/features/admin/services/dailyHistoryService.ts', ui, { fetch: async (url, init) => {
      calls.push({ url: new URL(url), init });
      return new URL(url).pathname.includes('/ventas/') ? response(salesStatus, sales) : response(ordersStatus, orders);
    } });
    const rows = await svc().getDailyHistory('2026-10-08', '2026-10-10');
    assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
      { fecha: '2026-10-08', ventas: '12000.00', pedidos: 2 }, { fecha: '2026-10-09', ventas: '0.00', pedidos: 0 }, { fecha: '2026-10-10', ventas: '0.00', pedidos: 1 }]);
    assert.deepEqual(calls.map(call => call.url.pathname).sort(), ['/api/tienda/pedidos/historial/', '/api/tienda/ventas/historial/']);
    for (const call of calls) {
      assert.deepEqual([...call.url.searchParams], [['fecha_desde', '2026-10-08'], ['fecha_hasta', '2026-10-10'], ['agrupacion', 'dia'], ['pagina', '1'], ['tamano', '1']]);
      assert.equal(call.init.headers.Authorization, 'Token abc');
    }
    await assert.rejects(svc(403).getDailyHistory('2026-10-08', '2026-10-10'), /propietario/);
    await assert.rejects(svc(200, 401).getDailyHistory('2026-10-08', '2026-10-10'), /sesión venció/);
  });
  await test('cambia período sin recarga y descarta respuesta anterior', async () => {
    const calls = []; const c = harness((period, signal) => new Promise(resolve => calls.push({ period, signal, resolve })));
    let tree = c.render(); c.sync(); assert.equal(calls[0].period, '30');
    select(tree).props.onChange({ target: { value: '7' } }); tree = c.render(); c.sync();
    assert.equal(calls[0].signal.aborted, true); assert.equal(calls[1].period, '7');
    calls[1].resolve(data); await settle(); assert.equal(metrics(c.render()).props.state.data.total_ventas, '12000.00');
    calls[0].resolve({ ...data, total_ventas: '99999.00' }); await settle();
    assert.equal(metrics(c.render()).props.state.data.total_ventas, '12000.00');
    select(c.render()).props.onChange({ target: { value: 'year' } }); c.render(); c.sync();
    assert.equal(calls[2].period, 'year'); c.unmount(); assert.equal(calls[2].signal.aborted, true);
  });
  await test('error permite reintento y conserva últimas órdenes independientes', async () => {
    let calls = 0; const c = harness(async () => { if (++calls === 1) throw Error('Falló'); return data; });
    c.render(); c.sync(); await settle(); let tree = c.render();
    assert.equal(metrics(tree).props.state.status, 'error'); assert.equal(metrics(tree).props.state.message, 'Falló');
    assert.ok(renderToStaticMarkup(tree).includes('ORDENES-REALES'));
    metrics(tree).props.onRetry(); c.render(); c.sync(); await settle();
    assert.equal(metrics(c.render()).props.state.status, 'ready'); assert.equal(calls, 2);
  });
  console.log(`${passed} pruebas OK`);
})().catch(error => { console.error(error); process.exitCode = 1; });
