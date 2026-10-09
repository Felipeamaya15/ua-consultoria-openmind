// Ejecutar desde frontend: node tests/storefront-variants.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('(import.meta as any).env.VITE_API_URL', '"http://test"');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, ...globals });
  return module.exports;
}
const raw = {
  id: '0123456789abcdef01234567', slug: 'qa-creacion-mongo', nombre: 'QA Creación MongoEditado', categoria: 'Ropa',
  imagenes: ['/polera.png'], variantes: [
    { sku: 'QA-PANT-M', precio: 100, precio_oferta: 80, stock: 7, atributos_variante: [{ clave: 'talla', etiqueta: 'Talla', valor: 'M' }] },
    { sku: 'QA-PANT-L', precio: 120, precio_oferta: null, stock: 8, atributos_variante: [{ clave: 'talla', etiqueta: 'Talla', valor: 'L' }] },
    { sku: 'QA-PANT-XL', precio: 150, stock: 0, atributos_variante: [{ clave: 'talla', etiqueta: 'Talla', valor: 'XL' }] },
  ],
};
const summary = { id: raw.id, slug: raw.slug, nombre: raw.nombre, categoria: 'Ropa', imagen: '/polera.png', precio: 100, precio_oferta: 80, disponible: true };
const response = data => ({ ok: true, status: 200, json: async () => ({ exito: true, data }) });
function walk(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  const children = node.props?.children;
  for (const child of (Array.isArray(children) ? children.flat(Infinity) : [children])) walk(child, predicate, result);
  return result;
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return (Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children]).map(text).join('');
}
function cardHarness(product, template = 'catalog', layout = 'grid') {
  const state = [];
  let cursor = 0;
  const cart = [];
  const jsx = (type, props) => ({ type, props });
  const card = load('src/features/storefront/components/store/ProductCard.tsx', {
    require: name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return { useState: initial => {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      } };
      if (name === 'react-router-dom') return { Link: 'Link' };
      if (name.includes('mockData')) return { formatPrice: value => `CLP ${value}` };
      if (name.includes('StockFeedback')) return { StockFeedback: 'StockFeedback' };
      if (name.includes('CartContext')) return { useCart: () => ({ items: cart, addItem: item => cart.push(item) }) };
      if (name.includes('useStorefrontTemplate')) return { useStorefrontTemplate: () => ({ route: p => `/${p}`, isCatalog: template === 'catalog', isMinimal: template === 'minimal', isVisual: template === 'visual' }) };
      if (name === '../ui') return { Badge: 'Badge' };
      throw new Error(name);
    },
  });
  return { cart, render: () => { cursor = 0; return card.ProductCard({ product, layout }); } };
}
async function main() {
  let details = raw;
  const requests = [];
  const service = load('src/features/storefront/services/catalogService.ts', {
    require: name => {
      assert.ok(name.includes('initialLoad'));
      return { fetchInitialLoad: async url => { requests.push(url); return response(url.endsWith('/productos/') ? [summary] : details); } };
    },
  });
  const listed = await service.fetchPublicProducts();
  assert.equal(listed[0].variantsLoaded, false);
  assert.deepEqual(JSON.parse(JSON.stringify(listed[0].attributes)), {});
  const hydrated = await service.fetchPublicProducts({ includeVariants: true });
  const product = hydrated[0];
  assert.ok(requests.includes('http://test/api/catalog/productos/qa-creacion-mongo/'));
  assert.equal(product.attributeLabels.talla, 'Talla');
  assert.equal(product.attributes.talla.join(','), 'M,L,XL');
  assert.equal(product.variants[0].sku, 'QA-PANT-M');
  assert.equal(product.variants[0].price, 80);
  assert.equal(product.variants[0].comparePrice, 100);
  assert.equal(product.variants[0].stock, 7);

  for (const template of ['catalog', 'minimal', 'visual', 'editorial']) {
    for (const layout of ['grid', 'list']) {
      const harness = cardHarness(product, template, layout);
      let tree = harness.render();
      let select = walk(tree, n => n.type === 'select')[0];
      assert.equal(select.props['aria-label'], 'Talla');
      const options = walk(select, n => n.type === 'option');
      assert.deepEqual(options.map(text), ['M', 'L', 'XL — Sin stock']);
      assert.ok(options[2].props.disabled);
      assert.ok(options.every(option => text(option).trim()));
      select.props.onChange({ target: { value: 'QA-PANT-L' } });
      tree = harness.render();
      assert.ok(text(tree).includes('CLP 120'));
      assert.ok(!text(tree).includes('CLP 100'));
      assert.ok(text(tree).includes('QA-PANT-L'));
      assert.ok(text(tree).includes('8 uds'));
      let add = walk(tree, n => n.type === 'button' && n.props['aria-label']?.startsWith('Agregar '))[0];
      assert.equal(add.props.disabled, false);
      add.props.onClick();
      assert.equal(harness.cart[0].sku, 'QA-PANT-L');
      assert.equal(harness.cart[0].variantId, 'QA-PANT-L');
      assert.equal(harness.cart[0].price, 120);
      assert.equal(harness.cart[0].comparePrice, undefined);
      assert.equal(harness.cart[0].maxStock, 8);
      assert.equal(harness.cart[0].attributes.talla, 'L');
      // Aunque se fuerce el evento de una opción disabled, no permite comprar stock cero.
      walk(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'QA-PANT-XL' } });
      tree = harness.render();
      add = walk(tree, n => n.type === 'button' && n.props['aria-label']?.startsWith('Agregar '))[0];
      assert.equal(add.props.disabled, true);
      add.props.onClick();
      assert.equal(harness.cart.length, 1);
    }
  }
  const short = cardHarness(listed[0]);
  const shortTree = short.render();
  assert.equal(walk(shortTree, n => n.type === 'select').length, 0);
  assert.ok(text(shortTree).includes('Ver opciones'));
  const shortAdd = walk(shortTree, n => n.type === 'button')[0];
  shortAdd.props.onClick();
  assert.equal(short.cart.length, 0);

  for (const template of ['catalog', 'minimal', 'visual', 'editorial']) {
    const state = [product, [], false, false, {}, 1, 0, false];
    let cursor = 0;
    const cart = [];
    const jsx = (type, props) => ({ type, props });
    const detail = load('src/features/storefront/pages/ProductDetail.tsx', {
      require: name => {
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (name === 'react') return { useEffect: () => {}, useState: () => {
          const index = cursor++;
          return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        } };
        if (name === 'react-router-dom') return { Link: 'Link', useParams: () => ({ id: raw.slug }) };
        if (name.includes('mockData')) return { formatPrice: value => `CLP ${value}` };
        if (name.includes('StockFeedback')) return { StockFeedback: 'StockFeedback' };
      if (name.includes('CartContext')) return { useCart: () => ({ items: cart, addItem: item => cart.push(item) }) };
        if (name.includes('useStorefrontTemplate')) return { useStorefrontTemplate: () => ({ route: p => `/${p}`, isCatalog: template === 'catalog', isMinimal: template === 'minimal', isVisual: template === 'visual' }) };
        if (name.includes('components/ui')) return { Badge: 'Badge', Breadcrumb: 'Breadcrumb', Alert: 'Alert', Icon: 'Icon' };
        if (name.includes('ProductCard')) return { ProductCard: 'ProductCard' };
        if (name.includes('ProductAttributes')) return { ProductAttributes: 'ProductAttributes' };
        if (name.includes('catalogService')) return {};
        throw new Error(name);
      },
    });
    const render = () => { cursor = 0; return detail.default(); };
    let tree = render();
    assert.ok(text(tree).includes('Talla'));
    assert.equal(walk(tree, n => n.type === 'button' && text(n).startsWith('XL'))[0].props.disabled, true);
    walk(tree, n => n.type === 'button' && text(n) === 'L')[0].props.onClick();
    tree = render();
    assert.ok(text(tree).includes('QA-PANT-L'));
    assert.ok(text(tree).includes('CLP 120'));
    assert.ok(!text(tree).includes('CLP 100'));
    const buy = walk(tree, n => n.type === 'button' && /Comprar|Agregar al carrito/.test(text(n)))[0];
    assert.equal(buy.props.disabled, false);
    buy.props.onClick();
    assert.equal(cart[0].sku, 'QA-PANT-L');
    assert.equal(cart[0].maxStock, 8);
    assert.equal(cart[0].comparePrice, undefined);
  }

  details = { ...raw, variantes: [
    { sku: 'BLUE-L', precio: 10, stock: 3, atributos_variante: [{ clave: 'color', etiqueta: 'Color', valor: 'Azul' }, { clave: 'size', etiqueta: 'Tamaño', valor: 'Grande' }] },
    { sku: 'RED-S', precio: 20, stock: 4, atributos_variante: [{ clave: 'color', etiqueta: 'Color', valor: 'Rojo' }, { clave: 'size', etiqueta: 'Tamaño', valor: 'Pequeño' }] },
  ] };
  const dynamic = await service.fetchPublicProductDetail(raw.slug);
  const h = cardHarness(dynamic);
  const selector = walk(h.render(), n => n.type === 'select')[0];
  assert.deepEqual(walk(selector, n => n.type === 'option').map(text), ['Color: Azul · Tamaño: Grande', 'Color: Rojo · Tamaño: Pequeño']);
  selector.props.onChange({ target: { value: 'RED-S' } });
  const add = walk(h.render(), n => n.type === 'button')[0];
  add.props.onClick();
  assert.equal(h.cart[0].sku, 'RED-S');

  const filters = load('src/features/storefront/hooks/useAttributeFilters.ts', { require: () => ({}) });
  assert.equal(filters.matchesAttributeSelection(dynamic, { color: ['Rojo'], size: ['Pequeño'] }), true);
  assert.equal(filters.matchesAttributeSelection(dynamic, { color: ['Rojo'], size: ['Grande'] }), false);
  details = { ...raw, variantes: [{ sku: 'SIMPLE', precio: 10, stock: 2, atributos_variante: [{ clave: 'empty', etiqueta: 'Vacío', valor: ' ' }] }] };
  const simple = await service.fetchPublicProductDetail(raw.slug);
  assert.equal(walk(cardHarness(simple).render(), n => n.type === 'select').length, 0);
  console.log('OK: M/L, etiquetas dinámicas, SKU/precios/stock, carrito, filtros y resumen sin selector vacío');
}
main().catch(error => { console.error(error); process.exit(1); });
