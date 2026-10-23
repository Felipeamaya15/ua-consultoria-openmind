// SCRUM-454: estados vacíos compartidos. Prueba el componente real, la decisión "vacío o sin resultados" y vigila la consistencia.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./source-loader.cjs');

const root = path.resolve(__dirname, '..');
const { EmptyListState } = load('src/shared/components/states.tsx');
const { emptyKind, hasOrderFilters, ORDER_FILTER_KEYS } = load('src/features/admin/services/emptyStates.ts');
const html = (props, children) => renderToStaticMarkup(React.createElement(EmptyListState, props, children));
const clases = marcado => (marcado.match(/<div[^>]*class="([^"]*)"/) || [])[1].split(/\s+/);
const leer = ruta => fs.readFileSync(path.join(root, ruta), 'utf8').replace(/\r/g, '');
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

// ---- el componente ----
test('se anuncia como estado y muestra el mensaje', () => {
  const marcado = html({}, 'Aún no tienes pedidos.');
  assert.match(marcado, /role="status"/);
  assert.ok(marcado.includes('<div>Aún no tienes pedidos.</div>'));
  assert.equal((marcado.match(/role="status"/g) || []).length, 1);
});

test('título, ícono y acción son opcionales y solo aparecen si se entregan', () => {
  const simple = html({}, 'x');
  assert.ok(!simple.includes('font-semibold') && !simple.includes('aria-hidden') && !simple.includes('mt-2'));
  const completo = html({ title: 'Aún no tienes productos', icon: React.createElement('svg', null), action: React.createElement('a', { href: '/nuevo' }, 'Crear') }, 'Agrega el primero.');
  assert.ok(completo.includes('<p class="font-semibold text-[var(--foreground)]">Aún no tienes productos</p>'));
  assert.ok(completo.includes('<div aria-hidden="true" class="mb-1"><svg></svg></div>'), 'el ícono es decorativo');
  assert.ok(completo.includes('<div class="mt-2"><a href="/nuevo">Crear</a></div>'));
  assert.ok(completo.indexOf('Aún no tienes productos') < completo.indexOf('Agrega el primero.') && completo.indexOf('Agrega el primero.') < completo.indexOf('Crear'));
});

test('alineación: centrada por defecto o al inicio', () => {
  assert.ok(clases(html({}, 'x')).includes('text-center') && clases(html({}, 'x')).includes('items-center'));
  const inicio = clases(html({ align: 'start' }, 'x'));
  assert.ok(inicio.includes('items-start') && inicio.includes('text-left') && !inicio.includes('text-center'));
});

test('espacio vertical: normal, compacto o ninguno', () => {
  assert.ok(clases(html({}, 'x')).includes('py-10'));
  assert.ok(clases(html({ spacing: 'compact' }, 'x')).includes('py-4'));
  assert.ok(!clases(html({ spacing: 'none' }, 'x')).some(c => /^py-/.test(c)));
});

test('el texto se escapa, la clase extra se agrega y no quedan rastros de valores vacíos', () => {
  const peligroso = html({ spacing: 'none', className: 'p-10' }, '<script>alert(1)</script> & "x"');
  assert.ok(!peligroso.includes('<script>'));
  assert.ok(peligroso.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'));
  assert.equal(clases(peligroso).at(-1), 'p-10');
  assert.ok(!/undefined|null|false/.test(html({ spacing: 'none' }, 'x')));
  assert.ok(!/class="[^"]*  [^"]*"/.test(peligroso));
});

// ---- la decisión: vacío o sin resultados ----
test('no hay estado vacío mientras carga, si falló la carga o si hay filas', () => {
  const base = { loading: false, error: '', shown: 0, searching: false };
  assert.equal(emptyKind({ ...base, loading: true }), null);
  assert.equal(emptyKind({ ...base, error: 'No se pudo cargar' }), null);
  assert.equal(emptyKind({ ...base, error: true }), null);
  assert.equal(emptyKind({ ...base, shown: 3 }), null);
  assert.equal(emptyKind({ ...base, shown: 3, searching: true }), null);
});

test('sin filas: "todavía no hay nada" si no se busca y "sin resultados" si se busca', () => {
  assert.equal(emptyKind({ loading: false, error: '', shown: 0, searching: false }), 'empty');
  assert.equal(emptyKind({ loading: false, error: false, shown: 0, searching: true }), 'no-results');
});

test('qué parámetros de Pedidos cuentan como filtros', () => {
  const con = consulta => hasOrderFilters(new URLSearchParams(consulta));
  assert.equal(con(''), false);
  assert.equal(con('estado=all'), false, 'estado=all es "sin filtro"');
  assert.equal(con('pagina=2&pedido=7'), false, 'la página y el pedido abierto no son filtros');
  assert.equal(con('q='), false, 'un parámetro vacío no filtra');
  for (const clave of ORDER_FILTER_KEYS) assert.equal(con(`${clave}=valor`), true, clave);
  assert.equal(con('estado=pagado'), true);
  assert.equal(con('pagina=2&q=ana'), true);
});

test('los filtros que reconoce son los mismos que borra el botón "Limpiar filtros" de Pedidos', () => {
  const pedidos = leer('src/features/admin/pages/Orders.tsx');
  const boton = pedidos.match(/updateParams\(\{([^}]*)\}\)\}>Limpiar filtros/);
  assert.ok(boton, 'no se encontró el botón Limpiar filtros');
  const borradas = [...boton[1].matchAll(/(\w+): null/g)].map(m => m[1]).sort();
  assert.deepEqual([...ORDER_FILTER_KEYS].sort(), borradas);
});

// ---- Mis pedidos del comprador: vacío con una acción útil ----
function montarPedidos(pedir, id) {
  const slots = [], efectos = []; let indice = 0, numero = 0;
  const falsoReact = {
    useState: inicial => { const s = indice++; if (!(s in slots)) slots[s] = typeof inicial === 'function' ? inicial() : inicial; return [slots[s], valor => { slots[s] = typeof valor === 'function' ? valor(slots[s]) : valor; }]; },
    useEffect: (funcion, deps) => { efectos[numero++] = { funcion, deps }; },
  };
  const mocks = {
    react: falsoReact,
    'react-router-dom': { Link: 'Link', useParams: () => (id ? { id } : {}) },
    '../../auth/services/authService': { authService: { getCustomerOrders: pedir, getCustomerOrder: async () => ({ id_pedido: 5, identificador: 'ORD-1', entrega: {}, items: [] }) } },
    '../hooks/useStorefrontTemplate': { useStorefrontTemplate: () => ({ route: p => '/' + p }) },
    '../components/store/CustomerAccountNavigation': { CustomerAccountNavigation: 'AccountNav' },
    '../../admin/services/businessTime': { formatBusinessDate: String },
    '../../admin/services/reportFormatting': { formatReportMoney: String },
    '../components/checkout/PickupSchedule': { PickupSelectionSummary: 'Pickup' },
    '../../../shared/components/states': { LoadingState: 'LoadingState', ErrorState: 'ErrorState', EmptyListState: 'EmptyListState' },
  };
  const { default: Pagina } = load('src/features/storefront/pages/CustomerOrders.tsx', mocks);
  const dibujar = () => { indice = 0; numero = 0; return Pagina(); };
  const nodos = (nodo, lista = []) => { if (nodo && typeof nodo === 'object') { lista.push(nodo); [].concat(nodo.props?.children ?? []).forEach(h => nodos(h, lista)); } return lista; };
  return { dibujar, efectos, nodos };
}

test('sin pedidos, Mis pedidos explica y ofrece ir al catálogo', async () => {
  const pagina = montarPedidos(async () => [], undefined);
  pagina.dibujar(); pagina.efectos[0].funcion(); await new Promise(setImmediate);
  const vacio = pagina.nodos(pagina.dibujar()).find(n => n.type === 'EmptyListState');
  assert.ok(vacio, 'debe mostrarse el estado vacío');
  assert.equal(vacio.props.children, 'Aún no tienes pedidos.');
  assert.equal(vacio.props.action.type, 'Link');
  assert.equal(vacio.props.action.props.to, '/catalogo');
  assert.equal(vacio.props.action.props.children, 'Ver el catálogo');
});

test('con pedidos, o mientras carga, no se muestra el estado vacío', async () => {
  const cargando = montarPedidos(async () => [], undefined);
  assert.ok(!cargando.nodos(cargando.dibujar()).some(n => n.type === 'EmptyListState'), 'antes de cargar');
  const conPedidos = montarPedidos(async () => [{ id_pedido: 5, identificador: 'ORD-1', fecha_creacion: '2026-10-01T12:00:00Z', estado_etiqueta: 'Pagado', cantidad_productos: 1, monto_total: '1000', entrega: {} }], undefined);
  conPedidos.dibujar(); conPedidos.efectos[0].funcion(); await new Promise(setImmediate);
  assert.ok(!conPedidos.nodos(conPedidos.dibujar()).some(n => n.type === 'EmptyListState'));
});

test('el detalle de un pedido no muestra "Aún no tienes pedidos"', async () => {
  const detalle = montarPedidos(async () => [], '5');
  detalle.dibujar(); detalle.efectos[0].funcion(); await new Promise(setImmediate);
  assert.ok(!detalle.nodos(detalle.dibujar()).some(n => n.type === 'EmptyListState'));
});

// ---- guardias ----
const CONVERTIDOS = [
  ['src/features/admin/components/dashboard/RecentOrders.tsx', 'Aún no hay órdenes registradas en tu tienda.'],
  ['src/features/admin/components/dashboard/DailyHistoryTable.tsx', 'No hay pedidos en el período seleccionado.'],
  ['src/features/admin/components/PendingTransfers.tsx', 'No hay transferencias pendientes de verificación.'],
  ['src/features/admin/pages/Orders.tsx', 'No hay pedidos que coincidan con los filtros.'],
  ['src/features/admin/pages/Orders.tsx', 'Aún no hay pedidos en tu tienda.'],
  ['src/features/admin/pages/Promotions.tsx', 'Aún no hay promociones creadas en tu tienda.'],
  ['src/features/admin/pages/Sales.tsx', 'No hay líneas de productos disponibles para el período.'],
  ['src/features/admin/pages/Sales.tsx', 'Sin ventas confirmadas en este período.'],
  ['src/features/admin/pages/Sales.tsx', 'No hay ventas confirmadas para estos filtros.'],
  ['src/features/admin/pages/Contacts.tsx', 'No hay contactos que coincidan con los filtros.'],
  ['src/features/admin/pages/Products.tsx', 'No encontramos productos con esa búsqueda.'],
  ['src/features/admin/pages/Products.tsx', 'Agrega tu primer producto para empezar a vender.'],
  ['src/features/storefront/pages/CustomerOrders.tsx', 'Aún no tienes pedidos.'],
];

// Lee cada <EmptyListState ...>hijo</EmptyListState>, respetando las llaves de las propiedades (por ejemplo los enlaces de la acción).
function hijosDeEmptyListState(texto) {
  const hijos = [];
  let desde = 0;
  for (;;) {
    const inicio = texto.indexOf('<EmptyListState', desde);
    if (inicio < 0) break;
    let i = inicio + '<EmptyListState'.length, profundidad = 0;
    for (; i < texto.length; i++) {
      const c = texto[i];
      if (c === '{') profundidad++; else if (c === '}') profundidad--;
      else if (c === '>' && profundidad === 0) break;
    }
    const fin = texto.indexOf('</EmptyListState>', i);
    hijos.push(texto.slice(i + 1, fin));
    desde = fin + 1;
  }
  return hijos;
}

test('cada lista vacía usa <EmptyListState> y ya no un párrafo suelto', () => {
  const mal = [];
  for (const [ruta, mensaje] of CONVERTIDOS) {
    const texto = leer(ruta);
    const dentro = hijosDeEmptyListState(texto).some(hijo => hijo.includes(mensaje));
    const suelto = new RegExp(`<p[^>]*>\\s*${mensaje.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(texto);
    if (!dentro || suelto) mal.push(`${ruta}: ${mensaje}`);
  }
  assert.deepEqual(mal, []);
});

test('quien usa <EmptyListState> lo importa del módulo compartido', () => {
  const sin = pantallas.filter(f => /<EmptyListState\b/.test(f.texto) && !/import \{[^}]*\bEmptyListState\b[^}]*\} from ['"][./]+shared\/components\/states['"]/.test(f.texto)).map(f => f.ruta);
  assert.deepEqual(sin, []);
  assert.ok(pantallas.filter(f => /<EmptyListState\b/.test(f.texto)).length >= 9);
});

test('el listado de productos distingue "no hay productos" de "la búsqueda no encuentra" y no parpadea al cargar', () => {
  const productos = leer('src/features/admin/pages/Products.tsx');
  assert.ok(/const vacio = emptyKind\(\{ loading, error, shown: filtered\.length, searching: search\.trim\(\) !== "" \}\)/.test(productos));
  assert.ok(productos.includes('{vacio === "empty" && <EmptyListState'));
  assert.ok(productos.includes('{vacio === "no-results" && <EmptyListState'));
  assert.ok(productos.includes('to="/emprendedor/productos/nuevo"') && productos.includes('Crear tu primer producto'));
  assert.ok(productos.includes('onClick={() => setSearch("")}>Limpiar búsqueda'));
  assert.ok(!/\{filtered\.length === 0 && </.test(productos), 'el mensaje no debe depender solo de que la lista esté vacía (aparecería mientras carga)');
});

test('Pedidos elige el mensaje según haya filtros o no', () => {
  const pedidos = leer('src/features/admin/pages/Orders.tsx');
  assert.ok(pedidos.includes("{hasOrderFilters(params) ? 'No hay pedidos que coincidan con los filtros.' : 'Aún no hay pedidos en tu tienda.'}"));
});

(async () => {
  for (const { name, fn } of pruebas) { await fn(); console.log('OK ' + name); passed++; }
  console.log(`\n${passed} pruebas OK`);
})().catch(error => { console.error(error); process.exitCode = 1; });
