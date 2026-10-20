const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { test } = require('node:test'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const full = path.resolve(root, file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { structuredClone, module, exports: module.exports, require: id => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    const p = path.resolve(path.dirname(full), id);
    return load(['.ts', '.tsx'].map(ext => p + ext).find(fs.existsSync), mocks, globals);
  }, URL, AbortController, ...globals });
  return module.exports;
}
const domain = load('src/features/marketing/domain/content.ts');
const branding = load('src/features/marketing/domain/brand.ts');
const raw = () => ({ id: 'a'.repeat(24), nombre: 'Bolso Ñandú', categoria: 'Accesorios', activo: true, imagenes: ['/media/producto.png'], variantes: [
  { sku: 'BASIC', precio: 10000, stock: 2, atributos_variante: [{ etiqueta: 'Tamaño', valor: 'Pequeño' }] },
  { sku: 'OFFER', precio: 30000, precio_oferta: 20000, stock: 3, atributos_variante: [{ etiqueta: 'Tamaño', valor: 'Grande' }] },
  { sku: 'SOLD', precio: 100, precio_oferta: 1, stock: 0 },
  { sku: 'DISABLED', precio: 50, precio_oferta: 2, stock: 5, activo: false },
  { sku: 'LEGACY', precio: 60, precio_oferta: 3, stock: 5, es_activa: false },
] });
function service(globals = {}, overrides = {}) {
  return load('src/features/marketing/services/marketingService.ts', {
    '../../../api': { API_BASE_URL: 'http://api.test' }, '../../auth/services/authService': { authService: { getToken: () => 'owner-token' } },
    '../../storefront/services/storeInformationService': { fetchStoreInformation: async () => ({ nombre: 'Nombre real' }) },
    '../../landing/services/landingService': { fetchLandingConfig: async () => null }, ...overrides,
  }, globals);
}
const parser = service();
const product = data => parser.readMarketingProducts([data || raw()])[0];
test('fuente administrativa conserva imágenes, ID y flags de variantes; no crea precio ni foto', () => {
  const p = product();
  assert.equal(p.id, 'a'.repeat(24)); assert.equal(p.images[0], 'http://api.test/media/producto.png');
  assert.equal(p.variants[3].active, false); assert.equal(p.variants[4].active, false);
  const empty = product({ ...raw(), imagenes: [], variantes: [] });
  assert.equal(empty.images.length, 0); assert.equal(domain.buildPublication(empty, 'product'), null);
  assert.throws(() => parser.readMarketingProducts([{ id: 'demo', nombre: 'Ejemplo', activo: true }]), /catálogo/);
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.test/x', '']) assert.equal(parser.marketingImage(value), null);
});

test('la descripción opcional procede del mismo producto y no modifica datos comerciales', () => {
  const p = product({ ...raw(), descripcion: 'Descripción real <img src=x onerror=alert(1)>' });
  const before = JSON.stringify(p);
  assert.equal(domain.buildPublication(p, 'product').description, p.description);
  assert.equal(domain.buildPublication(p, 'promotion').description, p.description);
  assert.equal(domain.buildPublication(product({ ...raw(), descripcion: null }), 'product').description, '');
  assert.equal(JSON.stringify(p), before);
});
test('Desde considera solo variantes activas disponibles; original y oferta siempre de la misma variante', () => {
  const p = product(), before = JSON.stringify(p);
  const normal = domain.buildPublication(p, 'product');
  assert.equal(normal.price, 1000000); assert.equal(normal.fromPrice, true);
  assert.equal(normal.originalPrice, null); assert.equal(normal.discountLabel, null);
  const chosen = domain.buildPublication(p, 'product', 'OFFER');
  assert.equal(chosen.price, 2000000); assert.equal(chosen.originalPrice, 3000000);
  assert.equal(chosen.fromPrice, false); assert.equal(chosen.discountLabel, '33,33% menos');
  assert(chosen.variantLabel.includes('Grande')); assert.equal(JSON.stringify(p), before);
});
test('promociones solo desde ofertas disponibles: no códigos internos, ni campañas locales', () => {
  const p = product(), promo = domain.buildPublication(p, 'promotion');
  assert.equal(promo.price, 2000000); assert.equal(promo.fromPrice, false); assert(domain.hasRealOffer(p));
  assert.equal(domain.buildPublication(p, 'promotion', 'BASIC'), null);
  const noOffer = product({ ...raw(), variantes: [raw().variantes[0]] });
  assert.equal(domain.hasRealOffer(noOffer), false); assert.equal(domain.buildPublication(noOffer, 'promotion'), null);
});
test('inactivo, sin stock, sin variante activa o sin precio válido no anuncian disponibilidad', () => {
  const inactive = product({ ...raw(), activo: false });
  assert.equal(domain.buildPublication(inactive, 'product'), null); assert.match(domain.productProblem(inactive, 'product'), /inactivo/);
  for (const change of [{ stock: 0 }, { stock: -1 }, { stock: 1.5 }, { stock: '3' }, { activo: false }, { es_activa: false }]) {
    const p = product({ ...raw(), variantes: [{ sku: 'X', precio: 100, stock: 3, ...change }] });
    assert.equal(domain.buildPublication(p, 'product'), null);
  }
  for (const price of [null, undefined, -1, NaN, Infinity, '100', 1e20]) {
    const p = product({ ...raw(), variantes: [{ sku: 'X', precio: price, stock: 3 }] });
    assert.equal(domain.buildPublication(p, 'product'), null, String(price));
  }
});
test('ofertas inválidas no generan ahorro; precio cero válido, redondeo half-up y ahorro pequeño', () => {
  for (const offer of [-1, NaN, Infinity, 100, 150]) {
    assert.equal(domain.hasRealOffer(product({ ...raw(), variantes: [{ sku: 'X', precio: 100, precio_oferta: offer, stock: 2 }] })), false);
  }
  const zero = product({ ...raw(), variantes: [{ sku: 'X', precio: 0, stock: 2 }] });
  assert.equal(domain.buildPublication(zero, 'product').price, 0);
  assert.equal(domain.priceInCents(1.005), 101);
  assert.equal(domain.formatMarketingMoney(1234567850), '$12.345.678,50');
  const small = domain.buildPublication(product({ ...raw(), variantes: [{ sku: 'X', precio: 1000, precio_oferta: 999.99, stock: 2 }] }), 'promotion');
  assert.equal(small.discountLabel, 'Precio de oferta');
  const rounded = product({ ...raw(), variantes: [{ sku: 'X', precio: 1.004, precio_oferta: 1.003, stock: 2 }] });
  assert.equal(domain.hasRealOffer(rounded), false);
});
test('sin imagen usa composición tipográfica; búsqueda respeta acentos, categorías y SKU', () => {
  const p = product({ ...raw(), imagenes: [] });
  assert.equal(domain.buildPublication(p, 'product').image, null);
  assert.equal(domain.searchProducts([p], 'nandu').length, 1);
  assert.equal(domain.searchProducts([p], 'offer').length, 1);
  assert.equal(domain.searchProducts([p], 'otro').length, 0);
});
test('marca reutiliza nombre y logo de las fuentes existentes; sin logo o fallo parcial no inventa marca', async () => {
  assert.equal((await parser.fetchMarketingBrand()).name, 'Nombre real');
  assert.equal((await parser.fetchMarketingBrand()).logo, null);
  const partial = service({}, { '../../landing/services/landingService': { fetchLandingConfig: async () => { throw Error('fallo'); } } });
  const brand = await partial.fetchMarketingBrand(); assert.equal(brand.logo, null); assert(brand.warning);
  await assert.rejects(service({}, { '../../storefront/services/storeInformationService': { fetchStoreInformation: async () => { throw Error('fallo'); } } }).fetchMarketingBrand(), /nombre/);
});
test('colores hex y alpha se normalizan; el texto alcanza contraste WCAG AA', () => {
  const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  const lum = hex => [1, 3, 5].map(i => linear(parseInt(hex.slice(i, i + 2), 16) / 255)).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  for (const color of ['#fff', '#000', '#ff00a0', '#aabbcc', '#8c32', '#12345655', 'transparent', 'currentColor', 'url(bad)']) {
    const palette = branding.marketingPalette(color, color);
    const a = lum(palette.primary), b = lum(palette.onPrimary);
    assert((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, color);
  }
  assert.equal(branding.marketingPalette('#123456', '#abcdef').primary, '#123456');
});
test('endpoint autentica, cancela, evita caché y no envía identidad de tienda ni mutaciones', async () => {
  let request;
  const signal = new AbortController().signal;
  const api = service({ fetch: async (...args) => { request = args; return { ok: true, json: async () => ({ exito: true, data: [raw()] }) }; } });
  await api.fetchMarketingProducts(signal);
  assert.equal(request[0], 'http://api.test/api/catalog/productos/admin/listado/');
  assert.equal(request[1].headers.Authorization, 'Token owner-token'); assert.equal(request[1].signal, signal);
  assert.equal(request[1].cache, 'no-store'); assert.equal(request[1].method, undefined); assert.equal(request[1].body, undefined);
  await assert.rejects(service({ fetch: () => assert.fail('no consultar') }, { '../../auth/services/authService': { authService: { getToken: () => null } } }).fetchMarketingProducts(), /sesión/);
  for (const status of [401, 403, 500]) await assert.rejects(service({ fetch: async () => ({ ok: false, status }) }).fetchMarketingProducts());
  await assert.rejects(service({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).fetchMarketingProducts(), /conectar con tu catálogo/);
  await assert.rejects(service({ fetch: async () => ({ ok: true, json: async () => { throw Error('bad JSON'); } }) }).fetchMarketingProducts(), /respuesta del catálogo/);
});
test('preview renderiza tres formatos, precios reales y alcance de la oferta sin acciones futuras', () => {
  const { PublicationPreview } = load('src/features/marketing/components/PublicationPreview.tsx');
  const p = product(), content = domain.buildPublication(p, 'promotion');
  const brand = { name: 'Nombre real', logo: null, palette: branding.marketingPalette('#ffffff', '#fdebad') };
  for (const format of ['square', 'story', 'banner']) {
    const html = renderToStaticMarkup(React.createElement(PublicationPreview, { content, brand, design: { format, layout: 'product-spotlight' } }));
    assert(html.includes(`data-format="${format}"`)); assert(html.includes('20.000')); assert(html.includes('30.000'));
    assert(html.includes('en esta variante')); assert(html.includes('Nombre real')); assert(!/VERANO20|NUEVO5000|Descargar|Publicar en Instagram/.test(html));
  }
  const noImage = { ...content, image: null };
  assert(renderToStaticMarkup(React.createElement(PublicationPreview, { content: noImage, brand, design: { format: 'square', layout: 'product-spotlight' } })).includes('composición de texto'));
});
test('promociones sin fuente general mantienen explicación y vacío honesto', () => {
  const { ContentPicker } = load('src/features/marketing/components/ContentPicker.tsx', {
    '../../admin/components/ui': { Input: () => null, Select: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(ContentPicker, { catalogReady: true, source: 'promotion', products: [], productId: '', sku: '', onSource() {}, onProduct() {}, onSku() {} }));
  assert(html.includes('Promociones')); assert(html.includes('campañas generales aún no')); assert(html.includes('No hay ofertas'));
});
