// Regresión: formulario real de entregas, hook real y servicio REST real.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { test } = require('node:test'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const territory = require('../src/features/admin/data/chileTerritory.json');
const helperDependencies = name => name.includes('comunasChile') ? {
  comunasDeRegion: region => territory.find(r => r.nombre === region)?.provincias.flatMap(p => p.comunas) || [],
} : (() => { if (name.includes('shared/components/states')) return {LoadingState: 'LoadingState', ErrorState: 'ErrorState', EmptyListState: 'EmptyListState'}; if (name.includes('humanizeError')) return {humanizeAdminError: message => message}; throw Error(name); })();
function load(file, requireImpl, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('import.meta.env.VITE_API_URL', 'undefined');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: requireImpl, Error, AbortController, structuredClone, ...globals });
  return module.exports;
}
function nodes(tree, result = []) {
  if (Array.isArray(tree)) tree.forEach(n => nodes(n, result));
  else if (tree && typeof tree === 'object') { result.push(tree); if (typeof tree.type === 'function') nodes(tree.type(tree.props), result); else nodes(tree.props?.children, result); }
  else if (typeof tree === 'string') result.push(tree);
  return result;
}
const configuration = () => ({
  chilexpress: { enabled: true, accountId: '', apiKey: '', status: 'not_configured', tarifas: [{ region: 'Metropolitana', comuna: 'Providencia', monto: 4500, plazo_dias: 2 }] },
  starken: { enabled: false, accountId: '', apiKey: '', status: 'not_configured', tarifas: [] },
  pickup: { enabled: false, address: '', schedule: '' },
});
function server() {
  return { data: configuration(), calls: [], failGet: false, failPut: false, waitGet: null, addressConfigured: true,
    async fetch(url, options = {}) {
      this.calls.push({ url, options });
      if (url.includes('/retiro/direcciones/')) return { ok: true, json: async () => ({ exito: true, data: options.method === 'POST' ? [{region: 'Metropolitana de Santiago', comuna: 'Providencia', street: 'Avenida Providencia', number: '1234', reference: '', verification: 'fixture-proof'}] : {configured: this.addressConfigured} }) };
      if (options.method === 'PUT') {
        if (this.failPut) throw Error('Servidor no disponible');
        this.data = JSON.parse(options.body);
      } else {
        if (this.failGet) throw Error('Servidor no disponible');
        if (this.waitGet) await this.waitGet;
      }
      return { ok: true, json: async () => ({ exito: true, data: clone(this.data) }) };
    },
  };
}
function harness(s) {
  const setters = [];
  let states = [], refs = [], effects = [], cursor = 0, refCursor = 0, effectCursor = 0;
  let config = { shippingConfiguration: { ...configuration(), pickup: { enabled: true, address: 'Copia local antigua', schedule: 'Antiguo' } } };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], setters[i] ||= next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
    useRef(initial) { const i = refCursor++; refs[i] ??= { current: initial }; return refs[i]; },
    useCallback(fn) { const i = refCursor++; refs[i] ??= fn; return refs[i]; },
    useEffect(fn, deps) { const i = effectCursor++; effects[i] ??= {}; effects[i].next = { fn, deps }; },
  };
  const context = { useAdmin: () => ({ config, setConfig: next => { config = next; return true; } }) };
  const hook = load('src/features/admin/hooks/useAdminForm.ts', name => name === 'react' ? react : context);
  const fetch = s.fetch.bind(s);
  const service = load('src/features/storefront/services/shippingService.ts', name => {
    if (name.endsWith('/api')) return { API_BASE_URL: 'https://api.test' };
    if (name.includes('initialLoad')) return { fetchInitialLoad: fetch };
    if (name.includes('authService')) return { authService: { getToken: () => 'owner-token' } };
    if (name.includes('comunasChile')) return { nombreOficialRegion: n => n };
    if (name.includes('shared/components/states')) return {LoadingState: 'LoadingState', ErrorState: 'ErrorState', EmptyListState: 'EmptyListState'}; if (name.includes('humanizeError')) return {humanizeAdminError: message => message}; throw Error(name);
  }, { fetch });
  const helper = load('src/features/admin/services/pickupConfiguration.ts', helperDependencies);
  let editor;
  const dependencies = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name.includes('AdminContext')) return context;
    if (name.includes('useAdminForm')) return hook;
    if (name.includes('components/ui') || name === '../ui') return Object.fromEntries(['AdminCard', 'Alert', 'Input', 'Textarea', 'Select', 'Toggle', 'Button', 'Icon', 'Badge'].map(n => [n, n]));
    if (name.includes('shippingService')) return service;
    if (name.includes('pickupConfiguration')) return helper;
    if (name.includes('PickupEditor')) return editor;
    if (name.includes('TimePicker')) return load('src/shared/components/TimePicker.tsx', dependencies);
    if (name.includes('chileTerritory')) return { default: require('../src/features/admin/data/chileTerritory.json') };
    if (name.includes('comunasChile')) return { comunasDeRegion: () => [] };
    if (name.includes('shared/components/states')) return {LoadingState: 'LoadingState', ErrorState: 'ErrorState', EmptyListState: 'EmptyListState'}; if (name.includes('humanizeError')) return {humanizeAdminError: message => message}; throw Error(name);
  };
  editor = load('src/features/admin/components/shipping/PickupEditor.tsx', dependencies);
  const Shipping = load('src/features/admin/pages/Shipping.tsx', dependencies);
  function render() { cursor = refCursor = effectCursor = 0; const tree = nodes(Shipping.default());
    for (const e of effects) { const { fn, deps } = e.next; if (!e.deps || deps.some((v, i) => v !== e.deps[i])) { e.clean?.(); e.deps = deps; e.clean = fn(); } }
    return tree;
  }
  return { render, service,
    async settle() { let tree; for (let i = 0; i < 4; i++) { await new Promise(setImmediate); tree = render(); } return tree; },
    unmount() { effects.forEach(e => e.clean?.()); },
  };
}
const toggle = tree => tree.find(n => n.type === 'Toggle' && n.props.ariaLabel === 'Activar retiro en tienda');
const field = (tree, id) => tree.find(n => n.props?.id === id);
const save = tree => tree.find(n => n.type === 'Button' && n.props.children === 'Guardar entregas');
const same = (a, b) => assert.deepEqual(clone(a), clone(b));

const helper = load('src/features/admin/services/pickupConfiguration.ts', helperDependencies);
function validPickup() {
  const draft = helper.structuredPickup({ enabled: true, address: '', schedule: '' });
  draft.location = { region: 'Metropolitana de Santiago', comuna: 'Providencia', street: 'Avenida Providencia', number: '1234', reference: 'Local 2', verification: 'fixture-proof' };
  draft.hours.mon = { enabled: true, start: '09:00', end: '18:00' };
  return draft;
}

test('agrupa días no consecutivos, varios horarios y cerrados; valida intervalos', () => {
  const pickup = validPickup();
  for (const d of ['tue', 'fri']) pickup.hours[d] = { enabled: true, start: '09:00', end: '18:00' };
  for (const d of ['wed', 'thu']) pickup.hours[d] = { enabled: true, start: '10:00', end: '15:00' };
  pickup.hours.sat = { enabled: true, start: '10:00', end: '14:00' };
  const summary = helper.groupPickupHours(pickup.hours);
  assert.ok(summary.includes('Lunes, Martes, Viernes: 09:00 a 18:00'));
  assert.ok(summary.includes('Miércoles, Jueves: 10:00 a 15:00') && summary.includes('Domingo: cerrado'));
  same(helper.validatePickup(pickup), {});
  pickup.hours.mon.end = '08:00'; assert.ok(helper.validatePickup(pickup)['hours.mon.end']);
  pickup.hours.mon.start = ''; assert.ok(helper.validatePickup(pickup)['hours.mon.start']);
});

test('dirección incompleta/no verificada y días vacíos impiden activación; desactivado permite borradores', () => {
  const pickup = helper.structuredPickup({ enabled: true, address: '', schedule: '' });
  const errors = helper.validatePickup(pickup);
  assert.ok(errors['location.region'] && errors['location.comuna'] && errors['location.street'] && errors['location.verification'] && errors.hours);
  pickup.enabled = false; same(helper.validatePickup(pickup), {});
  const legacy = helper.structuredPickup({ enabled: false, address: 'Texto antiguo', schedule: 'Lun–Vie 9–18' });
  assert.equal(legacy.legacy_address, 'Texto antiguo'); assert.equal(legacy.legacy_schedule, 'Lun–Vie 9–18');
});

test('formulario usa selectores dependientes, siete checkboxes y horas; muestra errores por campo', async () => {
  const s = server(), h = harness(s); let tree = h.render();
  assert.equal(tree.find(n => n.type === 'fieldset').props.disabled, true);
  tree = await h.settle(); assert.ok(tree.includes('Retiro en tienda'));
  assert.equal(tree.filter(n => n.type === 'input' && n.props.type === 'checkbox').length, 7);
  assert.equal(field(tree, 'pickup-mon-start').type.name, 'TimePicker');
  assert.equal(field(tree, 'pickup-mon-start').props.disabled, true);
  toggle(tree).props.onChange(true); await save(h.render()).props.onClick(); tree = h.render();
  assert.ok(field(tree, 'pickup-region').props.error);
  field(tree, 'pickup-region').props.onChange({ target: { value: 'Metropolitana de Santiago' } }); tree = h.render();
  assert.equal(field(tree, 'pickup-comuna').props.value, '');
  assert.ok(!s.calls.some(c => c.options.method === 'PUT')); h.unmount();
});

test('busca sugerencias, selecciona ubicación y la edición invalida la constancia', async () => {
  const s = server(), h = harness(s); h.render(); let tree = await h.settle();
  for (const [id, value] of [['pickup-region', 'Metropolitana de Santiago'], ['pickup-comuna', 'Providencia'], ['pickup-street', 'Providencia'], ['pickup-number', '1234']]) {
    field(tree, id).props.onChange({ target: { value } }); tree = h.render();
  }
  await tree.find(n => n.type === 'Button' && n.props.children === 'Buscar dirección').props.onClick(); tree = await h.settle();
  const list = tree.find(n => n.type === 'ul' && n.props['aria-label'] === 'Direcciones sugeridas');
  nodes(list).find(n => n.type === 'Button').props.onClick(); tree = h.render();
  assert.ok(tree.includes('Dirección seleccionada y reconocida por el proveedor.'));
  field(tree, 'pickup-number').props.onChange({ target: { value: '9999' } }); tree = h.render();
  assert.ok(!tree.includes('Dirección seleccionada y reconocida por el proveedor.')); h.unmount();
});

test('guardar y recargar horarios y dirección conserva transportistas', async () => {
  const s = server(); s.data.pickup = validPickup();
  const carriers = clone({ chilexpress: s.data.chilexpress, starken: s.data.starken });
  const h = harness(s); h.render(); let tree = await h.settle();
  field(tree, 'pickup-mon-end').props.onChange('19:00'); await save(h.render()).props.onClick(); tree = await h.settle();
  assert.ok(tree.includes('Configuración de entregas guardada.'));
  same({ chilexpress: s.data.chilexpress, starken: s.data.starken }, carriers);
  assert.equal(s.data.pickup.hours.mon.end, '19:00');
  same((await h.service.getDeliveryAlternatives()).pickup, s.data.pickup);
  h.unmount(); const reload = harness(s); reload.render(); tree = await reload.settle();
  assert.equal(toggle(tree).props.checked, true);
  assert.equal(field(tree, 'pickup-street').props.value, 'Avenida Providencia');
  assert.equal(field(tree, 'pickup-mon-end').props.value, '19:00'); reload.unmount();
});

test('sin proveedor permite entrada manual y no ofrece una búsqueda ficticia', async () => {
  const s = server(); s.addressConfigured = false; const h = harness(s); h.render(); let tree = await h.settle();
  assert.ok(!tree.some(n => typeof n === 'string' && n.includes('Búsqueda externa no configurada')));
  assert.ok(field(tree, 'pickup-street') && field(tree, 'pickup-number'), 'la dirección manual sigue disponible');
  assert.ok(!tree.find(n => n.type === 'Button' && n.props.children === 'Reintentar comprobación'), 'sin fallo real no hay reintento');
  assert.ok(!tree.find(n => n.type === 'Button' && n.props.children === 'Buscar dirección'));
  await save(tree).props.onClick(); assert.ok(s.calls.some(c => c.options.method === 'PUT'));
  h.unmount();
});

test('dirección manual requiere número, campos completos, comuna coherente y horarios válidos', () => {
  const pickup = validPickup(); pickup.location.verification = ''; pickup.validation_method = 'unverified';
  same(helper.validatePickup(pickup, false), {});
  assert.ok(helper.validatePickup(pickup, true)['location.verification']);
  for (const key of ['region', 'comuna', 'street', 'number']) {
    const bad = clone(pickup); bad.location[key] = '   ';
    assert.ok(helper.validatePickup(bad, false)[`location.${key}`], key);
  }
  const incoherent = clone(pickup); incoherent.location.comuna = 'Valparaíso';
  assert.ok(helper.validatePickup(incoherent, false)['location.comuna']);
  pickup.hours.mon.end = '08:00'; assert.ok(helper.validatePickup(pickup, false)['hours.mon.end']);
  pickup.hours.mon.end = ''; assert.ok(helper.validatePickup(pickup, false)['hours.mon.end']);
  pickup.hours.mon.enabled = false; assert.ok(helper.validatePickup(pickup, false).hours);
});

test('sin proveedor, activar retiro manual, guardar y recargar conserva dirección y horario', async () => {
  const s = server(); s.addressConfigured = false; s.data.pickup = validPickup();
  s.data.pickup.enabled = false; s.data.pickup.location.verification = ''; s.data.pickup.validation_method = 'unverified';
  const carriers = clone({ chilexpress: s.data.chilexpress, starken: s.data.starken });
  const h = harness(s); h.render(); let tree = await h.settle();
  toggle(tree).props.onChange(true); await save(h.render()).props.onClick(); tree = await h.settle();
  assert.ok(tree.includes('Configuración de entregas guardada.'));
  assert.ok(tree.includes('Dirección ingresada manualmente; no verificada externamente.'));
  assert.ok(!tree.includes('Dirección seleccionada y reconocida por el proveedor.'));
  assert.equal(s.data.pickup.enabled, true);
  same({ chilexpress: s.data.chilexpress, starken: s.data.starken }, carriers);
  h.unmount(); const reload = harness(s); reload.render(); tree = await reload.settle();
  assert.equal(toggle(tree).props.checked, true); assert.equal(field(tree, 'pickup-number').props.value, '1234');
  assert.equal(field(tree, 'pickup-mon-end').props.value, '18:00'); reload.unmount();
});

test('con proveedor, una nueva entrada manual no se guarda sin selección', async () => {
  const s = server(); s.data.pickup = validPickup(); s.data.pickup.location.verification = '';
  const h = harness(s); h.render(); await h.settle(); await save(h.render()).props.onClick();
  assert.ok(!s.calls.some(c => c.options.method === 'PUT'));
  h.unmount();
});

test('constancia manual persistida se muestra manual aunque el proveedor se habilite luego', async () => {
  const s = server(); s.data.pickup = validPickup(); s.data.pickup.validation_method = 'manual';
  const h = harness(s); h.render(); const tree = await h.settle();
  assert.ok(tree.includes('Dirección ingresada manualmente; no verificada externamente.'));
  assert.ok(!tree.includes('Dirección seleccionada y reconocida por el proveedor.'));
  h.unmount();
});

test('desactivar conserva campos y horarios; errores de red no anuncian guardado', async () => {
  const s = server(); s.data.pickup = validPickup(); const h = harness(s); h.render(); let tree = await h.settle();
  toggle(tree).props.onChange(false); tree = h.render(); s.failPut = true;
  await save(tree).props.onClick(); tree = await h.settle(); assert.ok(!tree.includes('Configuración de entregas guardada.'));
  s.failPut = false; await save(tree).props.onClick(); await h.settle();
  assert.equal(s.data.pickup.enabled, false); assert.equal(s.data.pickup.hours.mon.start, '09:00');
  assert.equal(s.data.pickup.location.street, 'Avenida Providencia'); h.unmount();
});

test('fallo de carga bloquea guardado y permite reintentar', async () => {
  const s = server(); s.failGet = true; const h = harness(s); h.render(); let tree = await h.settle();
  assert.equal(tree.find(n => n.type === 'fieldset').props.disabled, true);
  await save(tree).props.onClick(); assert.ok(!s.calls.some(c => c.options.method === 'PUT'));
  s.failGet = false; tree.find(n => n.type === 'ErrorState' && n.props.retryLabel === 'Reintentar carga').props.onRetry();
  h.render(); tree = await h.settle(); assert.equal(tree.find(n => n.type === 'fieldset').props.disabled, false); h.unmount();
});
