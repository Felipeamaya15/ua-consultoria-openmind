// Ejecutar desde frontend: node tests/stock-feedback.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, req) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: req });
  return module.exports;
}
const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
const feedback = load('src/features/storefront/components/store/StockFeedback.tsx', () => ({ jsx, jsxs: jsx }));
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return (Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children]).map(text).join('');
}
function walk(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  for (const child of (Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children])) walk(child, predicate, result);
  return result;
}
function hooks(initial = []) {
  const state = initial;
  let cursor = 0;
  return { reset: () => { cursor = 0; }, react: {
    createContext: () => ({ Provider: 'Provider' }), useEffect: () => {},
    useState: value => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof value === 'function' ? value() : value;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
  } };
}
const item = (sku, quantity, maxStock, price = 100) => ({ productId: 'polera', variantId: sku, sku,
  name: 'Polera', image: '/polera.png', attributes: { talla: sku.endsWith('M') ? 'M' : 'L' }, quantity, maxStock, price });

assert.equal(feedback.StockFeedback({ sku: 'M', maxStock: 7, quantity: 6 }), null);
assert.equal(feedback.StockFeedback({ sku: 'M', maxStock: 6, quantity: 1 }), null);
assert.ok(text(feedback.StockFeedback({ sku: 'M', maxStock: 5, quantity: 1 })).includes('Stock bajo'));
assert.ok(text(feedback.StockFeedback({ sku: 'M', maxStock: 7, quantity: 7 })).includes('M: Has alcanzado el stock disponible (7 unidades).'));
assert.ok(!text(feedback.StockFeedback({ sku: 'M', maxStock: 5, quantity: 5 })).includes('Stock bajo'));
assert.ok(text(feedback.StockFeedback({ sku: 'M', maxStock: 1, quantity: 1 })).includes('(1 unidad)'));

const providerHooks = hooks();
const provider = load('src/features/storefront/context/CartContext.tsx', name => {
  if (name === 'react') return providerHooks.react;
  return { jsx, jsxs: jsx };
});
const context = () => { providerHooks.reset(); return provider.CartProvider({ children: null }).props.value; };
context().addItem(item('QA-PANT-M', 6, 7));
context().addItem(item('QA-PANT-L', 7, 8, 120));

function component(file, template, initial = []) {
  const h = hooks(initial);
  const exports = load(file, name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return h.react;
    if (name === 'react-router-dom') return { Link: 'Link', useNavigate: () => () => {}, useParams: () => ({ id: 'polera' }) };
    if (name.includes('StockFeedback')) return feedback;
    if (name.includes('CartContext')) return { useCart: context };
    if (name.includes('mockData')) return { formatPrice: value => `CLP ${value}` };
    if (name.includes('useStorefrontTemplate')) return { useStorefrontTemplate: () => ({ route: p => `/${p}`, isCatalog: template === 'catalog', isVisual: template === 'visual', isMinimal: template === 'minimal' }) };
    if (name.includes('ProductCard')) return { ProductCard: 'ProductCard' };
    if (name.includes('ProductAttributes')) return { ProductAttributes: 'ProductAttributes' };
    if (name.includes('catalogService')) return {};
    if (name.includes('ui')) return Object.fromEntries(['Button','EmptyState','Icon','Badge','Breadcrumb','Alert'].map(name => [name, name]));
    throw new Error(name);
  });
  return { render: props => { h.reset(); return (exports.default || exports.ProductCard)(props); } };
}
for (const template of ['catalog', 'visual', 'minimal', 'editorial']) {
  context().updateQuantity('polera', 'QA-PANT-M', 6);
  const cart = component('src/features/storefront/pages/Cart.tsx', template);
  let tree = cart.render();
  assert.equal(walk(tree, n => n.props?.role === 'status').length, 0);
  let articles = walk(tree, n => n.type === 'article');
  const increase = walk(articles[0], n => n.type === 'button' && text(n) === '+')[0];
  increase.props.onClick();
  tree = cart.render(); articles = walk(tree, n => n.type === 'article');
  assert.ok(text(articles[0]).includes('QA-PANT-M: Has alcanzado el stock disponible (7 unidades).'));
  assert.ok(!text(articles[1]).includes('Has alcanzado'));
  assert.equal(walk(articles[0], n => n.type === 'button' && text(n) === '+')[0].props.disabled, true);
  assert.equal(context().items[1].quantity, 7);
  assert.equal(context().subtotal, 7 * 100 + 7 * 120);
  assert.equal(context().total, context().subtotal + context().shipping);
  walk(articles[0], n => n.type === 'button' && text(n) === '−')[0].props.onClick();
  assert.ok(!text(cart.render()).includes('Has alcanzado'));
  assert.equal(context().subtotal, 6 * 100 + 7 * 120);
}

context().updateQuantity('polera', 'QA-PANT-M', 7);
const product = { id: 'polera', name: 'Polera', images: ['/polera.png'], category: 'Ropa', basePrice: 100,
  attributes: { talla: ['M','L'] }, attributeLabels: { talla: 'Talla' }, variantsLoaded: true,
  variants: ['M','L'].map((size, i) => ({ id: `QA-PANT-${size}`, sku: `QA-PANT-${size}`, attributes: { talla: size }, price: i ? 120 : 100, stock: i ? 8 : 7, available: true })) };
for (const template of ['catalog', 'visual', 'minimal', 'editorial']) {
  const card = component('src/features/storefront/components/store/ProductCard.tsx', template);
  let tree = card.render({ product });
  assert.ok(text(tree).includes('QA-PANT-M: Has alcanzado el stock disponible (7 unidades).'));
  const add = walk(tree, n => n.type === 'button' && n.props['aria-label']?.startsWith('Agregar'))[0];
  assert.equal(add.props.disabled, true);
  add.props.onClick();
  assert.equal(context().items[0].quantity, 7);
  walk(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'QA-PANT-L' } });
  assert.ok(!text(card.render({ product })).includes('Has alcanzado'));

  const detail = component('src/features/storefront/pages/ProductDetail.tsx', template, [product, [], false, false, { talla: 'M' }, 1, 0, false]);
  tree = detail.render();
  assert.ok(text(tree).includes('QA-PANT-M: Has alcanzado el stock disponible (7 unidades).'));
  assert.equal(walk(tree, n => n.type === 'button' && text(n) === '+')[0].props.disabled, true);
  const buy = walk(tree, n => n.type === 'button' && /Stock agregado|Máximo|Maximo/.test(text(n)))[0];
  assert.equal(buy.props.disabled, true);
  buy.props.onClick();
  assert.equal(context().items[0].quantity, 7);
  walk(tree, n => n.type === 'button' && text(n) === 'L')[0].props.onClick();
  assert.ok(!text(detail.render()).includes('Has alcanzado'));
}
// Reducir/eliminar una variante no cambia el stock ni la cantidad de la otra.
context().updateQuantity('polera', 'QA-PANT-M', 0);
assert.equal(context().items.length, 1);
assert.equal(context().items[0].sku, 'QA-PANT-L');
assert.equal(context().items[0].maxStock, 8);
assert.equal(context().subtotal, 7 * 120);
console.log('OK: límite por SKU, umbral <=5, avisos en cuatro plantillas, reducción/eliminación y totales');
