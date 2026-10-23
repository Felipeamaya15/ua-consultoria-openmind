// SCRUM-371 y SCRUM-376: últimas órdenes registradas en el dashboard del emprendedor.
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
  vm.runInNewContext(code, { module, exports: module.exports, require: req, URLSearchParams, ...globals });
  return module.exports;
}

// Cada módulo se carga en su propio contexto: se compara el contenido, no el prototipo.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
let passed = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(() => { console.log('OK ' + name); passed++; }); }

const orden = (n, extra = {}) => ({ id_pedido: n, identificador: `ORD-20261013-A${n}BC`, nombre_contacto: `Cliente ${n}`, estado: 'pendiente', estado_etiqueta: 'Pendiente', monto_total: `${1000 + n}.00`, fecha_creacion: new Date(2026, 9, 13, 15, 5).toISOString(), ...extra });
const ESTADOS = ['pendiente', 'pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado', 'cancelado'];

// ------------------------------------------------------------------ servicio
function servicio(opciones = {}) {
  const { fetchImpl } = opciones;
  const token = 'token' in opciones ? opciones.token : 'abc';
  const llamadas = [];
  const globals = { fetch: (...args) => { llamadas.push(args); return fetchImpl(...args); } };
  const mocks = { '../../../api': { API_BASE_URL: 'http://api.test' }, '../../auth/services/authService': { authService: { getToken: () => token } } };
  return { api: load('src/features/admin/services/recentOrdersService.ts', mocks, globals), llamadas };
}
const respuesta = (status, body, { json = true } = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (!json) throw new SyntaxError('no es JSON'); return body; } });
const exito = data => respuesta(200, { exito: true, mensaje: 'ok', data });
const mensajeDe = async promesa => { try { await promesa; } catch (error) { return error.message; } return null; };

async function pruebasDelServicio() {
  await test('actualiza estado con Token y PATCH; utiliza la respuesta validada del servidor', async () => {
    const {api,llamadas} = servicio({fetchImpl: async () => exito({id_pedido:3,estado:'en_origen',estado_etiqueta:'En origen'})});
    const updated = await api.updateOrderStatus(3, ' EN_ORIGEN ');
    assert.equal(updated.estado, 'en_origen');
    assert.equal(llamadas[0][0], 'http://api.test/api/tienda/pedidos/3/estado/');
    assert.equal(llamadas[0][1].method, 'PATCH');
    assert.equal(llamadas[0][1].headers.Authorization, 'Token abc');
    same(JSON.parse(llamadas[0][1].body), {estado:'en_origen'});
  });
  await test('estado inválido o sesión ausente no envían; errores y respuestas inconsistentes no actualizan', async () => {
    const guest = servicio({token:null,fetchImpl:async()=>{throw Error('No enviar');}});
    assert.ok((await mensajeDe(guest.api.updateOrderStatus(3,'pagado'))).includes('Inicia sesión'));
    assert.equal(guest.llamadas.length,0);
    const invalid = servicio({fetchImpl:async()=>{throw Error('No enviar');}});
    assert.ok((await mensajeDe(invalid.api.updateOrderStatus(3,'inventado'))).includes('no es válido'));
    assert.equal(invalid.llamadas.length,0);
    const rejected = servicio({fetchImpl:async()=>respuesta(409,{exito:false,mensaje:'Transición rechazada por servidor'})});
    assert.equal(await mensajeDe(rejected.api.updateOrderStatus(3,'cancelado')),'Transición rechazada por servidor');
    for(const data of [null,{id_pedido:4,estado:'pagado',estado_etiqueta:'Pagado'},{id_pedido:3,estado:'inventado',estado_etiqueta:'Otro'}]) {
      const bad = servicio({fetchImpl:async()=>exito(data)});
      assert.ok((await mensajeDe(bad.api.updateOrderStatus(3,'pagado'))).includes('inválida'));
    }
  });
  await test('consulta las últimas órdenes con la sesión del propietario', async () => {
    const { api, llamadas } = servicio({ fetchImpl: async () => exito([orden(1), orden(2)]) });
    const lista = await api.getRecentOrders();
    same(lista.map(item => item.id_pedido), [1, 2]);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0][0], 'http://api.test/api/tienda/pedidos/ultimos/?limite=5');
    assert.equal(llamadas[0][1].headers.Authorization, 'Token abc');
    const controlador = new AbortController();
    await api.getRecentOrders(3, controlador.signal);
    assert.equal(llamadas[1][0], 'http://api.test/api/tienda/pedidos/ultimos/?limite=3');
    assert.equal(llamadas[1][1].signal, controlador.signal);
  });

  await test('un límite fuera de rango vuelve al valor por defecto', async () => {
    const { api, llamadas } = servicio({ fetchImpl: async () => exito([]) });
    for (const malo of [0, 21, -1, 2.5, NaN, Infinity, '5', null, undefined === 0]) await api.getRecentOrders(malo);
    for (const [url] of llamadas) assert.ok(url.endsWith('?limite=5'), url);
    await api.getRecentOrders(20);
    assert.ok(llamadas.at(-1)[0].endsWith('?limite=20'));
  });

  await test('sin sesión no consulta y pide iniciar sesión', async () => {
    for (const token of [null, '', undefined]) {
      const { api, llamadas } = servicio({ token, fetchImpl: async () => exito([]) });
      assert.equal(await mensajeDe(api.getRecentOrders()), 'Inicia sesión como propietario para consultar las últimas órdenes.');
      assert.equal(llamadas.length, 0);
    }
  });

  await test('un fallo de red se explica sin textos técnicos', async () => {
    const { api } = servicio({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    const mensaje = await mensajeDe(api.getRecentOrders());
    assert.equal(mensaje, 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.');
    assert.ok(!/fetch|TypeError/i.test(mensaje));
  });

  await test('una consulta cancelada se propaga tal cual para que la pantalla la ignore', async () => {
    const cancelacion = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const { api } = servicio({ fetchImpl: async () => { throw cancelacion; } });
    let capturado = null;
    try { await api.getRecentOrders(); } catch (error) { capturado = error; }
    assert.equal(capturado.name, 'AbortError');
  });

  await test('cada error del servidor tiene un mensaje claro', async () => {
    const casos = [
      [respuesta(401, { detail: 'Token inválido.' }), 'Tu sesión venció. Vuelve a iniciar sesión.'],
      [respuesta(403, { detail: 'Solo el propietario activo puede administrar esta tienda.' }), 'Solo el propietario de la tienda puede ver las últimas órdenes.'],
      [respuesta(400, { exito: false, mensaje: 'El límite debe ser un número entero entre 1 y 20.', error: {} }), 'El límite debe ser un número entero entre 1 y 20.'],
      [respuesta(500, null, { json: false }), 'No se pudieron consultar las últimas órdenes.'],
      [respuesta(502, '<html>Bad gateway</html>'), 'No se pudieron consultar las últimas órdenes.'],
      [respuesta(200, { exito: false, mensaje: '' }), 'No se pudieron consultar las últimas órdenes.'],
      [respuesta(200, null, { json: false }), 'No se pudieron consultar las últimas órdenes.'],
    ];
    for (const [respuestaDelServidor, esperado] of casos) {
      const { api } = servicio({ fetchImpl: async () => respuestaDelServidor });
      assert.equal(await mensajeDe(api.getRecentOrders()), esperado);
    }
  });

  await test('una respuesta con otro formato se rechaza', async () => {
    const invalidas = [{ id_pedido: 1 }, orden(1, { id_pedido: '1' }), orden(1, { id_pedido: 1.5 }), orden(1, { identificador: 7 }), orden(1, { nombre_contacto: null }),
      orden(1, { estado: undefined }), orden(1, { estado_etiqueta: 3 }), orden(1, { monto_total: 'abc' }), orden(1, { monto_total: '' }), orden(1, { monto_total: 1000 }),
      orden(1, { fecha_creacion: 'ayer' }), orden(1, { fecha_creacion: null }), null, 'texto'];
    for (const mala of invalidas) {
      const { api } = servicio({ fetchImpl: async () => exito([orden(2), mala]) });
      assert.equal(await mensajeDe(api.getRecentOrders()), 'El listado de últimas órdenes recibido es inválido.', JSON.stringify(mala));
    }
    for (const data of [null, {}, 'x', 5]) {
      const { api } = servicio({ fetchImpl: async () => exito(data) });
      assert.equal(await mensajeDe(api.getRecentOrders()), 'El listado de últimas órdenes recibido es inválido.', JSON.stringify(data));
    }
  });

  await test('acepta una orden sin identificador y datos extra del servidor', async () => {
    const { api } = servicio({ fetchImpl: async () => exito([orden(1, { identificador: null, extra: 'x' })]) });
    const lista = await api.getRecentOrders();
    assert.equal(lista[0].identificador, null);
  });
}

// ------------------------------------------------------------------ estados y fechas
const estados = load('src/features/admin/data/orderStatus.ts');
const fechas = load('src/features/admin/services/recentOrdersService.ts', { '../../../api': { API_BASE_URL: '' }, '../../auth/services/authService': { authService: { getToken: () => null } } });

async function pruebasDeEstadosYFechas() {
  await test('cada estado del pedido tiene su etiqueta y su color', async () => {
    const esperado = { pendiente: ['Pendiente', 'warning'], pagado: ['Pagado', 'info'], preparando: ['En preparación', 'info'], en_origen: ['En origen', 'info'],
      enviado: ['En tránsito', 'info'], en_reparto: ['En reparto', 'info'], entregado: ['Entregado', 'success'], cancelado: ['Cancelado', 'error'] };
    same(Object.keys(estados.ORDER_STATUS_BADGE), ESTADOS);
    for (const estado of ESTADOS) same(estados.orderStatusBadge(estado), { label: esperado[estado][0], variant: esperado[estado][1] }, estado);
  });

  await test('un estado desconocido usa la etiqueta del servidor y nunca rompe la pantalla', async () => {
    same(estados.orderStatusBadge('devuelto', 'Devuelto'), { label: 'Devuelto', variant: 'default' });
    same(estados.orderStatusBadge('devuelto'), { label: 'Estado desconocido', variant: 'default' });
    same(estados.orderStatusBadge('devuelto', '   '), { label: 'Estado desconocido', variant: 'default' });
    for (const raro of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '']) same(estados.orderStatusBadge(raro), { label: 'Estado desconocido', variant: 'default' }, raro);
  });

  await test('la fecha se muestra en español con hora de Santiago independiente del navegador', async () => {
    assert.equal(fechas.formatRecentOrderDate('2026-10-13T18:05:00Z'), '13/10/2026, 15:05');
    assert.equal(fechas.formatRecentOrderDate('2026-01-02T12:00:00Z'), '02/01/2026, 09:00');
    assert.equal(fechas.formatRecentOrderDate('2027-01-01T02:59:00Z'), '31/12/2026, 23:59');
    for (const mala of ['', 'ayer', 'no es fecha']) assert.equal(fechas.formatRecentOrderDate(mala), '', mala);
  });
}

// ------------------------------------------------------------------ vista y componente
const uiMocks = {
  'react-router-dom': { useSearchParams: () => [new URLSearchParams(), () => {}], Link: ({ to, children }) => React.createElement('a', { href: to }, children) },
  '../ui': {
    Alert: ({ variant, children }) => React.createElement('div', { 'data-alert': variant }, children),
    Badge: ({ variant, children }) => React.createElement('span', { 'data-badge': variant }, children),
    Button: ({ children, onClick }) => React.createElement('button', { onClick }, children),
  },
  '../../data/mockAdminData': { formatPrice: valor => `$${valor}` },
  '../../../api': { API_BASE_URL: 'http://api.test' },
  '../../auth/services/authService': { authService: { getToken: () => 'abc' } },
};
const componente = load('src/features/admin/components/dashboard/RecentOrders.tsx', uiMocks);
const html = (state, onRetry = () => {}) => renderToStaticMarkup(React.createElement(componente.RecentOrdersView, { state, onRetry }));
const walk = (node, visit) => { if (Array.isArray(node)) return node.forEach(item => walk(item, visit)); if (node && typeof node === 'object') { visit(node); walk(node.props && node.props.children, visit); } };
const find = (tree, predicate) => { const found = []; walk(tree, node => predicate(node) && found.push(node)); return found; };

async function pruebasDeLaVista() {
  await test('la tabla muestra las órdenes con su estado, total y fecha, sin pedir nada más', async () => {
    const lista = ESTADOS.slice(0, 5).map((estado, i) => orden(i + 1, { estado, estado_etiqueta: estado }));
    const salida = html({ status: 'ready', orders: lista });
    assert.ok(salida.includes('Últimos Pedidos') && salida.includes('Las 5 órdenes más recientes de tu tienda'));
    assert.ok(salida.includes('href="/emprendedor/pedidos"') && salida.includes('Ver todos'));
    for (const encabezado of ['Orden', 'Cliente', 'Fecha', 'Estado', 'Total']) assert.ok(salida.includes(`>${encabezado}</th>`), encabezado);
    assert.equal((salida.split('<tbody')[1].match(/<tr /g) || []).length, 5, 'una fila por orden');
    for (const [i, etiqueta] of ['Pendiente', 'Pagado', 'En preparación', 'En origen', 'En tránsito'].entries()) {
      assert.ok(salida.includes(`ORD-20261013-A${i + 1}BC`) && salida.includes(`Cliente ${i + 1}`) && salida.includes(`>${etiqueta}</span>`), etiqueta);
      assert.ok(salida.includes(`$${(1001 + i).toLocaleString('es-CL')} CLP`), 'total y moneda explícita');
    }
    assert.ok(salida.includes('13/10/2026, 15:05'));
    assert.ok(salida.indexOf('ORD-20261013-A1BC') < salida.indexOf('ORD-20261013-A5BC'), 'conserva el orden recibido');
    assert.ok(!salida.includes('Cargando') && !salida.includes('Reintentar') && !salida.includes('Aún no hay'));
  });

  await test('los casos especiales de una orden no rompen la fila', async () => {
    const salida = html({ status: 'ready', orders: [
      orden(7, { identificador: null }), orden(8, { nombre_contacto: '' }),
      orden(9, { estado: 'devuelto', estado_etiqueta: 'Devuelto' }), orden(10, { nombre_contacto: '<img src=x onerror=alert(1)>' })] });
    assert.ok(salida.includes('#7') && salida.includes('Sin nombre') && salida.includes('data-badge="default">Devuelto'));
    assert.ok(!salida.includes('<img') && salida.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  await test('mientras carga solo se ve el aviso de carga', async () => {
    const salida = html({ status: 'loading' });
    assert.ok(salida.includes('role="status"') && salida.includes('Cargando las últimas órdenes…'));
    assert.ok(!salida.includes('<table') && !salida.includes('Reintentar') && !salida.includes('Aún no hay'));
    assert.ok(salida.includes('Últimos Pedidos'), 'el título y el enlace siguen visibles');
  });

  await test('si no hay órdenes se dice, sin mostrar una tabla vacía', async () => {
    const salida = html({ status: 'ready', orders: [] });
    assert.ok(salida.includes('Aún no hay órdenes registradas en tu tienda.'));
    assert.ok(!salida.includes('<table') && !salida.includes('Cargando') && !salida.includes('Reintentar'));
  });

  await test('si falla se explica el motivo y se puede reintentar', async () => {
    let reintentos = 0;
    const estado = { status: 'error', message: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.' };
    const salida = html(estado, () => reintentos++);
    assert.ok(salida.includes('role="alert"') && salida.includes(estado.message) && salida.includes('Reintentar'));
    assert.ok(!salida.includes('<table') && !salida.includes('Aún no hay'));
    const arbol = componente.RecentOrdersView({ state: estado, onRetry: () => reintentos++ });
    const boton = find(arbol, nodo => nodo.props && nodo.props.onRetry)[0];
    boton.props.onRetry();
    assert.equal(reintentos, 1);
  });
}

function contenedor(pedirOrdenes) {
  const slots = []; const efectos = []; let indice = 0; let numeroDeEfecto = 0;
  const falsoReact = {
    useState: inicial => { const slot = indice++; if (!(slot in slots)) slots[slot] = typeof inicial === 'function' ? inicial() : inicial; return [slots[slot], siguiente => { slots[slot] = typeof siguiente === 'function' ? siguiente(slots[slot]) : siguiente; }]; },
    useEffect: (funcion, deps) => { const n = numeroDeEfecto++; efectos[n] = efectos[n] || {}; efectos[n].siguiente = { funcion, deps }; },
  };
  const api = load('src/features/admin/components/dashboard/RecentOrders.tsx', { ...uiMocks, react: falsoReact, '../../services/recentOrdersService': { RECENT_ORDERS_LIMIT: 5, formatRecentOrderDate: () => '', getRecentOrders: pedirOrdenes } }, { AbortController });
  const arbol = () => { indice = 0; numeroDeEfecto = 0; return api.default(); };
  const sincronizar = () => efectos.forEach(efecto => {
    const { funcion, deps } = efecto.siguiente;
    const cambio = !efecto.deps || deps.length !== efecto.deps.length || deps.some((valor, i) => valor !== efecto.deps[i]);
    if (cambio) { if (efecto.limpieza) efecto.limpieza(); efecto.deps = deps; efecto.limpieza = funcion(); }
  });
  return { arbol, sincronizar, desmontar: () => efectos.forEach(efecto => efecto.limpieza && efecto.limpieza()) };
}
const asentar = () => new Promise(resolve => setImmediate(resolve));

async function pruebasDelComponente() {
  await test('al abrir el dashboard consulta las órdenes y las muestra cuando llegan', async () => {
    const pedidos = []; let resolver;
    const c = contenedor((limite, signal) => { pedidos.push({ limite, signal }); return new Promise(resolve => { resolver = resolve; }); });
    assert.equal(c.arbol().props.state.status, 'loading');
    c.sincronizar();
    assert.equal(pedidos.length, 1); assert.equal(pedidos[0].limite, 5); assert.equal(pedidos[0].signal.aborted, false);
    resolver([orden(1), orden(2)]); await asentar();
    const vista = c.arbol();
    assert.equal(vista.props.state.status, 'ready'); assert.equal(vista.props.state.orders.length, 2);
    c.sincronizar();
    assert.equal(pedidos.length, 1, 'no vuelve a consultar sin motivo');
  });

  await test('si falla muestra el error y "Reintentar" vuelve a consultar', async () => {
    let intento = 0; const pedidos = [];
    const c = contenedor(async (limite, signal) => { pedidos.push(signal); intento++; if (intento === 1) throw new Error('No se pudo conectar con el servidor.'); return [orden(1)]; });
    c.arbol(); c.sincronizar(); await asentar();
    let vista = c.arbol();
    same(vista.props.state, { status: 'error', message: 'No se pudo conectar con el servidor.' });
    vista.props.onRetry();
    vista = c.arbol();
    c.sincronizar();
    assert.equal(c.arbol().props.state.status, 'loading', 'al reintentar vuelve a cargar');
    assert.equal(pedidos.length, 2); assert.equal(pedidos[0].aborted, true, 'cancela la consulta anterior');
    await asentar();
    assert.equal(c.arbol().props.state.status, 'ready');
  });

  await test('un error que no es un Error usa el mensaje general', async () => {
    const c = contenedor(async () => { throw 'texto suelto'; });
    c.arbol(); c.sincronizar(); await asentar();
    assert.equal(c.arbol().props.state.message, 'No se pudieron consultar las últimas órdenes.');
  });

  await test('si se sale del dashboard, la consulta se cancela y su resultado se ignora', async () => {
    let resolver, rechazar; const señales = [];
    const c = contenedor((limite, signal) => { señales.push(signal); return new Promise((resolve, reject) => { resolver = resolve; rechazar = reject; }); });
    c.arbol(); c.sincronizar();
    c.desmontar();
    assert.equal(señales[0].aborted, true);
    resolver([orden(1)]); await asentar();
    assert.equal(c.arbol().props.state.status, 'loading', 'una respuesta tardía no cambia nada');
    const c2 = contenedor((limite, signal) => new Promise((resolve, reject) => { rechazar = reject; }));
    c2.arbol(); c2.sincronizar(); c2.desmontar();
    rechazar(Object.assign(new Error('abortada'), { name: 'AbortError' })); await asentar();
    assert.equal(c2.arbol().props.state.status, 'loading', 'un error tardío tampoco');
  });
}

// ------------------------------------------------------------------ el dashboard
async function pruebasDelDashboard() {
  await test('el dashboard muestra las órdenes reales y ya no las de ejemplo', async () => {
    const mockOrders = [{ id: 'o1', number: 'MOCK-0001', createdAt: '2026-10-01T10:00:00Z', total: 12345, status: 'paid', customer: { name: 'Cliente De Ejemplo' } }];
    const mocks = {
      '../data/mockAdminData': { formatPrice: valor => `$${valor}` },
      '../components/ui': { Select: () => React.createElement('select', null), Badge: ({ children }) => React.createElement('span', null, children) },
      'react-router-dom': { useSearchParams: () => [new URLSearchParams(), () => {}], Link: ({ to, children }) => React.createElement('a', { href: to }, children) },
      '../context/AdminContext': { useAdmin: () => ({ config: { orders: mockOrders } }) },
      '../components/dashboard/RecentOrders': { default: () => React.createElement('section', null, 'LISTADO-REAL-DE-ORDENES') },
      '../services/dashboardService': { getDashboard: async () => ({}) },
      '../components/dashboard/Reports': { default: () => null },
      '../../data/mockAdminData': { formatPrice: valor => `$${valor}` },
      '../ui': { Alert: () => null, Button: () => null, Icon: () => null },
      '../../../api': { API_BASE_URL: 'http://api.test' }, '../../auth/services/authService': { authService: { getToken: () => null } },
    };
    const { default: Dashboard } = load('src/features/admin/pages/Dashboard.tsx', mocks);
    const salida = renderToStaticMarkup(React.createElement(Dashboard));
    assert.ok(salida.includes('LISTADO-REAL-DE-ORDENES'));
    assert.ok(!salida.includes('MOCK-0001') && !salida.includes('Cliente De Ejemplo'), 'la tabla ya no usa los datos de ejemplo');
    assert.ok(salida.includes('Resumen de la Tienda') && salida.includes('Ventas Totales') && salida.includes('Órdenes Totales') && salida.includes('Por Despachar'), 'las tarjetas siguen');
    assert.ok(!salida.includes('No hay pedidos en el período seleccionado'));
  });
}

(async () => {
  await pruebasDelServicio();
  await pruebasDeEstadosYFechas();
  await pruebasDeLaVista();
  await pruebasDelComponente();
  await pruebasDelDashboard();
  console.log(`\n${passed} pruebas OK`);
})().catch(error => { console.error(error); process.exitCode = 1; });
