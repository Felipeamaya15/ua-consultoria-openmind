const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals) {
  const module = {exports: {}};
  const source = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('import.meta.env.VITE_API_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    {module, exports: module.exports, Error, console, ...globals});
  return module.exports;
}
const jsx = (type, props) => ({type, props});
function nodes(tree, out = []) {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, out));
  else if (tree && typeof tree === 'object') {out.push(tree); nodes(tree.props?.children, out);}
  else if (typeof tree === 'string' || typeof tree === 'number') out.push(tree);
  return out;
}
const items = [
  {productId: '507f1f77bcf86cd799439011', variantId: 'QA-M', sku: 'QA-M', name: 'Pantalón', attributes: {Talla: 'M'}, price: 9000, quantity: 2, maxStock: 7, image: ''},
  {productId: '507f1f77bcf86cd799439011', variantId: 'QA-L', sku: 'QA-L', name: 'Pantalón', attributes: {Talla: 'L'}, price: 12000, quantity: 1, maxStock: 8, image: ''},
];
const result = {id_pedido: 42, identificador: 'PEDIDO-BACKEND-42', tienda_id: 9, estado: 'pendiente', monto_total: '30000.00', descuento: '0.00', costo_envio: '0.00'};
(async () => {
  const webpayRequests = [];
  const {transbankPaymentService} = load('src/features/checkout/services/transbankPaymentService.ts', {
    fetch: async (url, options) => {webpayRequests.push({url, options}); return {json: async () => ({exito: true})};},
  });
  await transbankPaymentService.iniciarPago(9, 'ORDER', 100, 'http://localhost:5173/return', ' buyer@example.com ');
  assert.equal(JSON.parse(webpayRequests[0].options.body).email, 'buyer@example.com');
  assert.ok(!webpayRequests[0].url.includes('buyer@example.com'));
  let token = 'buyer-token', calls = [], response = {ok: true, json: async () => ({exito: true, data: result})};
  const {orderService} = load('src/features/storefront/services/orderService.ts', {
    localStorage: {getItem: () => token}, require: () => ({authService: {getToken: () => token}}),
    fetch: async (url, options) => {calls.push({url, options}); return response;},
  });
  const input = {key: 'real-key', items, contact: {name: 'Comprador', email: ' buyer@example.com ', phone: ''}, paymentMethod: 'Transferencia', shippingMethod: 'Retiro', address: {}, promoCode: ''};
  assert.equal((await orderService.create(input)).id_pedido, 42);
  assert.equal((await orderService.create(input)).identificador, result.identificador);
  assert.equal(calls[0].url, 'http://localhost:8000/api/checkout/pedidos/');
  assert.equal(calls[0].options.headers.Authorization, 'Token buyer-token');
  const payload = JSON.parse(calls[0].options.body);
  input.address = {street: 'Providencia', number: '123', apt: '', city: 'Providencia', region: 'Metropolitana'};
  await orderService.create(input);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).direccion, input.address);
  assert.equal(JSON.parse(calls.at(-1).options.body).metodo_entrega, 'Retiro');
  input.shippingMethod = 'Chilexpress'; input.shippingQuote = 'signed-backend-quote';
  await orderService.create(input);
  const quotedPayload = JSON.parse(calls.at(-1).options.body);
  assert.equal(quotedPayload.cotizacion, 'signed-backend-quote');
  assert.equal(quotedPayload.metodo_entrega, 'Chilexpress');
  assert.deepEqual(quotedPayload.direccion, input.address);
  assert.ok(!('costo_envio' in quotedPayload) && !('monto_total' in quotedPayload));
  input.shippingMethod = 'Retiro';
  await orderService.create(input);
  assert.ok(!('cotizacion' in JSON.parse(calls.at(-1).options.body)));
  response = {ok: true, json: async () => ({exito: true, data: {...result, costo_envio: '3490.00'}})};
  await assert.rejects(orderService.create(input), /respuesta del pedido es invÃ¡lida/);
  response = {ok: true, json: async () => ({exito: true, data: result})};
  assert.equal(payload.items[0].producto_id, items[0].productId);
  assert.equal(payload.items[0].sku, 'QA-M');
  assert.equal(payload.contacto.email, 'buyer@example.com');
  assert.equal(payload.items[0].cantidad, 2);
  assert.ok(!('precio' in payload.items[0]) && !('monto_total' in payload) && !('comprador' in payload));
  token = null;
  await orderService.create(input);
  assert.ok(!('Authorization' in calls.at(-1).options.headers));
  for (const invalid of [{...result, monto_total: 'NaN'}, {...result, id_pedido: '42'}, {...result, identificador: {}}, {...result, estado: 'desconocido'}]) {
    response = {ok: true, json: async () => ({exito: true, data: invalid})};
    await assert.rejects(orderService.create(input), /respuesta del pedido es inválida/);
  }
  response = {ok: false, json: async () => ({items: ['Stock insuficiente para QA-M.']})};
  await assert.rejects(orderService.create(input), /Stock insuficiente/);
  response = {ok: false, json: async () => ({exito: false, mensaje: 'Datos inválidos', error: {detalles: {items: ['Stock insuficiente para QA-M.']}}})};
  await assert.rejects(orderService.create(input), /Stock insuficiente/);

  let states, stateIndex, refs, refIndex, navigateCalls, clearCount, createCalls, fail, pending;
  let recordEffects = false, effects = [], paymentReply, paymentFetches = [];
  const cart = {items, subtotal: 30000, shipping: 0, discount: 0, total: 30000, promoCode: '', shippingMethod: 'Retiro', count: 3,
    clearCart: async () => {clearCount++;}, setShippingMethod() {}, updateQuantity() {}, removeItem() {}, applyPromo() {}};
  let template = 'editorial';
  const mockReact = {
    useState(initial) {const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], next => {states[i] = typeof next === 'function' ? next(states[i]) : next;}];},
    useRef(initial) {const i = refIndex++; if (!(i in refs)) refs[i] = {current: initial}; return refs[i];},
    useMemo: callback => callback(), useEffect(callback) {if (recordEffects) effects.push(callback);},
  };
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'react') return mockReact;
    if (name === 'react-router-dom') return {Link: 'Link', useNavigate: () => (...args) => navigateCalls.push(args)};
    if (name.includes('CartContext')) return {useCart: () => cart};
    if (name.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => `/plantilla/1/${p}`, isCatalog: template === 'catalog', isVisual: template === 'visual', isMinimal: template === 'minimal'})};
    if (name.includes('mockData')) return {formatPrice: n => `CLP ${n}`};
    if (name.includes('orderService')) return {orderService: {create: async data => {createCalls.push(data); if (pending) await pending; if (fail) throw Error('Stock insuficiente'); return result;}}};
    if (name.includes('shippingService')) return {getDeliveryAlternatives: async () => ({pickup: {enabled: true}, chilexpress: {enabled: false}, starken: {enabled: false}}), getShippingQuotes: async () => []};
    if (name.includes('comunasChile')) return load('src/features/storefront/data/comunasChile.ts', {
      require: () => ({default: require('../src/features/admin/data/chileTerritory.json')}),
    });
    if (name.includes('paypalPaymentService')) return {paypalPaymentService: {}};
    if (name.includes('transbankPaymentService')) return {transbankPaymentService: {iniciarPago: async (...args) => {assert.equal(args[0], 9); assert.equal(args[1], result.identificador); assert.equal(args[2], 30000); return {exito: true, data: {url: 'webpay', token: 'token'}};}, redirigirAWebpay() {}}};
    if (name.includes('StockFeedback')) return {StockFeedback: 'StockFeedback'};
    if (name.includes('components/ui')) return Object.fromEntries(['Stepper','Button','Input','Select','Alert','Icon','EmptyState'].map(label => [label, label]));
    throw Error(name);
  };
  const receiptStorage = new Map();
  const globals = {require: requireMock, localStorage: {getItem: () => null}, sessionStorage: {setItem: (key, value) => receiptStorage.set(key, value)}, crypto: {randomUUID: () => 'fixed-checkout-key'}, window: {location: {origin: 'http://localhost:5173'}},
    fetch: async url => {paymentFetches.push(url); return paymentReply;}};
  const Checkout = load('src/features/storefront/pages/Checkout.tsx', globals).default;
  function reset() {
    states = [[{id: 'Retiro', label: 'Retiro'}], false, '', 0, 'confirm', 'guest', {name: 'Comprador', email: 'buyer@example.com', phone: ''}, {street: '', number: '', apt: '', city: '', region: ''}, 'Transferencia', false, {}];
    states[13] = [{id: 'Transferencia', label: 'Transferencia'}, {id: 'Transbank', label: 'Transbank'}];
    states[14] = false; states[15] = '';
    refs = []; navigateCalls = []; clearCount = 0; createCalls = []; fail = false; pending = null;
  }
  function render(component) {stateIndex = 0; refIndex = 0; return nodes(component());}
  const confirm = () => render(Checkout).find(node => node.props?.onClick && nodes(node).some(value => typeof value === 'string' && value.startsWith('Confirmar y pagar'))).props.onClick;
  reset();
  let release;
  pending = new Promise(resolve => {release = resolve;});
  const handler = confirm();
  const first = handler(); const duplicate = handler();
  assert.equal(createCalls.length, 1);
  assert.equal(clearCount, 0);
  assert.equal(navigateCalls.length, 0);
  release(); await Promise.all([first, duplicate]);
  assert.equal(clearCount, 1);
  assert.equal(navigateCalls[0][1].state.orderNumber, result.identificador);
  assert.equal(navigateCalls[0][1].state.identificador, result.identificador);
  const identifier = result.identificador;
  delete result.identificador;
  reset(); await confirm()();
  assert.equal(navigateCalls[0][1].state.orderNumber, String(result.id_pedido));
  assert.equal(navigateCalls[0][1].state.identificador, undefined);
  result.identificador = identifier;
  reset(); fail = true;
  await confirm()();
  assert.equal(clearCount, 0);
  assert.equal(navigateCalls.length, 0);
  assert.equal(states[10].payment, 'Stock insuficiente');
  const originalKey = createCalls[0].key;
  fail = false; await confirm()();
  assert.equal(createCalls[1].key, originalKey);
  assert.equal(clearCount, 1);
  reset(); states[8] = 'Transbank';
  await confirm()();
  assert.equal(clearCount, 1);
  assert.deepEqual(JSON.parse(receiptStorage.get(`order-tracking:${result.identificador}`)), {
    identificador: result.identificador, email: 'buyer@example.com',
  });
  for (const method of ['PayPal', 'MercadoPago']) {
    reset(); states[8] = method; states[13] = [{id: method, label: method}];
    await confirm()();
    assert.equal(createCalls.length, 0, 'Un medio incompleto no puede crear pedidos ni descontar stock');
    assert.equal(clearCount, 0);
    assert.equal(navigateCalls.length, 0);
    assert.match(states[10].payment, /todavía no está disponible/);
  }
  reset(); states[6].email = 'invalid';
  await confirm()();
  assert.equal(createCalls.length, 0);

  async function loadPayments(data, ok = true) {
    reset(); states[4] = 'payment'; states[13] = []; states[14] = true;
    recordEffects = true; effects = [];
    paymentReply = {ok, json: async () => ({exito: ok, data})};
    render(Checkout);
    assert.ok(states[14]);
    effects.find(effect => effect.toString().includes('loadPayments'))();
    await new Promise(setImmediate);
    recordEffects = false;
    return render(Checkout);
  }
  let paymentTree = await loadPayments({transfer: {enabled: true, fields: Object.fromEntries(['bank_name','account_type','account_number','holder_rut','holder_name','confirmation_email'].map(key => [key, 'qa']))}, paypal: {enabled: false}, transbank: {enabled: false}});
  assert.equal(paymentFetches.at(-1), 'http://localhost:8000/api/pagos/activos/');
  assert.deepEqual(paymentTree.filter(node => node.type === 'input' && node.props?.name === 'payment').map(node => node.props.value), ['Transferencia']);
  paymentTree = await loadPayments({Transbank: {enabled: true}, Linkify: {enabled: true}, PayPal: {enabled: 'false'}});
  assert.deepEqual(paymentTree.filter(node => node.type === 'input' && node.props?.name === 'payment').map(node => node.props.value), ['Transbank', 'Linkify']);
  paymentTree = await loadPayments({});
  assert.ok(paymentTree.some(value => typeof value === 'string' && value.includes('no tiene medios de pago habilitados')));
  states[4] = 'confirm';
  await confirm()();
  assert.equal(createCalls.length, 0);
  paymentTree = await loadPayments({}, false);
  assert.ok(paymentTree.some(value => typeof value === 'string' && value.includes('No se pudieron cargar')));
  states[4] = 'confirm';
  await confirm()();
  assert.equal(createCalls.length, 0);
  reset(); states[13] = [{id: 'PayPal'}];
  await confirm()();
  assert.equal(createCalls.length, 0, 'No se puede confirmar un medio deshabilitado aunque siga seleccionado');

  const Cart = load('src/features/storefront/pages/Cart.tsx', globals).default;
  for (template of ['editorial', 'minimal', 'visual', 'catalog']) {
    reset(); states = [];
    const tree = render(Cart);
    assert.ok(tree.includes('QA-M') || tree.some(value => typeof value === 'string' && value.includes('QA-M')));
    assert.ok(tree.includes('QA-L') || tree.some(value => typeof value === 'string' && value.includes('QA-L')));
    assert.ok(tree.includes('CLP 18000'));
    assert.ok(tree.includes('CLP 12000'));
    assert.ok(tree.includes('CLP 30000'));
    assert.equal(tree.filter(value => value === ' por unidad').length, 2);
    assert.ok(tree.some(node => node.props?.to === '/plantilla/1/compra' || node.props?.onClick));
    cart.shipping = null; cart.shippingMethod = 'Chilexpress';
    const pendingTree = render(Cart);
    assert.ok(pendingTree.includes('Se calcula en checkout'));
    assert.ok(pendingTree.includes('Total sin envío'));
    assert.ok(!pendingTree.some(value => typeof value === 'string' && value.includes('Envío gratis sobre')));
    cart.shipping = 0; cart.shippingMethod = 'Retiro';
  }
  let contextStates = [], cursor = 0, addedToSql = [], deleted = [];
  let persistedCart = [{id_item_carrito: 99, id_producto: 123, nombre_producto: 'Legado', precio_unitario: 0, cantidad: 1, stock_disponible: 0}];
  const Provider = load('src/features/storefront/context/CartContext.tsx', {
    localStorage: {getItem: () => 'buyer-token'}, sessionStorage: {getItem: () => null},
    require: name => {
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
      if (name === 'react') return {createContext: () => ({Provider: 'Provider'}), useContext() {}, useEffect() {}, useCallback: fn => fn,
        useState(initial) {const i = cursor++; if (!(i in contextStates)) contextStates[i] = initial; return [contextStates[i], next => {contextStates[i] = typeof next === 'function' ? next(contextStates[i]) : next;}];}};
      if (name.includes('cartService')) return {cartService: {
        obtenerCarrito: async () => persistedCart,
        agregarItem: async id => {addedToSql.push(id);}, eliminarItem: async id => {deleted.push(id);},
      }};
      throw Error(name);
    },
  }).CartProvider;
  const context = () => {cursor = 0; return Provider({children: null}).props.value;};
  await context().addItem(items[0]);
  await context().addItem(items[1]);
  assert.equal(context().shipping, null);
  assert.equal(context().total, context().subtotal - context().discount);
  context().setShippingMethod('Retiro');
  assert.equal(context().shipping, 0);
  context().setShippingMethod('Chilexpress');
  assert.equal(context().shipping, null);
  assert.deepEqual(addedToSql, [items[0].productId, items[1].productId], 'El backend recibe el identificador Mongo completo, sin parseInt');
  await context().updateQuantity(items[0].productId, 'QA-M', 8);
  assert.equal(context().items[0].quantity, 7);
  assert.equal(context().items[1].quantity, 1);
  await context().refreshCart();
  assert.equal(context().items.length, 3, 'Sincronizar el carrito SQL conserva las variantes Mongo de la sesión');
  assert.equal(context().items[0].price, 0);
  assert.equal(context().items[0].maxStock, 0);
  assert.equal(context().items[0].image, '');
  await context().updateQuantity(items[0].productId, 'QA-M', 1);
  assert.equal(context().subtotal, 21000);
  await context().removeItem(items[0].productId, 'QA-M');
  assert.equal(context().subtotal, 12000);
  await context().clearCart();
  assert.equal(context().items.length, 0);
  assert.deepEqual(deleted, [99]);
  contextStates[0] = [{...items[0]}];
  persistedCart = [{id_item_carrito: 100, id_producto: 123, producto_mongo_id: items[0].productId,
    slug: 'polera', sku: 'QA-M', cantidad: 1, precio_unitario: 0, stock_disponible: 0}];
  await context().refreshCart();
  assert.equal(context().items.length, 1, 'El carrito persistido y el local deben compartir la identidad Mongo');
  assert.equal(context().items[0].productId, items[0].productId);
  assert.equal(context().items[0].id_item_carrito, 100);
  assert.equal(context().items[0].price, 0);
  assert.equal(context().items[0].maxStock, 0);
  console.log('OK: contrato real, Token/invitado, errores, doble envío, reintento, Webpay, cuatro plantillas, stock independiente y limpieza del carrito');
})().catch(error => {console.error(error); process.exitCode = 1;});
