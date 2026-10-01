// Ejecutar desde frontend: node tests/landing-content.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props });
let state;
let template = 'editorial';
const products = Array.from({ length: 7 }, (_, i) => ({ catalogId: String(i + 1).padStart(24, '0'), id: `real-slug-${i}`, name: `Producto real ${i}`, category: `Categoría ${i % 2}`, images: [`/real/${i}.png`], basePrice: 100 + i, description: '', status: 'active' }));
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: req });
  return module.exports;
}
function req(id) {
  if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
  if (id === 'react') return { useMemo: f => f(), useState: x => [x, () => {}] };
  if (id === 'react-router-dom') return { Link: 'Link', useNavigate: () => () => {} };
  if (id.includes('StoreContext')) return { useStore: () => state };
  if (id.includes('useLandingContent')) return load('src/features/landing/hooks/useLandingContent.ts');
  if (id.includes('useLandingSectionVisibility')) return load('src/features/landing/hooks/useLandingSectionVisibility.ts');
  if (id.includes('weeklyHours')) return load('src/features/landing/types/weeklyHours.ts');
  if (id.endsWith('.css')) return {};
  if (id.includes('landingContent')) return load('src/features/landing/types/landingContent.ts');
  if (id.includes('useStorefrontTemplate')) return { useStorefrontTemplate: () => ({ template, route: p => `/plantilla/1/${p}`, isCatalog: template === 'catalog', isVisual: template === 'visual' }) };
  if (id.includes('mockData')) return { formatPrice: String }; // Solo la función de formato, sin productos demo.
  return new Proxy({}, { get: (_, key) => key });
}
function nodes(tree, result = []) {
  if (Array.isArray(tree)) tree.forEach(x => nodes(x, result));
  else if (tree && typeof tree === 'object') { result.push(tree); nodes(tree.props?.children, result); }
  else if (typeof tree === 'string') result.push(tree);
  return result;
}
const empty = load('src/features/landing/types/landingContent.ts').normalizeLandingContent();
function reset(count = 3) {
  state = { config: {}, landingProducts: products, landingCatalogError: '', landing: {
    titulo: 'QA SCRUM-58', descripcion: 'Configuración persistida correctamente', texto_boton: 'Ver productos', imagen_principal: '/media/hero.png',
    secciones: { 'Productos destacados': true, 'Categorías': true, 'Beneficios': true, 'Información de contacto': true, 'Mapa / ubicación': true },
    contenido: { ...empty, productos_destacados: products.slice(0, count).map(p => p.catalogId), categorias: ['Categoría 0', 'Categoría 1'], beneficios: [{ titulo: 'Mi beneficio', descripcion: 'Mi descripción', icono: 'truck' }] },
  } };
}
reset();
const hook = load('src/features/landing/hooks/useLandingContent.ts').useLandingContent;
assert.deepEqual(Array.from(hook().featured, p => p.catalogId), products.slice(0, 3).map(p => p.catalogId));
state.landing.contenido.productos_destacados.push('missing');
state.landing.contenido.categorias.push('missing');
assert.equal(hook().featured.length, 3);
assert.equal(hook().categories.length, 2);
state.landingProducts = products.slice(1);
assert.equal(hook().featured.length, 2); // Un producto retirado no se sustituye.

for (const name of ['EditorialHome', 'MinimalHome', 'VisualHome', 'CatalogHome']) {
  const Component = load(`src/features/storefront/pages/${name}.tsx`).default;
  for (const count of [0, 1, 3, 6]) {
    reset(count);
    const tree = nodes(Component());
    for (const text of ['QA SCRUM-58', 'Configuración persistida correctamente', 'Ver productos']) assert(tree.includes(text), `${name}: hero`);
    const selectedSlugs = new Set(products.slice(0, count).map(p => p.id));
    for (const node of tree) {
      if (node.props?.product) assert(selectedSlugs.has(node.props.product.id), `${name}: producto ajeno`);
      if (typeof node.props?.to === 'string' && node.props.to.includes('producto/')) assert(selectedSlugs.has(node.props.to.split('/').pop()), `${name}: enlace ajeno`);
    }
    const disabled = { ...state.landing.secciones, 'Productos destacados': false, 'Categorías': false, 'Beneficios': false };
    state.landing.secciones = disabled;
    const hidden = nodes(Component());
    assert(!hidden.some(n => n.props?.product));
    assert(!hidden.some(n => typeof n.props?.to === 'string' && n.props.to.includes('producto/')));
    assert(hidden.includes('QA SCRUM-58'));
  }
}
reset(0);
const Details = load('src/features/landing/components/LandingDetails.tsx').LandingDetails;
state.landing.contenido = empty;
assert.equal(nodes(Details({ includeBenefits: true })).filter(n => n.type === 'section').length, 0);
state.landing.contenido = { ...empty,
  beneficios: [{ titulo: 'Personalizado', descripcion: 'Desde el panel', icono: 'chat' }],
  contacto: { ...empty.contacto, correo: 'qa@example.test', whatsapp: '+56 9 1234 5678', horario: 'Lunes a viernes' },
  ubicacion: { ...empty.ubicacion, direccion: 'Dirección persistida', ciudad: 'Ciudad', enlace_maps: 'https://maps.app.goo.gl/qa' },
};
const rendered = nodes(Details({ includeBenefits: true }));
assert.equal(rendered.filter(n => n.type === 'section').length, 3);
assert(rendered.some(n => n.props?.href === 'https://wa.me/56912345678'));
assert(rendered.some(n => n.props?.href === 'mailto:qa@example.test'));
assert(rendered.includes('Dirección persistida'));
assert(rendered.includes('Ciudad'));
const schedule = load('src/features/landing/types/weeklyHours.ts').weeklyHours;
const week = schedule('Sábado: 10:00–14:00; Lunes: 09:00–20:00');
assert.equal(week.length, 7);
assert.equal(week[0].day, 'Lunes');
assert.equal(week[1].hours, 'Cerrado');
assert.equal(week[5].hours, '10:00 – 14:00');
assert(schedule('Lunes: 22:00–02:00')[0].overnight);
assert.equal(schedule('Horario anterior libre'), null);
for (const key of Object.keys(state.landing.secciones)) state.landing.secciones[key] = false;
assert.equal(nodes(Details({ includeBenefits: true })).filter(n => n.type === 'section').length, 0);
// La nueva presentación respeta los mismos switches en las cuatro variantes.
for (template of ['editorial', 'minimal', 'visual', 'catalog']) {
  reset();
  state.landing.contenido = { ...empty, contacto: { ...empty.contacto, correo: 'qa@example.test', horario: 'Lunes: 09:00–20:00' }, ubicacion: { ...empty.ubicacion, direccion: 'Calle 123', comuna: 'Comuna', ciudad: 'Ciudad', region: 'Región' } };
  let details = nodes(Details({}));
  assert.equal(details.filter(n => n.type === 'section' && n.props['data-template'] === template).length, 2);
  assert.equal(details.filter(n => n.type === 'li').length, 7);
  assert(details.includes('Cerrado'));
  assert(details.includes('Comuna / Ciudad'));
  for (const [flag, label, other] of [['Información de contacto', 'Información de contacto', 'Ubicación'], ['Mapa / ubicación', 'Ubicación', 'Información de contacto']]) {
    state.landing.secciones[flag] = false;
    details = nodes(Details({}));
    assert(!details.some(n => n.type === 'section' && n.props['aria-label'] === label));
    assert(details.some(n => n.type === 'section' && n.props['aria-label'] === other));
    state.landing.secciones[flag] = true;
  }
}
template = 'editorial';
// El editor conserva contenido cuando se desactiva; agregar/quitar y límites.
reset();
const Editor = load('src/features/admin/components/LandingContentEditor.tsx').LandingContentEditor;
let edited;
const value = { ...empty, beneficios: [] };
let tree = nodes(Editor({ value, flags: state.landing.secciones, products, onChange: next => { edited = next; }, onToggle: () => {} }));
const add = tree.find(n => n.type === 'Button' && n.props.children === 'Agregar beneficio');
add.props.onClick();
assert.equal(edited.beneficios.length, 1);
const four = { ...empty, beneficios: Array.from({ length: 4 }, (_, i) => ({ titulo: 'Beneficio ' + i, descripcion: '', icono: 'truck' })) };
tree = nodes(Editor({ value: four, flags: state.landing.secciones, products, onChange: next => { edited = next; }, onToggle: () => {} }));
assert(tree.find(n => n.type === 'Button' && n.props.children === 'Agregar beneficio').props.disabled);
tree.find(n => n.type === 'Button' && n.props.children === 'Quitar beneficio').props.onClick();
assert.equal(edited.beneficios.length, 3);
assert.equal(four.beneficios.length, 4);
tree = nodes(Editor({ value: { ...empty, productos_destacados: ['pending-id'], categorias: ['pending-category'] }, flags: state.landing.secciones, products: [], catalogReady: false, onChange: () => {}, onToggle: () => {} }));
assert(tree.includes('Esperando la carga del catálogo. Tu selección se conserva.'));
assert(!tree.some(n => typeof n === 'string' && /no disponible|No hay productos|No hay categorías/.test(n)));
async function verifyMultipart() {
  const module = { exports: {} };
  let captured;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/landing/services/landingService.ts'), 'utf8'), { compilerOptions: { module: 1 } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, FormData,
    localStorage: { getItem: () => 'test-token' },
    require: () => ({ API_BASE_URL: 'http://testserver' }),
    fetch: async (url, options) => { captured = options; return { ok: true, json: async () => ({ exito: true, data: { id: 1 } }) }; },
  });
  reset();
  const input = { ...state.landing, logo: 'http://testserver/media/logo.png' };
  await module.exports.saveLandingConfig(input);
  assert.equal(captured.method, 'PUT');
  assert.equal(captured.headers.Authorization, 'Token test-token');
  assert.equal(JSON.parse(captured.body.get('contenido')).productos_destacados[0], products[0].catalogId);
  assert(!captured.body.has('imagen_principal')); // Conservar archivo existente.
  assert(!captured.body.has('logo'));
  await module.exports.saveLandingConfig({ ...input, imagen_principal: null, logo: null });
  assert.equal(captured.body.get('imagen_principal'), '');
  assert.equal(captured.body.get('logo'), '');
}
verifyMultipart().then(() => console.log('OK: selección por IDs, 0/1/3/6 productos en 4 plantillas, flags, hero, contactos/Maps, vacíos, editor y guardado multipart.')).catch(error => { console.error(error); process.exitCode = 1; });

