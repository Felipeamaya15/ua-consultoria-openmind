const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const stored = new Map();
const storage = {getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value)};
function load(file, requireMock) {
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'),
    {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    {module, exports: module.exports, require: requireMock, localStorage: storage, sessionStorage: {getItem: () => null}, console});
  return module.exports;
}
const persistence = load('src/features/storefront/services/guestCartStorage.ts', () => {throw Error('Unexpected import');});
let identity = {apiBaseUrl: 'http://test', storeId: 'A'}, preview = false;
const a = persistence.guestCartKey(identity), b = persistence.guestCartKey({...identity, storeId: 'B'});
assert.notEqual(a, b);
assert.notEqual(a, persistence.guestCartKey({...identity, apiBaseUrl: 'http://other'}));
assert.equal(persistence.guestCartKey(null), null);
const item = {productId: '0123456789abcdef01234567', variantId: 'SKU-L', sku: 'SKU-L', name: 'Polera',
  image: '/real.png', price: 12000, quantity: 2, maxStock: 8, attributes: {Talla: 'L'}};
let states = [], cursor = 0, effects = [], slots = [], dirty = false;
const jsx = (type, props) => ({type, props});
const Provider = load('src/features/storefront/context/CartContext.tsx', name => {
  if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
  if (name === 'react') return {createContext: () => ({Provider: 'Provider'}), useCallback: fn => fn,
    useState(initial) {const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => {states[i] = typeof value === 'function' ? value(states[i]) : value; dirty = true;}];},
    useEffect(fn, deps) {const i = cursor++; if (!slots[i] || deps.some((d, j) => d !== slots[i][j])) {slots[i] = deps; effects.push(fn);}}};
  if (name.includes('StoreIdentityContext')) return {useStoreIdentity: () => ({identity})};
  if (name.includes('guestCartStorage')) return persistence;
  if (name.includes('visual/pages')) return {isActiveEditorPreview: () => preview};
  if (name.includes('promotionService')) return {validatePromotion: async () => {throw Error('No promo validation expected');}};
  if (name.includes('cartService')) return {cartService: {obtenerCarrito() {throw Error('Guest/preview must not query real cart');}}};
  throw Error(name);
}).CartProvider;
function render() {cursor = 0; return Provider({children: null}).props.value;}
function settle() {let context; for (let i = 0; i < 8; i++) {dirty = false; context = render(); const pending = effects; effects = []; pending.forEach(fn => fn()); if (!dirty) return context;} throw Error('Effects did not settle');}
function remount() {states = []; slots = []; effects = []; return settle();}
(async () => {
  await remount().addItem(item); settle();
  assert.deepEqual(JSON.parse(stored.get(a)), [item]);
  let cart = remount();
  assert.deepEqual(JSON.parse(JSON.stringify(cart.items)), [item], 'Recargar conserva SKU, atributos, precio, cantidad e imagen');
  await cart.updateQuantity(item.productId, item.variantId, 99); settle();
  assert.equal(remount().items[0].quantity, 8);
  identity = {...identity, storeId: 'B'}; assert.equal(settle().items.length, 0, 'La tienda B no hereda carrito de A');
  identity = {...identity, storeId: 'A'}; assert.equal(settle().items[0].sku, 'SKU-L');
  await settle().clearCart(); settle(); assert.equal(remount().items.length, 0);
  stored.set(a, '{broken'); assert.equal(remount().items.length, 0);
  stored.set(a, JSON.stringify([{...item, quantity: -1}, {...item, id_item_carrito: 99}]));
  assert.equal(remount().items.length, 0, 'Snapshots corruptos o autenticados no se reutilizan como invitado');
  preview = true; stored.set(a, JSON.stringify([item])); const before = stored.get(a);
  assert.equal(remount().items.length, 0); assert.equal(stored.get(a), before, 'Preview no lee ni escribe carrito real');
  console.log('OK: carrito invitado real, recarga, variantes, cantidades, limpieza, corrupción, tenant y preview');
})().catch(error => {console.error(error); process.exitCode = 1;});
