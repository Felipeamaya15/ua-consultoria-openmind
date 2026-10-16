// SCRUM-392, 393, 394 y 395: publicación de páginas legales y sus vistas públicas.
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
  vm.runInNewContext(code, { module, exports: module.exports, require: req, structuredClone, ...globals });
  return module.exports;
}

// Cada módulo se carga en su propio contexto: se compara el contenido, no el prototipo.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);

let passed = 0;
function test(name, fn) { fn(); console.log('OK ' + name); passed++; }

const legal = load('src/features/storefront/data/legalContent.ts');
const pub = load('src/features/storefront/data/legalPublication.ts');
const { defaultLegalPages, LEGAL_ORDER, LEGAL_META } = legal;
const TYPES = ['terms', 'privacy', 'refund', 'cookies'];
const noon = (y, m, d) => new Date(y, m, d, 12, 0, 0);

// ------------------------------------------------------------------ lógica de publicación
test('un contenido vacío o demasiado largo no se puede publicar', () => {
  for (const vacio of ['', '   ', '\n\n\t', undefined, null, 42, {}]) {
    assert.equal(pub.validateLegalContent(vacio), 'El contenido no puede estar vacío.', String(vacio));
  }
  assert.equal(pub.validateLegalContent('Texto válido'), null);
  assert.equal(pub.validateLegalContent('a'.repeat(pub.LEGAL_MAX_LENGTH)), null);
  assert.equal(pub.validateLegalContent('a'.repeat(pub.LEGAL_MAX_LENGTH + 1)), 'El contenido supera el máximo de 50.000 caracteres.');
});

test('la tienda solo ve lo publicado; sin nada publicado usa el texto base', () => {
  same(pub.readPublishedLegalPages(undefined), defaultLegalPages);
  same(pub.readPublishedLegalPages({}), defaultLegalPages);
  const saved = { legalPages: { terms: { title: 'x', draft: 'BORRADOR SECRETO', published: 'Texto publicado de términos', lastPublished: '2026-10-13T15:00:00.000Z' } } };
  const pages = pub.readPublishedLegalPages(saved);
  assert.equal(pages.terms.published, 'Texto publicado de términos');
  assert.equal(pages.terms.lastPublished, '2026-10-13T15:00:00.000Z');
  assert.equal(pages.terms.title, LEGAL_META.terms.label);
  same(pages.privacy, defaultLegalPages.privacy, 'publicar una página no cambia las otras');
  same(pages.refund, defaultLegalPages.refund);
});

test('el borrador del emprendedor nunca llega a la tienda', () => {
  const saved = { legalPages: { privacy: { draft: 'BORRADOR SECRETO', published: 'Versión pública', lastPublished: null } } };
  const pages = pub.readPublishedLegalPages(saved);
  assert.equal(pages.privacy.draft, 'Versión pública');
  assert.ok(!JSON.stringify(pages).includes('SECRETO'));
});

test('una configuración guardada dañada no rompe la tienda ni cambia el texto base', () => {
  const dañadas = [null, 'texto', 7, [], { legalPages: null }, { legalPages: [] }, { legalPages: 'x' },
    { legalPages: { terms: null } }, { legalPages: { terms: 'x' } }, { legalPages: { terms: [] } },
    { legalPages: { terms: {} } }, { legalPages: { terms: { published: '' } } }, { legalPages: { terms: { published: '   \n ' } } },
    { legalPages: { terms: { published: 123 } } }, { legalPages: { terms: { published: { a: 1 } } } }];
  for (const saved of dañadas) same(pub.readPublishedLegalPages(saved), defaultLegalPages, JSON.stringify(saved));
  const fecha = pub.readPublishedLegalPages({ legalPages: { terms: { published: 'Texto', lastPublished: 'no es fecha' } } });
  assert.equal(fecha.terms.published, 'Texto');
  assert.equal(fecha.terms.lastPublished, null);
});

test('publicar copia el borrador a lo publicado, anota la fecha y no toca lo demás', () => {
  const pages = structuredClone(defaultLegalPages);
  pages.refund.draft = 'Nueva política de reembolso';
  const antes = JSON.stringify(pages);
  const ahora = new Date('2026-10-13T15:30:00.000Z');
  const result = pub.publishLegalPage(pages, 'refund', ahora);
  assert.equal(result.ok, true);
  assert.equal(result.pages.refund.published, 'Nueva política de reembolso');
  assert.equal(result.pages.refund.draft, 'Nueva política de reembolso');
  assert.equal(result.pages.refund.lastPublished, '2026-10-13T15:30:00.000Z');
  same(result.pages.terms, pages.terms);
  same(result.pages.privacy, pages.privacy);
  assert.equal(JSON.stringify(pages), antes, 'no modifica el objeto original');
});

test('publicar un borrador vacío o demasiado largo se rechaza sin cambiar nada', () => {
  for (const draft of ['', '    ', 'a'.repeat(pub.LEGAL_MAX_LENGTH + 1)]) {
    const pages = structuredClone(defaultLegalPages);
    pages.terms.draft = draft;
    const result = pub.publishLegalPage(pages, 'terms');
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 10);
    assert.equal(result.pages, undefined);
    assert.equal(pages.terms.published, defaultLegalPages.terms.published);
  }
});

test('la fecha se muestra en español y una fecha sin hora no se corre de día', () => {
  assert.equal(pub.formatLegalDate('2025-08-01'), '1 de agosto de 2025');
  assert.equal(pub.formatLegalDate('2026-12-31'), '31 de diciembre de 2026');
  assert.equal(pub.formatLegalDate(noon(2026, 9, 13).toISOString()), '13 de octubre de 2026');
  assert.equal(pub.formatLegalDate(noon(2026, 0, 5).toISOString()), '5 de enero de 2026');
  for (const mala of ['2025-02-31', '2025-13-01', '2025-00-10', 'no es fecha', '', null, undefined]) {
    assert.equal(pub.formatLegalDate(mala), '', String(mala));
  }
});

test('solo existen cuatro tipos de página legal', () => {
  for (const tipo of TYPES) assert.equal(pub.isLegalType(tipo), true);
  for (const otro of ['terminos', 'privacidad', 'TERMS', '', undefined, null, 'privacy ', 3]) assert.equal(pub.isLegalType(otro), false, String(otro));
  same([...LEGAL_ORDER], TYPES);
});

// ------------------------------------------------------------------ el contexto de la tienda
const identity = { apiBaseUrl: 'https://api.example.test', storeId: '1' };
const storageMap = new Map();
const localStorage = { getItem: key => storageMap.get(key) ?? null, setItem: (key, value) => storageMap.set(key, value) };
const storageApi = load('src/features/storefront/visual/storage.ts', {}, { localStorage, structuredClone });
const jsx = (type, props) => ({ type, props });

function provider() {
  const slots = []; let index = 0;
  const fakeReact = {
    createContext: value => ({ Provider: 'Provider', value }), useContext: context => context.value, useMemo: fn => fn(),
    useState: initial => { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }]; },
    useEffect: () => {},
  };
  const mocks = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: fakeReact, 'react-router-dom': { useLocation: () => ({ pathname: '/plantilla/1/legal/terms' }) },
    '../services/catalogService': { fetchPublicProducts: async () => [] }, '../../landing/services/landingService': { fetchLandingConfig: async () => null },
    './StoreIdentityContext': { useStoreIdentity: () => ({ identity }) },
    '../services/legalService': { legalService: { fetchPublicLegalPages: async () => defaultLegalPages } },
  };
  const api = load('src/features/storefront/context/StoreContext.tsx', mocks, { localStorage, structuredClone, document: { querySelectorAll: () => [], body: {} }, MutationObserver: class { observe() {} disconnect() {} } });
  return { defaults: api.useStore(), read: () => { index = 0; return api.StoreProvider({ children: 'tienda' }).props.value; } };
}

test('StoreProvider entrega a la tienda las páginas legales publicadas', () => {
  storageMap.clear();
  const { defaults, read } = provider();
  same(defaults.legalPages, defaultLegalPages, 'sin proveedor, texto base');
  same(read().legalPages, defaultLegalPages, 'sin configuración guardada, texto base');
  storageApi.saveStoredStoreConfig({ template: 'minimal', legalPages: { terms: { draft: 'BORRADOR SECRETO', published: 'Términos publicados', lastPublished: '2026-10-13T15:00:00.000Z' } } }, identity);
  const value = read();
  assert.equal(value.legalPages.terms.published, 'Términos publicados');
  assert.ok(!JSON.stringify(value.legalPages).includes('SECRETO'));
  same(value.legalPages.privacy, defaultLegalPages.privacy);
  // Lo publicado en otra tienda no se mezcla con esta.
  storageApi.saveStoredStoreConfig({ legalPages: { terms: { published: 'Otra tienda' } } }, { ...identity, storeId: '2' });
  assert.equal(read().legalPages.terms.published, 'Términos publicados');
});

// ------------------------------------------------------------------ la página pública
function renderPublic({ type, legalPages = defaultLegalPages, minimal = false, catalog = false }) {
  const mocks = {
    'react-router-dom': { useParams: () => ({ type }), Link: ({ to, children }) => React.createElement('a', { href: to }, children) },
    '../components/ui': { Breadcrumb: ({ items }) => React.createElement('nav', null, items.map(item => item.label).join(' / ')) },
    '../hooks/useStorefrontTemplate': { useStorefrontTemplate: () => ({ route: (p = '') => ('/plantilla/1/' + p).replace(/\/$/, ''), isMinimal: minimal, isCatalog: catalog }) },
    '../context/StoreContext': { useStore: () => ({ legalPages }) },
  };
  const { default: Legal } = load('src/features/storefront/pages/Legal.tsx', mocks);
  return renderToStaticMarkup(React.createElement(Legal));
}
const LAYOUTS = [['editorial', {}], ['minimal', { minimal: true }], ['catalog', { catalog: true }]];

test('cada vista pública muestra la versión publicada de su página, en los tres diseños', () => {
  const publicadas = Object.fromEntries(TYPES.map(tipo => [tipo, { ...defaultLegalPages[tipo], published: `**1. Título de ${tipo}**\n\nCuerpo publicado de ${tipo}.`, lastPublished: noon(2026, 9, 13).toISOString() }]));
  for (const [layout, options] of LAYOUTS) {
    for (const tipo of TYPES) {
      const html = renderPublic({ type: tipo, legalPages: publicadas, ...options });
      assert.ok(html.includes(`Cuerpo publicado de ${tipo}.`), `${layout}/${tipo}: contenido`);
      assert.ok(html.includes(`<h2`) && html.includes(`1. Título de ${tipo}`), `${layout}/${tipo}: el título se destaca`);
      assert.ok(html.includes(LEGAL_META[tipo].label), `${layout}/${tipo}: nombre de la página`);
      assert.ok(html.includes('Última actualización: 13 de octubre de 2026'), `${layout}/${tipo}: fecha`);
      for (const otro of TYPES.filter(item => item !== tipo)) assert.ok(!html.includes(`Cuerpo publicado de ${otro}.`), `${layout}/${tipo}: no mezcla ${otro}`);
      for (const enlace of TYPES) assert.ok(html.includes(`href="/plantilla/1/legal/${enlace}"`), `${layout}/${tipo}: enlace a ${enlace}`);
    }
  }
});

test('sin nada publicado la tienda muestra el texto base de cada página', () => {
  for (const [layout, options] of LAYOUTS) for (const tipo of TYPES) {
    const html = renderPublic({ type: tipo, ...options });
    const primerParrafo = defaultLegalPages[tipo].published.split('\n\n')[1].slice(0, 40);
    assert.ok(html.includes(primerParrafo.replace(/&/g, '&amp;')), `${layout}/${tipo}`);
    assert.ok(html.includes('Última actualización: 1 de agosto de 2025'), `${layout}/${tipo}: fecha del texto base`);
  }
});

test('el contenido publicado nunca se interpreta como código', () => {
  const peligroso = { terms: { ...defaultLegalPages.terms, published: '<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n**<b>Título</b>**' } };
  for (const [layout, options] of LAYOUTS) {
    const html = renderPublic({ type: 'terms', legalPages: { ...defaultLegalPages, ...peligroso }, ...options });
    assert.ok(!html.includes('<script>') && !html.includes('<img') && !html.includes('<b>'), layout);
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), layout);
  }
});

test('una dirección legal desconocida muestra "no encontrada" con enlaces a las páginas válidas', () => {
  for (const type of ['terminos', 'privacidad', 'xyz', undefined]) {
    const html = renderPublic({ type });
    assert.ok(html.includes('Página no encontrada'), String(type));
    assert.ok(html.includes('La página legal que buscas no existe.'), String(type));
    for (const tipo of TYPES) assert.ok(html.includes(`href="/plantilla/1/legal/${tipo}"`), `${type}: enlace a ${tipo}`);
    assert.ok(!html.includes('1. Aceptación de los términos'), `${type}: ya no muestra los términos por defecto`);
  }
});

// ------------------------------------------------------------------ el editor del panel
function editorHarness(initialConfig, { saveOk = true } = {}) {
  const slots = []; let index = 0; const calls = []; let config = initialConfig;
  const fakeReact = {
    useMemo: fn => fn(),
    useState: initial => { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }]; },
    useEffect: () => {},
  };
  const mocks = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: fakeReact,
    'react-router-dom': { useParams: () => ({ type: harness.type }), Link: 'Link' },
    '../context/AdminContext': { useAdmin: () => ({ config, setConfig: next => { calls.push(next); if (saveOk) config = next; return saveOk; } }) },
    '../components/ui': { Alert: 'Alert', Badge: 'Badge', Button: 'Button', Textarea: 'Textarea' },
    '../data/mockAdminData': { createDefaultLegalPages: () => structuredClone(defaultLegalPages), legalPageTemplates: Object.fromEntries(TYPES.map(tipo => [tipo, { title: LEGAL_META[tipo].label, description: LEGAL_META[tipo].description, content: legal.LEGAL_TEMPLATES[tipo] }])) },
    '../../storefront/services/legalService': {
      legalService: {
        fetchAdminLegalPages: async () => defaultLegalPages,
        publish: async () => defaultLegalPages,
        saveDraft: async () => defaultLegalPages,
        restore: async () => defaultLegalPages,
      },
    },
  };
  const { default: LegalEditor } = load('src/features/admin/pages/Legal.tsx', mocks);
  const harness = { type: 'terminos', calls, render: () => { index = 0; return LegalEditor(); }, get config() { return config; } };
  return harness;
}
const walk = (node, visit) => { if (Array.isArray(node)) return node.forEach(item => walk(item, visit)); if (node && typeof node === 'object') { visit(node); walk(node.props && node.props.children, visit); } };
const find = (tree, predicate) => { const found = []; walk(tree, node => predicate(node) && found.push(node)); return found; };
const textOf = node => Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.props && node.props.children) : node == null || node === false ? '' : String(node);
const buttonNamed = (tree, label) => find(tree, node => node.type === 'Button' && textOf(node) === label)[0];
const configWith = overrides => ({ template: 'minimal', legalPages: { ...structuredClone(defaultLegalPages), ...overrides } });

test('el editor muestra el estado de la página y explica que lo publicado se ve en la tienda', () => {
  const h = editorHarness(configWith({}));
  let tree = h.render();
  assert.equal(find(tree, node => node.type === 'Badge').map(textOf)[0], 'Publicada');
  assert.equal(buttonNamed(tree, 'Publicar').props.disabled, true, 'sin cambios no hay nada que publicar');
  assert.ok(textOf(find(tree, node => node.type === 'Alert')[0]).includes('Lo que publiques es lo que ven tus clientes en la tienda'));
  assert.ok(textOf(find(tree, node => node.type === 'Alert')[0]).includes('se guarda en este navegador'), 'dice la verdad sobre dónde se guarda');
  assert.ok(!textOf(tree).includes('todavía no se actualizan'), 'ya no dice que la tienda no se actualiza');
  assert.equal(find(tree, node => node.type === 'Link' && String(node.props.to).includes('/legal/terms'))[0].props.to, '/plantilla/2/legal/terms');
  assert.ok(textOf(tree).includes('Es la versión que ven tus clientes · actualizada el 1 de agosto de 2025.'));
  assert.equal(find(tree, node => node.type === 'Textarea')[0].props.maxLength, pub.LEGAL_MAX_LENGTH);
  const cambiada = editorHarness(configWith({ terms: { ...defaultLegalPages.terms, draft: 'Texto nuevo sin publicar' } }));
  tree = cambiada.render();
  assert.equal(find(tree, node => node.type === 'Badge').map(textOf)[0], 'Cambios sin publicar');
  assert.equal(buttonNamed(tree, 'Publicar').props.disabled, false);
});

test('publicar guarda lo publicado, avisa que ya lo ven los clientes y habilita volver a publicar solo con cambios', () => {
  const h = editorHarness(configWith({ terms: { ...defaultLegalPages.terms, draft: 'Términos nuevos del emprendedor' } }));
  let tree = h.render();
  const antes = Date.now();
  buttonNamed(tree, 'Publicar').props.onClick();
  assert.equal(h.calls.length, 1);
  const guardada = h.calls[0].legalPages.terms;
  assert.equal(guardada.published, 'Términos nuevos del emprendedor');
  assert.ok(Date.parse(guardada.lastPublished) >= antes - 1000 && Date.parse(guardada.lastPublished) <= Date.now() + 1000);
  same(h.calls[0].legalPages.privacy, defaultLegalPages.privacy);
  assert.equal(h.calls[0].template, 'minimal', 'conserva el resto de la configuración');
  tree = h.render();
  const avisos = find(tree, node => node.type === 'Alert').map(node => [node.props.variant, textOf(node)]);
  assert.ok(avisos.some(([variante, texto]) => variante === 'success' && texto === 'Página publicada. Tus clientes ya ven esta versión en la tienda.'), JSON.stringify(avisos));
  assert.equal(buttonNamed(tree, 'Publicar').props.disabled, true);
  assert.equal(find(tree, node => node.type === 'Badge').map(textOf)[0], 'Publicada');
});

test('un borrador vacío no se publica y se explica el motivo', () => {
  for (const vacio of ['', '   \n  ']) {
    const h = editorHarness(configWith({ privacy: { ...defaultLegalPages.privacy, draft: vacio } }));
    h.type = 'privacidad';
    let tree = h.render();
    assert.equal(buttonNamed(tree, 'Publicar').props.disabled, false);
    buttonNamed(tree, 'Publicar').props.onClick();
    assert.equal(h.calls.length, 0, 'no se guardó nada');
    tree = h.render();
    const errores = find(tree, node => node.type === 'Alert' && node.props.variant === 'error').map(textOf);
    same(errores, ['El contenido no puede estar vacío.']);
    assert.ok(!find(tree, node => node.type === 'Alert' && node.props.variant === 'success').length, 'no avisa que publicó');
  }
});

test('si el navegador no puede guardar, no se dice que se publicó', () => {
  const h = editorHarness(configWith({ refund: { ...defaultLegalPages.refund, draft: 'Reembolsos nuevos' } }), { saveOk: false });
  h.type = 'reembolso';
  let tree = h.render();
  buttonNamed(tree, 'Publicar').props.onClick();
  assert.equal(h.calls.length, 1);
  tree = h.render();
  assert.ok(textOf(find(tree, node => node.type === 'Alert' && node.props.variant === 'error')[0]).startsWith('No se pudo publicar.'));
  assert.ok(!find(tree, node => node.type === 'Alert' && node.props.variant === 'success').length);
});

const { humanizeAdminError } = load('src/features/admin/utils/humanizeError.ts');
test('los avisos de error del editor llegan al emprendedor tal como están escritos', () => {
  const avisos = [pub.validateLegalContent(''), pub.validateLegalContent('a'.repeat(pub.LEGAL_MAX_LENGTH + 1)), pub.LEGAL_STORAGE_ERROR];
  for (const aviso of avisos) {
    assert.ok(aviso && aviso.length > 20, String(aviso));
    assert.equal(humanizeAdminError(aviso), aviso, 'el panel no lo reemplaza por un texto genérico');
  }
});

test('el editor no se rompe si la configuración guardada no trae alguna página', () => {
  const sinPrivacidad = { template: 'editorial', legalPages: { terms: structuredClone(defaultLegalPages.terms), refund: structuredClone(defaultLegalPages.refund) } };
  const h = editorHarness(sinPrivacidad);
  h.type = 'privacidad';
  const tree = h.render();
  assert.ok(textOf(tree).includes(LEGAL_META.privacy.label));
  const sinNada = editorHarness({ template: 'editorial' });
  assert.ok(textOf(sinNada.render()).includes(LEGAL_META.terms.label));
});

// ------------------------------------------------------------------ de punta a punta
test('lo que el emprendedor publica en el panel es lo que ve el comprador en la tienda', () => {
  storageMap.clear();
  // 1) El emprendedor escribe y publica.
  const h = editorHarness(configWith({ privacy: { ...defaultLegalPages.privacy, draft: '**1. Datos**\n\nSolo usamos tu correo para avisarte del pedido.' } }));
  h.type = 'privacidad';
  buttonNamed(h.render(), 'Publicar').props.onClick();
  // 2) El panel lo guarda en la configuración de la tienda.
  storageApi.saveStoredStoreConfig(h.calls[0], identity);
  // 3) La tienda lo lee y la vista pública lo muestra.
  const { legalPages } = provider().read();
  const html = renderPublic({ type: 'privacy', legalPages });
  assert.ok(html.includes('Solo usamos tu correo para avisarte del pedido.'));
  assert.ok(!html.includes('Recopilamos información que usted nos proporciona'), 'ya no muestra el texto base');
  assert.ok(!html.includes('Última actualización: 1 de agosto de 2025'), 'muestra la fecha de la publicación nueva');
  // 4) Las páginas que no se publicaron siguen con su texto base.
  assert.ok(renderPublic({ type: 'terms', legalPages }).includes('1. Aceptación de los términos'));
  // 5) Un borrador posterior no se ve hasta publicarlo.
  const h2 = editorHarness(storageApi.readStoredStoreConfig(identity)); h2.type = 'privacidad';
  const tree = h2.render();
  assert.ok(find(tree, node => node.type === 'Textarea')[0].props.value.includes('Solo usamos tu correo'));
});

console.log(`\n${passed} pruebas OK`);

// ============================================================================
// SUITE SCRUM: Legal Service, Cookies Pop-up & Software Version Tests
// ============================================================================

function transpileAndRun(relativePath, customContext = {}) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  const context = {
    module: moduleObj,
    exports: moduleObj.exports,
    require: (id) => {
      if (id === 'react/jsx-runtime') {
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      }
      if (id === 'react') {
        return {
          useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
          useEffect: () => {},
          useMemo: (fn) => fn(),
          useCallback: (fn) => fn,
          createContext: (val) => ({ Provider: () => null, _currentValue: val }),
          useContext: (ctx) => ctx._currentValue,
        };
      }
      if (id === 'react-router-dom') {
        return {
          useParams: () => ({ type: 'terminos' }),
          Link: ({ to, children }) => ({ type: 'a', props: { href: to, children } }),
          useLocation: () => ({ pathname: '/' }),
        };
      }
      if (customContext.requireMock) {
        const mocked = customContext.requireMock(id);
        if (mocked) return mocked;
      }
      const target = path.resolve(path.dirname(fullPath), id);
      if (fs.existsSync(target + '.ts')) return transpileAndRun(path.relative(root, target + '.ts'), customContext);
      if (fs.existsSync(target + '.tsx')) return transpileAndRun(path.relative(root, target + '.tsx'), customContext);
      if (fs.existsSync(target + '/index.ts')) return transpileAndRun(path.relative(root, target + '/index.ts'), customContext);
      throw new Error(`Cannot resolve: ${id}`);
    },
    console,
    Error,
    structuredClone: (x) => JSON.parse(JSON.stringify(x)),
    localStorage: {
      getItem: (k) => (k === 'token' ? 'test-token-123' : null),
      setItem: () => {},
      removeItem: () => {},
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    Event: class Event { constructor(type) { this.type = type; } },
    ...customContext.globals,
  };

  vm.runInNewContext(code, context);
  return moduleObj.exports;
}

(async function runTests() {
  console.log('Testing Legal Pages Service & Flow...');

  // 1. Test legalContent defaults
  const legalContent = transpileAndRun('src/features/storefront/data/legalContent.ts');
  assert.ok(legalContent.defaultLegalPages.terms, 'defaultLegalPages must have terms');
  assert.ok(legalContent.defaultLegalPages.privacy, 'defaultLegalPages must have privacy');
  assert.ok(legalContent.defaultLegalPages.refund, 'defaultLegalPages must have refund');
  assert.ok(legalContent.defaultLegalPages.cookies, 'defaultLegalPages must have cookies');
  assert.ok(legalContent.defaultLegalPages.terms.published.includes('Aceptación de los términos'));
  assert.ok(legalContent.defaultLegalPages.privacy.published.includes('Información que recopilamos'));
  assert.ok(legalContent.defaultLegalPages.refund.published.includes('Derecho a devolución'));
  assert.ok(legalContent.defaultLegalPages.cookies.published.includes('¿Qué son las cookies?'));
  console.log('✔ legalContent defaults verified (including cookies)');

  // 2. Test legalService API calls
  let fetchCalls = [];
  const fakeFetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (url.endsWith('/api/legal/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: {
            terms: { title: 'Términos Test', published: 'Contenido Términos' },
            privacy: { title: 'Privacidad Test', published: 'Contenido Privacidad' },
            refund: { title: 'Reembolso Test', published: 'Contenido Reembolso' },
            cookies: { title: 'Cookies Test', published: 'Contenido Cookies' },
          },
        }),
      };
    }
    if (url.includes('/api/legal/configuracion/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: {
            terms: { title: 'Términos Admin', draft: 'Draft Términos', published: 'Pub Términos' },
            privacy: { title: 'Privacidad Admin', draft: 'Draft Privacidad', published: 'Pub Privacidad' },
            refund: { title: 'Reembolso Admin', draft: 'Draft Reembolso', published: 'Pub Reembolso' },
            cookies: { title: 'Cookies Admin', draft: 'Draft Cookies', published: 'Pub Cookies' },
          },
        }),
      };
    }
    if (url.includes('/api/legal/vigente/terms/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: { tipo: 'terms', title: 'Términos Vigente', published: 'Pub Términos Vigente', version: 2, vigente: true, estado: 'vigente' },
        }),
      };
    }
    if (url.includes('/api/legal/vigente/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: {
            terms: { tipo: 'terms', title: 'Términos Vigente', published: 'Pub Términos Vigente', version: 2, vigente: true, estado: 'vigente' },
            privacy: { tipo: 'privacy', title: 'Privacidad Vigente', published: 'Pub Privacidad Vigente', version: 1, vigente: true, estado: 'vigente' },
            refund: { tipo: 'refund', title: 'Reembolso Vigente', published: 'Pub Reembolso Vigente', version: 1, vigente: true, estado: 'vigente' },
            cookies: { tipo: 'cookies', title: 'Cookies Vigente', published: 'Pub Cookies Vigente', version: 1, vigente: true, estado: 'vigente' },
          },
        }),
      };
    }
    if (url.includes('/api/software/version-vigente/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          mensaje: 'Versión vigente del software obtenida correctamente.',
          data: {
            sistema: 'OpenMind E-Commerce',
            version: '1.0.0',
            version_vigente: '1.0.0',
            fecha_vigencia: '2026-10-16',
            estado: 'vigente',
            vigente: true,
            plataforma: 'Universidad Autónoma de Chile',
          },
        }),
      };
    }
    if (url.includes('/api/legal/terminos/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: { title: 'Términos Detalle', published: 'Pub Detalle' },
        }),
      };
    }
    return { ok: false, json: async () => ({ exito: false, mensaje: 'Not found' }) };
  };

  const legalServiceMod = transpileAndRun('src/features/storefront/services/legalService.ts', {
    requireMock: (id) => {
      if (id.endsWith('/api')) return { API_BASE_URL: 'http://test-api:8000' };
      if (id.includes('initialLoad')) return { fetchInitialLoad: fakeFetch };
      if (id.includes('authService')) return { authService: { getToken: () => 'token-abc' } };
      return null;
    },
    globals: {
      fetch: fakeFetch,
    },
  });

  const { legalService } = legalServiceMod;

  // 2.1 Fetch public pages
  const publicPages = await legalService.fetchPublicLegalPages();
  assert.equal(publicPages.terms.title, 'Términos Test');
  assert.equal(publicPages.terms.published, 'Contenido Términos');
  assert.equal(publicPages.privacy.published, 'Contenido Privacidad');
  assert.equal(publicPages.refund.published, 'Contenido Reembolso');
  assert.equal(publicPages.cookies.published, 'Contenido Cookies');
  console.log('✔ legalService.fetchPublicLegalPages verified (including cookies)');

  // 2.2 Fetch admin pages
  const adminPages = await legalService.fetchAdminLegalPages();
  assert.equal(adminPages.terms.draft, 'Draft Términos');
  assert.equal(adminPages.cookies.draft, 'Draft Cookies');
  assert.ok(fetchCalls.some(c => c.options?.headers?.Authorization === 'Token token-abc'));
  console.log('✔ legalService.fetchAdminLegalPages sends auth token and includes cookies');

  // 2.3 Create legal content
  await legalService.createLegalContent({ tipo: 'terms', draft: 'Contenido creado', title: 'Términos Creados' });
  const createCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(createCall.options.method, 'POST');
  assert.equal(createCall.url, 'http://test-api:8000/api/legal/configuracion/');
  assert.equal(JSON.parse(createCall.options.body).tipo, 'terms');
  assert.equal(JSON.parse(createCall.options.body).draft, 'Contenido creado');
  console.log('✔ legalService.createLegalContent sends POST to /api/legal/configuracion/');

  // 2.4 Update legal content
  await legalService.updateLegalContent('refund', 'Borrador actualizado');
  const updateCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(updateCall.options.method, 'PUT');
  assert.equal(updateCall.url, 'http://test-api:8000/api/legal/configuracion/');
  assert.equal(JSON.parse(updateCall.options.body).accion, 'draft');
  assert.equal(JSON.parse(updateCall.options.body).draft, 'Borrador actualizado');
  console.log('✔ legalService.updateLegalContent sends PUT to /api/legal/configuracion/');

  // 2.5 Publish legal content
  await legalService.publishLegalContent('cookies', 'Política de cookies publicada');
  const publishCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(publishCall.options.method, 'POST');
  assert.equal(publishCall.url, 'http://test-api:8000/api/legal/configuracion/publicar/');
  assert.equal(JSON.parse(publishCall.options.body).tipo, 'cookies');
  assert.equal(JSON.parse(publishCall.options.body).content, 'Política de cookies publicada');
  console.log('✔ legalService.publishLegalContent sends POST to /api/legal/configuracion/publicar/ for cookies');

  // 2.6 Save draft & publish facades
  await legalService.saveDraft('terms', 'Nuevo borrador de términos');
  const draftCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(draftCall.options.method, 'PUT');
  assert.equal(JSON.parse(draftCall.options.body).accion, 'draft');
  assert.equal(JSON.parse(draftCall.options.body).draft, 'Nuevo borrador de términos');
  console.log('✔ legalService.saveDraft delegates properly');

  await legalService.publish('refund', 'Nueva política de reembolso publicada');
  const pubCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(pubCall.options.method, 'POST');
  assert.equal(pubCall.url, 'http://test-api:8000/api/legal/configuracion/publicar/');
  assert.equal(JSON.parse(pubCall.options.body).tipo, 'refund');
  assert.equal(JSON.parse(pubCall.options.body).content, 'Nueva política de reembolso publicada');
  console.log('✔ legalService.publish delegates properly to publishLegalContent');

  // 2.7 Restore
  await legalService.restore('cookies');
  const restCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(restCall.options.method, 'PUT');
  assert.equal(JSON.parse(restCall.options.body).accion, 'restore');
  assert.equal(JSON.parse(restCall.options.body).tipo, 'cookies');
  console.log('✔ legalService.restore sends correct restore payload for cookies');

  // 2.8 Consulta de versión vigente
  await legalService.fetchVersionVigente();
  const vigenteAllCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(vigenteAllCall.url, 'http://test-api:8000/api/legal/vigente/');
  console.log('✔ legalService.fetchVersionVigente queries /api/legal/vigente/ for all active versions');

  await legalService.fetchVersionVigente('terms');
  const vigenteTypeCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(vigenteTypeCall.url, 'http://test-api:8000/api/legal/vigente/terms/');
  console.log('✔ legalService.fetchVersionVigente queries /api/legal/vigente/terms/ for specific policy');

  // 3. Checkout links verification
  const checkoutSource = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Checkout.tsx'), 'utf8');
  assert.ok(checkoutSource.includes("to={route('legal/terms')}"), 'Checkout must link to terms');
  assert.ok(checkoutSource.includes("to={route('legal/privacy')}"), 'Checkout must link to privacy');
  assert.ok(checkoutSource.includes("to={route('legal/refund')}"), 'Checkout must link to refund');
  console.log('✔ Checkout links to terms, privacy, and refund policies in purchase flow');

  // 4. Legal page navigation verification (Inicio is non-clickable text, no Volver a la tienda, shows Versión vigente)
  const legalSource = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Legal.tsx'), 'utf8');
  assert.ok(!legalSource.includes('Volver a la tienda'), 'Legal page must not have Volver a la tienda links');
  assert.ok(!legalSource.includes('href: route()'), 'Breadcrumb Inicio must not have href');
  assert.ok(legalSource.includes('cookies'), 'Legal page must support cookies');
  assert.ok(legalSource.includes('Versión vigente'), 'Legal page must display Versión vigente badge');
  console.log('✔ Legal page shows Inicio as non-clickable text, supports cookies and displays Versión vigente');

  // 5. Footers verification: Cookies link must be present in all 4 store templates
  const editorialFooter = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/EditorialLayout.tsx'), 'utf8');
  assert.ok(editorialFooter.includes('legal/cookies'), 'Editorial layout must have Cookies link in footer');

  const catalogFooter = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/catalog/CatalogFooter.tsx'), 'utf8');
  assert.ok(catalogFooter.includes('legal/cookies'), 'Catalog footer must have Cookies link in footer');

  const minimalFooter = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/minimal/MinimalFooter.tsx'), 'utf8');
  assert.ok(minimalFooter.includes('legal/cookies'), 'Minimal footer must have Cookies link in footer');

  const visualFooter = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/visual/VisualFooter.tsx'), 'utf8');
  assert.ok(visualFooter.includes('legal/cookies'), 'Visual footer must have Cookies link in footer');
  console.log('✔ All 4 store template footers include the Cookies link');

  // 6. Cookie consent pop-up banner verification
  const cookieBannerSource = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/CookieConsentBanner.tsx'), 'utf8');
  assert.ok(cookieBannerSource.includes('openmind_cookie_consent'), 'CookieConsentBanner must use localStorage consent key');
  assert.ok(cookieBannerSource.includes('legal/cookies'), 'CookieConsentBanner must link to legal/cookies');
  assert.ok(cookieBannerSource.includes('Aviso de Cookies'), 'CookieConsentBanner must contain cookie notice');

  const routerSource = fs.readFileSync(path.join(root, 'src/app/router/index.tsx'), 'utf8');
  assert.ok(routerSource.includes('<CookieConsentBanner />'), 'StorefrontProviders must mount CookieConsentBanner');
  console.log('✔ Cookie consent pop-up banner is implemented and mounted in StorefrontProviders');

  // 7. Consulta de la versión vigente del software
  const softwareVersionMod = transpileAndRun('src/features/storefront/services/softwareVersionService.ts', {
    requireMock: (id) => {
      if (id.endsWith('/api')) return { API_BASE_URL: 'http://test-api:8000' };
      return null;
    },
    globals: {
      fetch: fakeFetch,
    },
  });

  const { softwareVersionService } = softwareVersionMod;
  const versionInfo = await softwareVersionService.getSoftwareVersion();
  assert.equal(versionInfo.sistema, 'OpenMind E-Commerce');
  assert.equal(versionInfo.version_vigente, '1.0.0');
  assert.equal(versionInfo.estado, 'vigente');
  assert.equal(versionInfo.vigente, true);
  console.log('✔ softwareVersionService.getSoftwareVersion queries /api/software/version-vigente/ and returns valid software version data');

  const institutionalBadgeSource = fs.readFileSync(path.join(root, 'src/features/storefront/components/ui/index.tsx'), 'utf8');
  assert.ok(institutionalBadgeSource.includes('v1.0.0'), 'InstitutionalBadge must display software version badge');
  assert.ok(institutionalBadgeSource.includes('SoftwareVersionModal'), 'InstitutionalBadge must link to SoftwareVersionModal');
  console.log('✔ InstitutionalBadge includes interactive software version indicator and modal trigger');

  console.log('\nAll Legal Pages, Cookies & Software Version tests passed successfully!');
})();
