// SCRUM-452: estados de error compartidos. Prueba el componente real, el reintento de una pantalla y vigila la consistencia.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./source-loader.cjs');

const root = path.resolve(__dirname, '..');
const { ErrorState } = load('src/shared/components/states.tsx');
const html = (props, children) => renderToStaticMarkup(React.createElement(ErrorState, props, children));
let passed = 0;
const pruebas = [];
function test(name, fn) { pruebas.push({ name, fn }); }

function archivos(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap(entrada => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivos(ruta) : /\.tsx$/.test(entrada.name) ? [ruta] : [];
  });
}
const pantallas = archivos(path.join(root, 'src')).map(ruta => ({ ruta: path.relative(root, ruta).replaceAll('\\', '/'), texto: fs.readFileSync(ruta, 'utf8').replace(/\r/g, '') }))
  .filter(f => f.ruta !== 'src/shared/components/states.tsx');
const MENSAJE_POR_DEFECTO = 'No pudimos cargar la información. Intenta nuevamente.';

test('se anuncia como alerta y muestra el mensaje', () => {
  const marcado = html({}, 'No se pudo conectar con el servidor.');
  assert.match(marcado, /role="alert"/);
  assert.ok(marcado.includes('No se pudo conectar con el servidor.'));
  assert.equal((marcado.match(/role="alert"/g) || []).length, 1);
});

test('sin mensaje, o con uno vacío, dice algo comprensible en vez de quedar en blanco', () => {
  for (const vacio of [undefined, null, false, '', '   ', '\n']) {
    const marcado = renderToStaticMarkup(React.createElement(ErrorState, { children: vacio }));
    assert.ok(marcado.includes(MENSAJE_POR_DEFECTO), JSON.stringify(vacio));
  }
  assert.ok(!html({}, 'Otro mensaje').includes(MENSAJE_POR_DEFECTO));
});

test('el título es opcional', () => {
  assert.ok(html({ title: 'No pudimos cargar tus pedidos' }, 'x').includes('<p class="font-semibold text-[var(--error)]">No pudimos cargar tus pedidos</p>'));
  assert.ok(!html({}, 'x').includes('font-semibold'));
});

test('sin función de reintento no hay botón', () => {
  assert.ok(!html({}, 'x').includes('<button'));
});

test('con función de reintento aparece el botón "Reintentar", que no envía formularios', () => {
  const marcado = html({ onRetry: () => {} }, 'x');
  assert.match(marcado, /<button type="button"[^>]*>Reintentar<\/button>/);
  assert.match(html({ onRetry: () => {}, retryLabel: 'Reintentar pedidos' }, 'x'), />Reintentar pedidos<\/button>/);
});

test('al pulsar el botón se llama a la función de reintento', () => {
  let veces = 0;
  const arbol = ErrorState({ onRetry: () => { veces++; }, children: 'x' });
  const botones = [];
  (function buscar(nodo) { if (!nodo || typeof nodo !== 'object') return; if (nodo.type === 'button') botones.push(nodo); [].concat(nodo.props?.children || []).forEach(buscar); })(arbol);
  assert.equal(botones.length, 1);
  botones[0].props.onClick();
  assert.equal(veces, 1);
});

test('el mensaje puede incluir un enlace y se escapa si es texto', () => {
  assert.ok(html({}, React.createElement('a', { href: '/volver' }, 'Volver')).includes('<a href="/volver">Volver</a>'));
  const peligroso = html({}, '<img src=x onerror=alert(1)> & "x"');
  assert.ok(!peligroso.includes('<img'));
  assert.ok(peligroso.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;x&quot;'));
});

test('la clase del contenedor se agrega y no quedan rastros de valores vacíos', () => {
  const marcado = html({ className: 'mt-4' }, 'x');
  assert.match(marcado, /class="[^"]*\bmt-4"/);
  assert.ok(!/undefined|null|false/.test(marcado));
  assert.ok(!/class="[^"]*  [^"]*"/.test(marcado));
});

// ---- el reintento de una pantalla real: pedidos del comprador ----
function montarPedidosDelComprador(pedir) {
  const slots = [], efectos = []; let indice = 0, numero = 0;
  const falsoReact = {
    useState: inicial => { const s = indice++; if (!(s in slots)) slots[s] = typeof inicial === 'function' ? inicial() : inicial; return [slots[s], valor => { slots[s] = typeof valor === 'function' ? valor(slots[s]) : valor; }]; },
    useEffect: (funcion, deps) => { efectos[numero++] = { funcion, deps }; },
  };
  const mocks = {
    react: falsoReact,
    'react-router-dom': { Link: 'Link', useParams: () => ({}) },
    '../../auth/services/authService': { authService: { getCustomerOrders: pedir, getCustomerOrder: async () => ({}) } },
    '../hooks/useStorefrontTemplate': { useStorefrontTemplate: () => ({ route: p => '/' + p }) },
    '../components/store/CustomerAccountNavigation': { CustomerAccountNavigation: 'AccountNav' },
    '../../admin/services/businessTime': { formatBusinessDate: String },
    '../../admin/services/reportFormatting': { formatReportMoney: String },
    '../components/checkout/PickupSchedule': { PickupSelectionSummary: 'Pickup' },
    '../../../shared/components/states': { LoadingState: 'LoadingState', ErrorState: 'ErrorState' },
  };
  const { default: Pagina } = load('src/features/storefront/pages/CustomerOrders.tsx', mocks);
  const dibujar = () => { indice = 0; numero = 0; return Pagina(); };
  const nodos = (nodo, lista = []) => { if (nodo && typeof nodo === 'object') { lista.push(nodo); [].concat(nodo.props?.children ?? []).forEach(h => nodos(h, lista)); } return lista; };
  return { dibujar, efectos, nodos };
}

test('si falla la carga de pedidos se avisa y "Reintentar" vuelve a pedirlos', async () => {
  let llamadas = 0;
  const pagina = montarPedidosDelComprador(async () => { llamadas++; if (llamadas === 1) throw new Error('No se pudo conectar con el servidor.'); return []; });
  pagina.dibujar();
  const primero = pagina.efectos[0];
  primero.funcion();
  await new Promise(setImmediate);
  let arbol = pagina.dibujar();
  const error = pagina.nodos(arbol).find(n => n.type === 'ErrorState');
  assert.ok(error, 'debe mostrarse el error');
  assert.equal(error.props.children, 'No se pudo conectar con el servidor.');
  assert.equal(typeof error.props.onRetry, 'function');
  assert.ok(!pagina.nodos(arbol).some(n => n.type === 'LoadingState'), 'no debe mostrarse la carga junto al error');
  const depsAntes = JSON.stringify(pagina.efectos[0].deps);
  error.props.onRetry();
  arbol = pagina.dibujar();
  assert.notEqual(JSON.stringify(pagina.efectos[0].deps), depsAntes, 'al reintentar, la carga debe volver a ejecutarse');
  pagina.efectos[0].funcion();
  await new Promise(setImmediate);
  arbol = pagina.dibujar();
  assert.equal(llamadas, 2);
  assert.ok(!pagina.nodos(arbol).some(n => n.type === 'ErrorState'), 'tras el reintento exitoso desaparece el error');
});

test('una carga exitosa no muestra errores ni botón de reintento', async () => {
  const pagina = montarPedidosDelComprador(async () => []);
  pagina.dibujar(); pagina.efectos[0].funcion(); await new Promise(setImmediate);
  assert.ok(!pagina.nodos(pagina.dibujar()).some(n => n.type === 'ErrorState'));
});

// ---- guardias ----
test('ninguna pantalla vuelve a armar a mano un error con botón de reintento', () => {
  const sueltos = [];
  for (const { ruta, texto } of pantallas) {
    texto.split('\n').forEach((linea, i) => {
      if (/(role="alert"|<Alert variant=["']error["'])[^\n]*Reintentar/.test(linea)) sueltos.push(`${ruta}:${i + 1}  ${linea.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(sueltos, [], 'usa <ErrorState onRetry={...}> en vez de armar el error con su botón:\n' + sueltos.join('\n'));
});

test('quien usa <ErrorState> lo importa del módulo compartido', () => {
  const sin = pantallas.filter(f => /<ErrorState\b/.test(f.texto) && !/import \{[^}]*\bErrorState\b[^}]*\} from ['"][./]+shared\/components\/states['"]/.test(f.texto)).map(f => f.ruta);
  assert.deepEqual(sin, []);
});

// Lee cada <ErrorState ...>hijo</ErrorState>, respetando las llaves de las propiedades (por ejemplo las funciones con flecha).
function usosDeErrorState(texto) {
  const usos = [];
  let desde = 0;
  for (;;) {
    const inicio = texto.indexOf('<ErrorState', desde);
    if (inicio < 0) break;
    let i = inicio + '<ErrorState'.length, profundidad = 0;
    for (; i < texto.length; i++) {
      const c = texto[i];
      if (c === '{') profundidad++; else if (c === '}') profundidad--;
      else if (c === '>' && profundidad === 0) break;
    }
    if (texto[i - 1] === '/') { usos.push({ hijo: '' }); desde = i + 1; continue; }
    const fin = texto.indexOf('</ErrorState>', i);
    usos.push({ hijo: texto.slice(i + 1, fin).trim() });
    desde = fin + 1;
  }
  return usos;
}

test('en el panel, los mensajes de error pasan por humanizeAdminError (nunca texto técnico)', () => {
  const sin = [];
  let usos = 0;
  for (const { ruta, texto } of pantallas.filter(f => f.ruta.startsWith('src/features/admin/'))) {
    for (const uso of usosDeErrorState(texto)) {
      usos++;
      if (uso.hijo.startsWith('{') && !uso.hijo.startsWith('{humanizeAdminError(')) sin.push(`${ruta}: ${uso.hijo}`);
    }
  }
  assert.ok(usos >= 10, `se esperaban al menos 10 usos en el panel y hay ${usos}`);
  assert.deepEqual(sin, []);
});

test('el catálogo y los pedidos del comprador ofrecen reintentar y vuelven a cargar', () => {
  const catalogo = pantallas.find(f => f.ruta === 'src/features/storefront/pages/Catalog.tsx').texto;
  assert.ok(/<ErrorState onRetry=\{\(\) => \{ setLoadError\(false\); setLoading\(true\); setAttempt\(n => n \+ 1\); \}\}>/.test(catalogo));
  assert.ok(/\}, \[attempt\]\);/.test(catalogo), 'la carga del catálogo debe depender del intento');
  assert.ok(!catalogo.includes('Intenta recargar la página'));
  const pedidos = pantallas.find(f => f.ruta === 'src/features/storefront/pages/CustomerOrders.tsx').texto;
  assert.ok(/\}, \[id, attempt\]\);/.test(pedidos));
});

test('se usa en las pantallas principales', () => {
  const usan = pantallas.filter(f => /<ErrorState\b/.test(f.texto)).map(f => f.ruta.split('/').pop().replace('.tsx', '')).sort();
  for (const esperado of ['Catalog', 'Checkout', 'Contacts', 'CustomerOrders', 'DailyHistoryTable', 'DashboardMetrics', 'LandingPageContent', 'LandingStatus', 'Legal', 'Orders', 'RecentOrders', 'Reports', 'Sales', 'Shipping']) {
    assert.ok(usan.includes(esperado), `falta en ${esperado}`);
  }
});

(async () => {
  for (const { name, fn } of pruebas) { await fn(); console.log('OK ' + name); passed++; }
  console.log(`\n${passed} pruebas OK`);
})().catch(error => { console.error(error); process.exitCode = 1; });
