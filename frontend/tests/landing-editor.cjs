const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, TypeError, DOMException, AbortController, ...globals });
  return module.exports;
}
const jsx = (type, props) => ({ type, props });
function nodes(tree, result = []) {
  if (Array.isArray(tree)) tree.forEach(x => nodes(x, result));
  else if (tree && typeof tree === 'object') { result.push(tree); nodes(tree.props?.children, result); }
  else if (typeof tree === 'string') result.push(tree);
  return result;
}
const req = id => id === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : id === 'react' ? { useState: x => [x, () => {}] } : id.includes('chileTerritory') ? { default: require('../src/features/admin/data/chileTerritory.json') } : id.includes('chileLocalities') ? { default: require('../src/features/admin/data/chileLocalities.json') } : { Button: 'Button', Input: 'Input', Select: 'Select' };
const hours = load('src/features/admin/components/WeeklyHoursEditor.tsx', { require: req });
const week = hours.weekDays.map(day => ({ day, open: '09:00', close: '18:30' }));
const saved = hours.formatWeeklyHours(week);
assert(saved.length <= 250);
assert.equal(hours.parseWeeklyHours(saved).length, 7);
assert.equal(hours.parseWeeklyHours('Horario anterior libre'), null);
let changed;
let tree = nodes(hours.WeeklyHoursEditor({ value: saved, onChange: x => changed = x }));
assert.equal(tree.filter(n => n.props?.type === 'time' && n.props.required).length, 14);
tree.find(n => n.props?.label === 'Apertura · Lunes').props.onChange({ target: { value: '08:15' } });
assert.equal(hours.parseWeeklyHours(changed)[0].open, '08:15');
tree.find(n => n.props?.type === 'checkbox').props.onChange({ target: { checked: false } });
assert.equal(hours.parseWeeklyHours(changed).length, 6);
const Address = load('src/features/admin/components/ChileAddressEditor.tsx', { require: req }).ChileAddressEditor;
const location = { region: 'Valparaíso', comuna: 'Viña del Mar', ciudad: 'Viña Del Mar', direccion: 'Calle 123', enlace_maps: '' };
tree = nodes(Address({ value: location, onChange: x => changed = x }));
const select = label => tree.find(n => n.props?.label === label);
assert.equal(select('Región').props.options.length, 17);
assert(select('Comuna').props.options.some(o => o.value === 'Valparaíso'));
assert(!select('Comuna').props.options.some(o => o.value === 'Temuco'));
assert(select('Ciudad / localidad').props.options.some(o => o.value === 'Viña Del Mar'));
select('Región').props.onChange({ target: { value: 'La Araucanía' } });
assert.equal(changed.comuna, ''); assert.equal(changed.ciudad, ''); assert.equal(changed.direccion, 'Calle 123');
const legacy = { ...location, region: 'Región antigua', comuna: 'Comuna antigua', ciudad: 'Localidad antigua' };
tree = nodes(Address({ value: legacy, onChange: () => {} }));
assert(tree.find(n => n.props?.label === 'Región').props.options.some(o => o.value === legacy.region));

async function verifyPageLoading() {
  let slots = [], index = 0, effect, requested = [], resolveConfig, resolveCatalog;
  const configLoad = new Promise(resolve => { resolveConfig = resolve; });
  const catalogLoad = new Promise(resolve => { resolveCatalog = resolve; });
  const normalize = require('typescript').transpileModule(fs.readFileSync(path.join(root, 'src/features/landing/types/landingContent.ts'), 'utf8'), { compilerOptions: { module: 1 } }).outputText;
  const normalizedModule = { exports: {} };
  vm.runInNewContext(normalize, { module: normalizedModule, exports: normalizedModule.exports });
  const Page = load('src/features/admin/pages/LandingPage.tsx', { AbortController, require: id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'react') return { useState: initial => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = next; }]; }, useEffect: fn => { effect = fn; } };
    if (id.includes('landingContent')) return normalizedModule.exports;
    if (id.includes('landingService')) return { fetchLandingConfig: options => { requested.push(options); return configLoad; } };
    if (id.includes('catalogService')) return { fetchPublicProducts: options => { requested.push(options); return catalogLoad; } };
    if (id.includes('AdminContext')) return { useAdmin: () => ({ config: { template: 'editorial' } }) };
    if (id.includes('navigation')) return { templatePaths: { editorial: '/plantilla/1' } };
    return new Proxy({}, { get: (_, key) => key });
  } }).default;
  const render = () => { index = 0; return nodes(Page()); };
  assert(render().includes('Cargando configuración...'));
  const cleanup = effect();
  assert.equal(requested.length, 2); assert(requested.every(o => o.retry && o.signal));
  assert(!render().some(n => n.props?.role === 'alert'));
  resolveConfig({ titulo: 'Título almacenado', descripcion: 'Persistida', texto_boton: 'Ver', imagen_principal: null, secciones: {}, contenido: {} });
  await new Promise(setImmediate);
  let page = render(); assert(page.includes('Cargando productos y categorías...'));
  page.find(n => n.props?.label === 'Título principal').props.onChange({ target: { value: 'Edición mientras carga' } });
  resolveCatalog([]); await new Promise(setImmediate);
  page = render(); assert.equal(page.find(n => n.props?.label === 'Título principal').props.value, 'Edición mientras carga');
  assert(!page.includes('Cargando productos y categorías...'));
  cleanup(); assert(requested[0].signal.aborted);
}

async function verifyRetries() {
  let calls, delays;
  const run = outcomes => {
    calls = 0; delays = [];
    return load('src/core/http/initialLoad.ts', {
      fetch: async () => { const item = outcomes[Math.min(calls++, outcomes.length - 1)]; if (item instanceof Error) throw item; return { status: item, body: { cancel: async () => {} } }; },
      setTimeout: (fn, ms) => { delays.push(ms); queueMicrotask(fn); return 1; }, clearTimeout: () => {},
    }).fetchInitialLoad;
  };
  assert.equal((await run([new TypeError('Failed to fetch'), 503, 200])('/config', { retry: true })).status, 200);
  assert.equal(calls, 3); assert.deepEqual(delays, [750, 1000]);
  await assert.rejects(run([new TypeError('Failed to fetch')])('/config', { retry: true }), TypeError);
  assert.equal(calls, 4); assert.deepEqual(delays, [750, 1000, 1500]);
  assert.equal((await run([503])('/catalog', { retry: true })).status, 503); assert.equal(calls, 4);
  assert.equal((await run([403, 200])('/config', { retry: true })).status, 403); assert.equal(calls, 1);
  await assert.rejects(run([new TypeError('network'), 200])('/config'), TypeError); assert.equal(calls, 1);
  let abortedCalls = 0, scheduled, cleared = false;
  const controller = new AbortController();
  const fetchInitialLoad = load('src/core/http/initialLoad.ts', {
    fetch: async () => { abortedCalls++; throw new TypeError('network'); },
    setTimeout: fn => { scheduled = fn; return 1; }, clearTimeout: () => { cleared = true; },
  }).fetchInitialLoad;
  const pending = fetchInitialLoad('/config', { retry: true, signal: controller.signal });
  await new Promise(setImmediate); assert(scheduled);
  controller.abort(); await assert.rejects(pending, e => e.name === 'AbortError');
  assert.equal(abortedCalls, 1); assert(cleared);
}
Promise.all([verifyRetries(), verifyPageLoading()]).then(() => console.log('OK: reintentos limitados, recuperación, errores definitivos, cancelación, horario semanal, filtros de Chile y valores anteriores.')).catch(e => { console.error(e); process.exitCode = 1; });


