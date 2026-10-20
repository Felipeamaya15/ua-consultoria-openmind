// Ejecutar desde frontend: node tests/visual-config.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const storage = new Map();
const events = [];
class TestCustomEvent extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } }
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  cache.set(file, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const req = id => {
    if (!id.startsWith('.')) throw Error(`Unexpected dependency: ${id}`);
    const target = path.resolve(path.dirname(file), id);
    return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'));
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: req, structuredClone, localStorage, window: { dispatchEvent: event => events.push(event.type) }, Event, CustomEvent: TestCustomEvent });
  cache.set(file, module.exports);
  return module.exports;
}
const { resolveVisualConfig: resolve, resolveVisualViewport: viewport, resolveStoreVisualConfig, mergeVisualOverrides, removeVisualOverride } = load('src/features/storefront/visual/resolveVisualConfig.ts');
const { VISUAL_DEFAULTS } = load('src/features/storefront/visual/defaults.ts');
const { VISUAL_PRESETS } = load('src/features/storefront/visual/presets.ts');
const { visualConfigToCssVariables: css } = load('src/features/storefront/visual/cssVariables.ts');
const { adminRepository: rawRepository } = load('src/features/admin/data/adminRepository.ts');
const storageApi = load('src/features/storefront/visual/storage.ts');
const identityA = { apiBaseUrl: 'https://api.example.test', storeId: '1' };
const identityB = { ...identityA, storeId: '2' };
const ADMIN_STORAGE_KEY = storageApi.getStoreConfigKey(identityA);
const repository = { load: () => rawRepository.load(identityA), save: config => rawRepository.save(config, identityA) };
const seed = (config, identity = identityA) => storage.set(storageApi.getStoreConfigKey(identity), JSON.stringify({ version: 1, identity, config }));
const { patchThemeCustomization, loadThemeCustomization } = load('src/features/admin/data/themeCustomization.ts');
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`OK ${name}`); }

test('global defaults produce a complete config', () => assert.deepEqual(plain(resolve()), plain(VISUAL_DEFAULTS)));
test('old colors and template remain compatible', () => {
  const value = resolve({ template: 'minimal', legacyColors: { primaryColor: '#123456', secondaryColor: '#abcdef', accentColor: '#fedcba' } });
  assert.equal(value.global.colors.primary, '#123456');
  assert.equal(value.global.colors.secondary, '#abcdef');
  assert.equal(value.global.colors.accent, '#fedcba');
  assert.equal(value.global.radius, 28);
});
test('template preset applies layout, spacing, hero, card and footer', () => {
  const value = resolve({ template: 'visual' });
  assert.equal(value.header.layout, 'split'); assert.equal(value.global.radius, 0);
  assert.equal(value.hero.height, 760); assert.equal(value.productCard.titleSize, 20);
  assert.equal(value.sections.featured.paddingY, 96); assert.equal(value.footer.padding, 80);
});
test('store overrides win over preset and legacy colors', () => {
  const value = resolve({ template: 'minimal', legacyColors: { primaryColor: '#123456' }, customization: { global: { radius: 9, colors: { primary: '#654321' } }, header: { height: 100 } } });
  assert.equal(value.global.radius, 9); assert.equal(value.global.colors.primary, '#654321'); assert.equal(value.header.height, 100);
});
test('template overrides win over store-wide overrides', () => {
  const value = resolve({ template: 'minimal', customization: { productCard: { radius: 11, padding: 22 } }, templateCustomization: { productCard: { radius: 7 } } });
  assert.equal(value.productCard.radius, 7); assert.equal(value.productCard.padding, 22);
});
test('deep partial fields preserve siblings', () => {
  const value = resolve({ customization: { productGrid: { columns: { mobile: 2 } }, header: { border: { width: 2 } } } });
  assert.equal(value.productGrid.columns.mobile, 2); assert.equal(value.productGrid.columns.desktop, 4);
  assert.equal(value.header.border.width, 2); assert.equal(value.header.border.color, VISUAL_DEFAULTS.header.border.color);
});
test('zero is preserved for radius, gap, padding, height, border and opacity', () => {
  const value = resolve({ customization: { global: { radius: 0, baseSpacing: 0 }, topBar: { height: 0 }, hero: { overlayOpacity: 0, gap: 0 }, productCard: { padding: 0, border: { width: 0 } } } });
  for (const result of [value.global.radius, value.global.baseSpacing, value.topBar.height, value.hero.overlayOpacity, value.hero.gap, value.productCard.padding, value.productCard.border.width]) assert.equal(result, 0);
});
test('valid false remains false while institutional visibility stays mandatory', () => {
  const value = resolve({ customization: { topBar: { visible: false }, hero: { overlay: false }, productCard: { buttonVisible: false, buttonFullWidth: false }, footer: { brandingVisible: false, showTitles: false } } });
  assert.equal(value.topBar.visible, false); assert.equal(value.hero.overlay, false); assert.equal(value.productCard.buttonVisible, false);
  assert.equal(value.productCard.buttonFullWidth, false); assert.equal(value.footer.brandingVisible, true); assert.equal(value.footer.showTitles, false);
});
test('unknown fields and prototype keys are ignored', () => {
  const value = resolve({ template: '__proto__', customization: JSON.parse('{"__proto__":{"polluted":true},"unknown":{"x":1},"hero":{"future":true}}') });
  assert.equal(value.unknown, undefined); assert.equal(value.hero.future, undefined); assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(value, '__proto__'), false);
  assert.deepEqual(plain(value), plain(resolve()));
});
test('invalid data never replaces known defaults', () => {
  const value = resolve({ customization: { header: null, hero: { overlayOpacity: 5, titleSize: '100px', horizontalAlign: 'middle' }, productGrid: { columns: { mobile: 0, tablet: -1, desktop: 1.5 } }, productCard: { radius: NaN, padding: Infinity, buttonVisible: 0, imageRatio: 0 }, categories: { columns: 0 }, global: { colors: { primary: 'url(javascript:bad)' } } } });
  assert.deepEqual(plain(value), plain(resolve()));
  for (const customization of [null, false, [], 'invalid']) assert.deepEqual(plain(resolve({ customization })), plain(resolve()));
});
test('future config version is safely ignored', () => assert.deepEqual(plain(resolve({ customization: { version: 99, global: { radius: 444 } } })), plain(resolve())));
test('all four presets produce complete and distinct styles', () => {
  const values = Object.keys(VISUAL_PRESETS).map(template => resolve({ template }));
  assert.equal(new Set(values.map(value => JSON.stringify(css(value)))).size, 4);
  for (const value of values) { assert(value.catalog.card); assert(value.contact.border); assert(value.location); assert(value.sections.benefits); assert.equal(value.version, 1); }
});
test('resolving does not mutate defaults, presets or input', () => {
  const beforeDefaults = plain(VISUAL_DEFAULTS), beforePresets = plain(VISUAL_PRESETS);
  const input = { productCard: { radius: 9 } }, beforeInput = plain(input);
  const value = resolve({ template: 'minimal', customization: input });
  value.productCard.radius = 55; value.contact.border.width = 99; value.responsive.tablet.hero.titleSize = 100;
  assert.deepEqual(plain(VISUAL_DEFAULTS), beforeDefaults); assert.deepEqual(plain(VISUAL_PRESETS), beforePresets); assert.deepEqual(input, beforeInput);
  assert.equal(resolve({ template: 'minimal', customization: input }).productCard.radius, 9);
  assert.equal(value.info.border.width, 1); // No shared nested references.
});
test('responsive overrides cascade desktop → tablet → mobile', () => {
  const value = resolve({ customization: { header: { height: 90 }, responsive: { tablet: { header: { height: 75, shadow: 'soft' } }, mobile: { header: { height: 50 } } } } });
  assert.equal(viewport(value, 'desktop').header.height, 90); assert.equal(viewport(value, 'tablet').header.height, 75);
  assert.equal(viewport(value, 'mobile').header.height, 50); assert.equal(viewport(value, 'mobile').header.shadow, 'soft');
});
test('partial breakpoint data does not freeze desktop changes', () => {
  const value = resolve({ customization: { footer: { padding: 99 }, responsive: { mobile: { hero: { gap: 0 } } } } });
  assert.equal(viewport(value, 'mobile').footer.padding, 99); assert.equal(viewport(value, 'mobile').hero.gap, 0);
});
test('responsive rejects invalid values and preserves valid false/zero', () => {
  const value = resolve({ customization: { responsive: { tablet: { topBar: { visible: false }, productCard: { padding: 0 } }, mobile: { header: { layout: 'broken' }, hero: { overlayOpacity: -1 } } } } });
  assert.equal(viewport(value, 'mobile').topBar.visible, false); assert.equal(viewport(value, 'mobile').productCard.padding, 0);
  assert.equal(viewport(value, 'mobile').header.layout, 'inline'); assert.equal(viewport(value, 'mobile').hero.overlayOpacity, 0.35);
});
test('CSS bridge provides responsive colors, visibility and grid counts', () => {
  const value = css(resolve({ template: 'minimal', customization: { topBar: { visible: false }, responsive: { mobile: { global: { colors: { primary: '#123456' } } } } } }));
  assert.equal(value['--visual-topbar-display-desktop'], 'none'); assert.equal(value['--primary-desktop'], '#5433eb'); assert.equal(value['--primary-mobile'], '#123456');
  assert.equal(value['--visual-grid-columns-desktop'], '4'); assert.equal(value['--visual-grid-columns-tablet'], '2'); assert.equal(value['--visual-grid-columns-mobile'], '1');
});
test('catalog grid and card overrides are independent of landing', () => {
  const value = resolve({ customization: { catalog: { grid: { columns: { desktop: 6 }, gapX: 0 }, card: { radius: 0, buttonVisible: false } } } });
  const vars = css(value);
  assert.equal(vars['--visual-catalog-grid-columns-desktop'], '6'); assert.equal(vars['--visual-catalog-grid-gap-x-desktop'], '0px');
  assert.equal(vars['--visual-catalog-card-radius-desktop'], '0px'); assert.equal(vars['--visual-catalog-card-button-display-desktop'], 'none');
  assert.equal(vars['--visual-card-button-display-desktop'], 'inline-flex');
});
test('legacy persisted colors with no themeEditor survive admin hydration', () => {
  seed({ template: 'minimal', primaryColor: '#123456', secondaryColor: '#abcdef', accentColor: '#fedcba' });
  const value = repository.load();
  assert.equal(value.themeEditor.minimal.primaryColor, '#123456'); assert.equal(value.themeEditor.minimal.images && Object.keys(value.themeEditor.minimal.images).length, 0);
});
test('partial themes get defaults without losing overrides or images', () => {
  seed({ primaryColor: '#123456', themeEditor: { minimal: { accentColor: '#fedcba', visualConfig: { hero: { gap: 0 } }, images: { 'image-1': { src: '/custom.png', radius: 0 } } } } });
  const value = repository.load();
  assert.equal(value.themeEditor.minimal.primaryColor, '#123456'); assert.equal(value.themeEditor.minimal.accentColor, '#fedcba');
  assert.equal(value.themeEditor.minimal.visualConfig.hero.gap, 0); assert.equal(value.themeEditor.minimal.images['image-1'].src, '/custom.png');
  assert(value.themeEditor.catalog);
});
test('store and template overrides round trip in existing v1 storage', () => {
  const value = repository.load();
  value.visualConfig = { version: 1, topBar: { visible: false } };
  value.themeEditor.minimal.visualConfig = { productCard: { radius: 0 }, futureField: { keep: true } };
  repository.save(value);
  const saved = JSON.parse(storage.get(ADMIN_STORAGE_KEY));
  assert.equal(saved.version, 1); assert.deepEqual(saved.config.visualConfig, plain(value.visualConfig));
  assert.deepEqual(plain(repository.load().themeEditor.minimal.visualConfig), plain(value.themeEditor.minimal.visualConfig));
  assert(events.includes('ua-store-config-changed'));
});
test('color editing preserves section settings, images, false and zero', () => {
  const theme = loadThemeCustomization('minimal', { images: { 'image-1': { src: '/test.png', radius: 0 } }, visualConfig: { hero: { gap: 0 }, topBar: { visible: false }, global: { colors: { primary: '#000000' } } } });
  const edited = patchThemeCustomization(theme, { primaryColor: '#123456' });
  assert.equal(edited.visualConfig.global.colors.primary, '#123456'); assert.equal(edited.visualConfig.hero.gap, 0); assert.equal(edited.visualConfig.topBar.visible, false);
  assert.equal(edited.images['image-1'].src, '/test.png'); assert.equal(theme.visualConfig.global.colors.primary, '#000000');
  assert.equal(resolve({ template: 'minimal', legacyColors: edited, templateCustomization: edited.visualConfig }).global.colors.primary, '#123456');
});
test('color editing can override store-wide visual colors', () => {
  const global = { global: { colors: { primary: '#000000' } } };
  const theme = loadThemeCustomization('minimal', {}, undefined, global);
  assert.equal(theme.primaryColor, '#000000');
  const edited = patchThemeCustomization(theme, { primaryColor: '#123456' });
  assert.equal(edited.visualConfig.version, 1);
  assert.equal(resolve({ template: 'minimal', customization: global, legacyColors: edited, templateCustomization: edited.visualConfig }).global.colors.primary, '#123456');
});
test('hydration displays effective section colors in the existing editor', () => {
  const theme = loadThemeCustomization('minimal', { primaryColor: '#ffffff', visualConfig: { global: { colors: { primary: '#123456' } } } });
  assert.equal(theme.primaryColor, '#123456');
});
test('StoreContext resolves routes, legacy data and live storage updates', () => {
  const jsx = (type, props) => ({ type, props });
  const slots = [], effects = [], listeners = new Map();
  let index = 0, pathname = '/plantilla/2/catalogo';
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/storefront/context/StoreContext.tsx'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const fakeReact = {
    createContext: value => ({ Provider: 'Provider', value }),
    useContext: context => context.value,
    useMemo: fn => fn(),
    useState: initial => { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }]; },
    useEffect: effect => effects.push(effect),
    useCallback: fn => fn,
  };
  const req = id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'react') return fakeReact;
    if (id === 'react-router-dom') return { useLocation: () => ({ pathname }) };
    if (id.includes('catalogService')) return { fetchPublicProducts: async () => [] };
    if (id.includes('landingService')) return { fetchLandingConfig: async () => null };
    if (id.includes('storeInformationService')) return { fetchStoreInformation: async () => ({ nombre: 'Tienda', descripcion: '' }), STORE_INFORMATION_CHANGED: 'test-store-information' };
    if (id.includes('legalService')) return { legalService: { fetchPublicLegalPages: async () => ({}) } };

    if (id.includes('StoreIdentityContext')) return { useStoreIdentity: () => ({ identity: identityA }) };
    return load(path.resolve(root, 'src/features/storefront/context', id + '.ts'));
  };
  const image = { src: '/original.png', style: { objectPosition: '20% 30%', transform: 'rotate(5deg)', transformOrigin: '', borderRadius: '2px' }, hasAttribute: () => false, closest: () => null,
    getAttribute() { return this.src; }, setAttribute(_key, value) { this.src = value; }, removeAttribute() { this.src = ''; } };
  const document = { querySelectorAll: () => [image], get documentElement() { throw Error('Theme must never mutate documentElement'); }, body: {} };
  let disconnected = 0;
  vm.runInNewContext(code, { module, exports: module.exports, require: req, localStorage, document, AbortController, CustomEvent: TestCustomEvent, window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }, MutationObserver: class { observe() {} disconnect() { disconnected++; } } });
  const render = () => { index = 0; effects.length = 0; return module.exports.StoreProvider({ children: 'store' }).props.value; };
  seed({ template: 'catalog', primaryColor: '#123456', visualConfig: { hero: { gap: 0 } }, themeEditor: { minimal: { images: { 'image-0': { src: '/custom.png', scale: 150, x: 0, radius: 0 } } } } });
  let value = render();
  assert.equal(value.visualConfig.global.radius, 28); assert.equal(value.config.primaryColor, '#123456'); assert.equal(value.visualConfig.hero.gap, 0);
  const cleanupStorage = effects[0]();
  const cleanupImages = effects[effects.length - 1]();
  assert.equal(image.src, '/custom.png'); assert.equal(image.style.transform, 'scale(1.5)'); assert.equal(image.style.objectPosition, '0% 50%');
  seed({ themeEditor: { minimal: { visualConfig: { topBar: { visible: false }, productCard: { radius: 0 } } } } });
  listeners.get('ua-store-config-changed')(new TestCustomEvent('ua-store-config-changed', { detail: { storageKey: ADMIN_STORAGE_KEY } }));
  value = render();
  assert.equal(slots[0], 1); assert.equal(value.visualConfig.topBar.visible, false); assert.equal(value.visualConfig.productCard.radius, 0);
  pathname = '/plantilla/4'; value = render();
  assert.equal(value.visualConfig.global.colors.background, '#050505'); assert.equal(value.visualConfig.topBar.visible, true);
  assert.equal(value.visualConfig.productCard.radius, 14);
  listeners.get('ua-store-config-changed')(new TestCustomEvent('ua-store-config-changed', { detail: { storageKey: storageApi.getStoreConfigKey(identityB) } }));
  assert.equal(slots[0], 1); // Other stores do not invalidate this provider.
  cleanupImages(); cleanupStorage();
  assert.equal(image.src, '/original.png'); assert.equal(image.style.transform, 'rotate(5deg)'); assert.equal(image.style.objectPosition, '20% 30%');
  assert.equal(disconnected, 1); assert.equal(listeners.size, 0);
});
test('malformed storage returns defaults without throwing', () => {
  storage.set(ADMIN_STORAGE_KEY, '{bad json'); assert.equal(repository.load().template, 'editorial');
});
test('partial editor updates deep merge and preserve sibling overrides', () => {
  const old = { hero: { overlay: false, titleSize: 88 }, heroCta: { radius: 18, paddingX: 40 }, productCard: { padding: 22, radius: 20 }, responsive: { mobile: { hero: { titleSize: 32, gap: 5 } } } };
  const merged = mergeVisualOverrides(old, { heroCta: { radius: 0 }, productCard: { radius: 0 }, responsive: { mobile: { hero: { gap: 0 } } } });
  assert.equal(merged.hero.overlay, false); assert.equal(merged.hero.titleSize, 88);
  assert.equal(merged.heroCta.radius, 0); assert.equal(merged.heroCta.paddingX, 40);
  assert.equal(merged.productCard.radius, 0); assert.equal(merged.productCard.padding, 22);
  assert.equal(merged.responsive.mobile.hero.titleSize, 32); assert.equal(merged.responsive.mobile.hero.gap, 0);
  assert.equal(merged.footer, undefined); assert.equal(old.heroCta.radius, 18);
  const edited = patchThemeCustomization(loadThemeCustomization('minimal', { visualConfig: old }), { visualConfig: { productCard: { radius: 0 } } });
  assert.equal(edited.visualConfig.productCard.padding, 22); assert.equal(edited.visualConfig.hero.overlay, false);
});
test('resetting an override restores inheritance without losing siblings', () => {
  const original = { productCard: { radius: 0, padding: 22 }, topBar: { visible: false } };
  const reset = removeVisualOverride(original, ['productCard', 'radius']);
  assert.equal(reset.productCard.radius, undefined); assert.equal(original.productCard.radius, 0);
  const value = resolve({ template: 'minimal', customization: reset });
  assert.equal(value.productCard.radius, 20); assert.equal(value.productCard.padding, 22); assert.equal(value.topBar.visible, false);
  assert.equal(removeVisualOverride(reset, ['productCard', 'padding']).productCard, undefined);
});
test('two stores on the same API are isolated across read and save', () => {
  seed({ name: 'A', visualConfig: { topBar: { visible: false }, productCard: { radius: 0 } } }, identityA);
  seed({ name: 'B', visualConfig: { productCard: { radius: 30 } } }, identityB);
  assert.notEqual(storageApi.getStoreConfigKey(identityA), storageApi.getStoreConfigKey(identityB));
  const a = rawRepository.load(identityA), b = rawRepository.load(identityB);
  assert.equal(a.name, 'A'); assert.equal(b.name, 'B');
  assert.equal(a.visualConfig.productCard.radius, 0); assert.equal(b.visualConfig.productCard.radius, 30);
  a.name = 'A edited'; rawRepository.save(a, identityA);
  assert.equal(rawRepository.load(identityB).name, 'B');
  assert.equal(resolveStoreVisualConfig(storageApi.readStoredStoreConfig(identityB), 'minimal').topBar.visible, true);
});
test('API installations and envelopes cannot share a store namespace', () => {
  const otherApi = { apiBaseUrl: 'https://other.example.test', storeId: '1' };
  assert.notEqual(storageApi.getStoreConfigKey(identityA), storageApi.getStoreConfigKey(otherApi));
  assert.deepEqual(plain(storageApi.readStoredStoreConfig(otherApi)), {});
  storage.set(ADMIN_STORAGE_KEY, JSON.stringify({ version: 1, identity: identityB, config: { name: 'B secret' } }));
  assert.deepEqual(plain(storageApi.readStoredStoreConfig(identityA)), {});
});
test('unidentified v1 data is preserved without being assigned to any store', () => {
  storage.delete(ADMIN_STORAGE_KEY);
  storage.delete(storageApi.getStoreConfigKey(identityB));
  const legacy = JSON.stringify({ version: 1, config: { name: 'Unknown owner', primaryColor: '#123456' } });
  storage.set(storageApi.STORE_CONFIG_STORAGE_KEY, legacy);
  assert.deepEqual(plain(storageApi.readStoredStoreConfig(identityA)), {});
  assert.deepEqual(plain(storageApi.readStoredStoreConfig(identityB)), {});
  assert.equal(storage.get(storageApi.STORE_CONFIG_STORAGE_KEY), legacy);
});
test('identity-tagged legacy v1 remains compatible and saves into its own key', () => {
  storage.delete(ADMIN_STORAGE_KEY);
  storage.set(storageApi.STORE_CONFIG_STORAGE_KEY, JSON.stringify({ version: 1, identity: identityA, config: { primaryColor: '#123456' } }));
  assert.equal(repository.load().themeEditor.minimal.primaryColor, '#123456');
  repository.save(repository.load());
  assert.equal(JSON.parse(storage.get(ADMIN_STORAGE_KEY)).identity.storeId, '1');
  assert.notEqual(rawRepository.load(identityB).themeEditor.minimal.primaryColor, '#123456');
});
test('unknown identity never reads or saves local customizations', () => {
  assert.deepEqual(plain(storageApi.readStoredStoreConfig(null)), {});
  assert.equal(rawRepository.load(null).themeEditor.minimal.primaryColor, '#5433eb');
  assert.throws(() => rawRepository.save(repository.load(), null), /identidad/);
});
test('corrupt scoped data never falls back to unidentified global data', () => {
  storage.set(ADMIN_STORAGE_KEY, '{broken');
  storage.set(storageApi.STORE_CONFIG_STORAGE_KEY, JSON.stringify({ version: 1, config: { name: 'Other store' } }));
  assert.notEqual(repository.load().name, 'Other store');
  assert.equal(repository.load().themeEditor.minimal.primaryColor, '#5433eb');
});
test('image and template saves do not freeze effective preset colors or sections', () => {
  seed({});
  const value = repository.load(); value.template = 'minimal';
  value.themeEditor.minimal.images['image-1'] = { src: '/custom.png', radius: 0, scale: 100, x: 50, y: 50 };
  repository.save(value);
  const persisted = JSON.parse(storage.get(ADMIN_STORAGE_KEY)).config;
  assert.equal(persisted.primaryColor, undefined); assert.equal(persisted.visualConfig, undefined);
  assert.equal(persisted.themeEditor.minimal.primaryColor, undefined); assert.equal(persisted.themeEditor.minimal.visualConfig, undefined);
  assert.equal(persisted.themeEditor.visual, undefined);
  const old = VISUAL_PRESETS.minimal.config.global.colors.primary;
  try {
    VISUAL_PRESETS.minimal.config.global.colors.primary = '#112233';
    assert.equal(repository.load().themeEditor.minimal.primaryColor, '#112233');
    assert.equal(resolveStoreVisualConfig(storageApi.readStoredStoreConfig(identityA), 'minimal').global.colors.primary, '#112233');
  } finally { VISUAL_PRESETS.minimal.config.global.colors.primary = old; }
});
test('changing presets and their defaults preserves explicit overrides', () => {
  seed({ template: 'minimal', visualConfig: { productCard: { padding: 0 }, topBar: { visible: false } }, themeEditor: { minimal: { visualConfig: { heroCta: { radius: 0 } } } } });
  const value = repository.load(); value.template = 'visual'; repository.save(value);
  const raw = storageApi.readStoredStoreConfig(identityA);
  assert.equal(resolveStoreVisualConfig(raw, 'visual').productCard.radius, 10);
  assert.equal(resolveStoreVisualConfig(raw, 'minimal').heroCta.radius, 0);
  assert.equal(resolveStoreVisualConfig(raw, 'visual').productCard.padding, 0);
  const old = VISUAL_PRESETS.visual.config.productCard.radius;
  try {
    VISUAL_PRESETS.visual.config.productCard.radius = 25;
    assert.equal(resolveStoreVisualConfig(raw, 'visual').productCard.radius, 25);
    assert.equal(resolveStoreVisualConfig(raw, 'visual').topBar.visible, false);
  } finally { VISUAL_PRESETS.visual.config.productCard.radius = old; }
});
test('template color changes do not contaminate other templates or duplicate legacy colors', () => {
  seed({}); const value = repository.load();
  value.themeEditor.minimal = patchThemeCustomization(value.themeEditor.minimal, { primaryColor: '#123456' });
  repository.save(value);
  const raw = storageApi.readStoredStoreConfig(identityA);
  assert.equal(raw.primaryColor, undefined); assert.equal(raw.themeEditor.minimal.primaryColor, undefined);
  assert.equal(resolveStoreVisualConfig(raw, 'minimal').global.colors.primary, '#123456');
  assert.equal(resolveStoreVisualConfig(raw, 'visual').global.colors.primary, '#111111');
});
test('valid empty image source and palette names survive hydration and save', () => {
  seed({ themeEditor: { minimal: { paletteName: '', images: { 'image-1': { src: '', scale: 0, radius: 0 } } } } });
  const value = repository.load();
  assert.equal(value.themeEditor.minimal.paletteName, ''); assert.equal(value.themeEditor.minimal.images['image-1'].src, '');
  assert.equal(value.themeEditor.minimal.images['image-1'].scale, 0); assert.equal(value.themeEditor.minimal.images['image-1'].x, 50);
  repository.save(value); assert.equal(repository.load().themeEditor.minimal.paletteName, '');
  assert.equal(resolve({ customization: { global: { colors: { primary: '' } } } }).global.colors.primary, '#1a3a6b');
});
test('SSR and denied storage safely return defaults without touching window', () => {
  const file = 'src/features/storefront/visual/storage.ts';
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const globals = { module, exports: module.exports, require: () => load('src/features/storefront/visual/resolveVisualConfig.ts') };
  vm.runInNewContext(code, globals);
  assert.deepEqual(plain(module.exports.readStoredStoreConfig(identityA)), {});
  assert.throws(() => module.exports.saveStoredStoreConfig({}, identityA), /almacenamiento/);
  const denied = { module: { exports: {} }, require: globals.require };
  denied.exports = denied.module.exports;
  Object.defineProperty(denied, 'localStorage', { get() { throw Error('Denied'); } });
  vm.runInNewContext(code, denied);
  assert.deepEqual(plain(denied.module.exports.readStoredStoreConfig(identityA)), {});
});
test('CSS variables are valid strings, consistently named and preserve line clamp', () => {
  const stylesheet = fs.readFileSync(path.join(root, 'src/styles/visual-config.css'), 'utf8');
  for (const template of Object.keys(VISUAL_PRESETS)) {
    const vars = css(resolve({ template }));
    for (const [key, value] of Object.entries(vars)) {
      assert(/^--[a-z-]+-(desktop|tablet|mobile)$/.test(key)); assert.equal(typeof value, 'string');
      assert(value.length); assert(!/undefined|NaN|Infinity/.test(value)); assert(stylesheet.includes(`var(${key})`));
    }
  }
  assert.equal(css(resolve({ template: 'visual' }))['--visual-card-description-display-mobile'], '-webkit-box');
});
test('legacy image normalization rejects invalid values and preserves valid zero', () => {
  const { readThemeImages } = load('src/features/storefront/visual/imageSettings.ts');
  const images = readThemeImages({ 'image-0': { src: 42, scale: NaN, x: 300, y: 0, radius: 0 }, 'image-1': null, invalid: {} });
  assert.deepEqual(plain(images['image-0']), { src: '', scale: 100, x: 50, y: 0, radius: 0 });
  assert.equal(images['image-1'], undefined); assert.equal(images.invalid, undefined);
});
test('preview variables survive asynchronous updates and observers disconnect', () => {
  const { connectVisualPreview } = load('src/features/admin/visualEditor/preview.ts');
  const styles = new Map(); let callback, disconnected = 0;
  const doc = { body: {}, head: { appendChild: node => styles.set(node.id, node) }, createElement: () => ({ textContent: '', remove() { styles.delete(this.id); } }), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, removeEventListener() {}, defaultView: { MutationObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() { disconnected++; } } } };
  const connection = connectVisualPreview(doc, () => {}, () => {});
  connection.update(resolve({ customization: { global: { colors: { primary: '#123456' } } } }), {});
  callback();
  assert(styles.get('ua-theme-preview-vars').textContent.includes('--primary-desktop:#123456!important;'));
  assert.equal(styles.size, 2);
  connection.disconnect(); assert.equal(disconnected, 1); assert.equal(styles.size, 0);
});
test('checkout preferences follow store identity and preserve false', () => {
  const { readCheckoutAuthSettings } = load('src/features/storefront/services/storePreferences.ts');
  seed({ authenticationConfiguration: { emailPassword: false, google: false, guestCheckout: false }, requiresAuth: 'required' }, identityA);
  seed({ authenticationConfiguration: { emailPassword: true, google: false, guestCheckout: true }, requiresAuth: 'none' }, identityB);
  const a = readCheckoutAuthSettings(identityA), b = readCheckoutAuthSettings(identityB);
  assert.equal(a.guestCheckout, false); assert.equal(a.emailPassword, false); assert.equal(a.requiresAuth, 'required');
  assert.equal(b.guestCheckout, true); assert.equal(b.requiresAuth, 'none');
  assert.equal(readCheckoutAuthSettings(null).guestCheckout, true);
});
test('StoreProvider and StoreVisualRoot render in SSR without browser globals', () => {
  const React = require('react'), ReactDOMServer = require('react-dom/server');
  const loaded = new Map();
  function moduleFor(file) {
    file = path.relative(root, path.resolve(root, file));
    if (loaded.has(file)) return loaded.get(file);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} };
    const req = id => {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return require(id);
      if (id === 'react-router-dom') return { useLocation: () => ({ pathname: '/plantilla/2' }) };
      if (id.includes('StoreIdentityContext')) return { useStoreIdentity: () => ({ identity: null }) };
      if (id.includes('catalogService')) return { fetchPublicProducts: () => { throw Error('SSR must not fetch catalog'); } };
      if (id.includes('landingService')) return { fetchLandingConfig: () => { throw Error('SSR must not fetch landing'); } };
      if (id.includes('legalService')) return { legalService: { fetchPublicLegalPages: () => { throw Error('SSR must not fetch legal'); } } };
      const target = path.resolve(path.dirname(path.join(root, file)), id);
      if (fs.existsSync(target + '.tsx')) return moduleFor(path.relative(root, target + '.tsx'));
      if (id.endsWith('/storeInformationService')) return { fetchStoreInformation: async () => ({ nombre: 'Tienda', descripcion: '' }), STORE_INFORMATION_CHANGED: 'test-store-information' };
      return load(target + '.ts');
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: req });
    loaded.set(file, module.exports); return module.exports;
  }
  const { StoreProvider } = moduleFor('src/features/storefront/context/StoreContext.tsx');
  const { StoreVisualRoot } = moduleFor('src/features/storefront/components/store/StoreVisualRoot.tsx');
  const markup = ReactDOMServer.renderToString(React.createElement(StoreProvider, {}, React.createElement(StoreVisualRoot, { className: 'template-minimal' }, 'Store')));
  assert(markup.includes('data-storefront-visual')); assert(markup.includes('--primary-desktop:#5433eb'));
  assert.equal((markup.match(/data-storefront-visual/g) || []).length, 1); assert(!/undefined|NaN/.test(markup));
});

async function verifyIdentityService() {
  let response, requested;
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/storefront/services/storeIdentityService.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => {
    if (id.endsWith('/api')) return { API_BASE_URL: identityA.apiBaseUrl };
    if (id.includes('initialLoad')) return { fetchInitialLoad: async (url, options) => { requested = { url, options }; return response; } };
    return load('src/features/storefront/visual/resolveVisualConfig.ts');
  } });
  const fetchIdentity = module.exports.fetchStoreIdentity;
  response = { ok: true, json: async () => ({ exito: true, data: { tienda_id: 1, plantilla_seleccionada: '' } }) };
  const controller = new AbortController();
  assert.deepEqual(plain(await fetchIdentity(controller.signal)), identityA);
  assert.equal(requested.url, `${identityA.apiBaseUrl}/api/visual-config/plantilla-seleccionada/`);
  assert.equal(requested.options.signal, controller.signal); assert.equal(requested.options.retry, true);
  console.log('OK identity service validates public backend identity'); passed++;
  for (const id of [undefined, null, false, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '01', '../2']) {
    response = { ok: true, json: async () => ({ exito: true, data: { tienda_id: id } }) };
    await assert.rejects(fetchIdentity());
  }
  console.log('OK missing, invalid and unsafe store IDs are rejected'); passed++;
  response = { ok: false, json: async () => ({ exito: false, data: { tienda_id: 2 } }) };
  await assert.rejects(fetchIdentity());
  console.log('OK identity failures never fall back to store 1'); passed++;
}
verifyIdentityService().then(() => console.log(`${passed} visual configuration tests passed.`)).catch(error => { console.error(error); process.exitCode = 1; });
