const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals) {
  const module = {exports: {}};
  const source = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('import.meta.env.VITE_API_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    {module, exports: module.exports, Error, URLSearchParams, AbortController, ...globals});
  return module.exports;
}
const jsx = (type, props) => ({type, props});
function nodes(tree, out = []) {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, out));
  else if (tree && typeof tree === 'object') {out.push(tree); nodes(tree.props?.children, out);}
  else if (typeof tree === 'string' || typeof tree === 'number') out.push(tree);
  return out;
}
const identifier = 'ORD-20261008-YOXM', email = 'buyer@example.com';
const real = {id_pedido: 42, identificador: identifier, fecha_creacion: '2026-10-08T12:00:00Z',
  estado: 'enviado', estado_etiqueta: 'Enviado', monto_total: '15000.00', cantidad_productos: 2,
  descuento: '0.00', costo_envio: '0.00', nombre_contacto: 'Comprador real', medio_pago: 'Transferencia', entrega: {metodo: 'Retiro'},
  items: [{id_item_pedido: 1, producto_id: 'mongo-id', nombre: 'Producto real', cantidad: 2, precio_unitario: '7500.00', subtotal: '15000.00',
    sku: 'REAL-M', atributos_variante: [{clave: 'talla', etiqueta: 'Talla', valor: 'M'}]}]};

(async () => {
  // Contrato HTTP: consulta real, correo en el cuerpo, errores y cancelación.
  let calls = [], reply = {ok: true, json: async () => ({exito: true, data: real})};
  const {orderService} = load('src/features/storefront/services/orderService.ts', {
    require: () => ({authService: {getToken: () => null}}),
    fetch: async (url, options) => {calls.push({url, options}); return reply;},
  });
  const controller = new AbortController();
  assert.equal((await orderService.track(` ${identifier} `, ` ${email} `, controller.signal)).identificador, identifier);
  assert.equal(calls[0].url, 'http://localhost:8000/api/pedidos/seguimiento/');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {identificador: identifier, email});
  assert.equal(calls[0].options.signal, controller.signal);
  for (const invalid of [null, {...real, identificador: 'OTHER'}, {...real, items: null}, {...real, monto_total: 'NaN'}]) {
    reply = {ok: true, json: async () => ({exito: true, data: invalid})};
    await assert.rejects(orderService.track(identifier, email), /respuesta del pedido es inválida/);
  }
  reply = {ok: false, json: async () => ({detail: 'Pedido no encontrado'})};
  await assert.rejects(orderService.track(identifier, email), /Pedido no encontrado/);

  let template = 1, location = {search: '', state: {orderNumber: identifier, identificador: identifier, email}};
  let hooks = [], cursor = 0, pending = [], trackCalls = [], request = async () => real;
  const receiptStorage = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = {value: typeof initial === 'function' ? initial() : initial};
      return [hooks[i].value, value => {hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value;}];
    },
    useRef(initial) {const i = cursor++; if (!(i in hooks)) hooks[i] = {current: initial}; return hooks[i];},
    useCallback(fn, deps) {const i = cursor++; if (!hooks[i] || !same(hooks[i].deps, deps)) hooks[i] = {value: fn, deps}; return hooks[i].value;},
    useEffect(effect, deps) {
      const i = cursor++;
      if (!hooks[i] || !same(hooks[i].deps, deps)) {
        const cleanup = hooks[i]?.cleanup;
        hooks[i] = {deps};
        pending.push(() => {cleanup?.(); hooks[i].cleanup = effect();});
      }
    },
  };
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'react') return react;
    if (name === 'react-router-dom') return {Link: 'Link', Navigate: 'Navigate', useLocation: () => location};
    if (name.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => `/plantilla/${template}/${p}`,
      isMinimal: template === 2, isVisual: template === 3, isCatalog: template === 4})};
    if (name.includes('orderService')) return {orderService: {track: (...args) => {trackCalls.push(args); return request(...args);}}};
    if (name.includes('transbankPaymentService')) return {transbankPaymentService: {confirmarPago: async () => ({exito: true, data: {orden_compra: identifier}})}};
    if (name.includes('mockData')) return {formatPrice: String};
    if (name.includes('TransbankReturnResult')) return {default: 'WebpayResult'};
    if (name.includes('shippingService')) return {shippingService: {getTracking: async () => ({historial: []})}};
    if (name.includes('components/ui')) return Object.fromEntries(['Button','Input','Badge','Alert','Icon'].map(type => [type, type]));
    throw Error(name);
  };
  const Confirmation = load('src/features/storefront/pages/OrderConfirmation.tsx', {require: requireMock}).default;
  const Tracking = load('src/features/storefront/pages/Tracking.tsx', {require: requireMock}).default;
  const WebpayReturn = load('src/features/storefront/pages/TransbankReturnResult.tsx', {require: requireMock,
    sessionStorage: {getItem: key => receiptStorage.get(key) ?? null, setItem: (key, value) => receiptStorage.set(key, value)},
  }).default;
  function render(component) {cursor = 0; const tree = nodes(component()); const effects = pending; pending = []; effects.forEach(effect => effect()); return tree;}
  async function settle() {await new Promise(setImmediate); return render(Tracking);}
  function resetTracking() {hooks.forEach(hook => hook.cleanup?.()); hooks = []; pending = []; trackCalls = []; request = async () => real;}

  for (template of [1, 2, 3, 4]) {
    location = {search: '', state: {orderNumber: identifier, identificador: identifier, email}};
    const confirmation = render(Confirmation);
    assert.equal(confirmation.filter(value => value === 'Ver mi pedido').length, 1);
    assert.equal(confirmation.filter(value => value === 'Seguir comprando').length, 1);
    const primary = confirmation.find(node => node.type === 'Link' && nodes(node).includes('Ver mi pedido'));
    assert.equal(primary.props.to, `/plantilla/${template}/seguimiento?orden=${identifier}`);
    assert.equal(primary.props.state.email, email);
    assert.ok(!primary.props.to.includes(email));
    assert.ok(confirmation.some(node => node.type === 'Link' && node.props.to === `/plantilla/${template}/catalogo`));

    resetTracking();
    location = {search: new URL(primary.props.to, 'http://localhost').search, state: primary.props.state};
    const loadingTree = render(Tracking);
    assert.ok(!loadingTree.some(node => node.type === 'Input'), 'El enlace no muestra ni pide datos durante la carga');
    assert.equal(trackCalls.length, 1);
    assert.equal(trackCalls[0][0], identifier);
    assert.equal(trackCalls[0][1], email);
    let tree = await settle();
    assert.ok(!tree.some(node => node.type === 'Input'), 'El enlace muestra directamente el detalle');
    for (const value of [identifier, 'Producto real', 'Comprador real', 'Despachado', '15000']) assert.ok(tree.includes(value), value);

    // Entrada directa: conserva el formulario y consulta solo al pulsar.
    resetTracking(); location = {search: '', state: null};
    tree = render(Tracking);
    assert.equal(trackCalls.length, 0);
    assert.equal(tree.find(node => node.type === 'Input' && node.props.label === 'Número de orden').props.value, '');
    tree.find(node => node.type === 'Input' && node.props.label === 'Número de orden').props.onChange({target: {value: identifier}});
    tree.find(node => node.type === 'Input' && node.props.label === 'Correo electrónico').props.onChange({target: {value: email}});
    tree = render(Tracking);
    const searchButton = tree.find(node => node.props?.onClick && nodes(node).some(value => typeof value === 'string' && value.startsWith('Consultar pedido')));
    assert.equal(searchButton.props.disabled, false);
    searchButton.props.onClick();
    assert.equal(trackCalls.length, 1);
    assert.ok((await settle()).includes('Producto real'));

    for (const missing of [undefined, null, '', '   ']) {
      location = {search: '', state: {orderNumber: '42', identificador: missing, email}};
      const fallback = render(Confirmation).find(node => node.type === 'Link' && nodes(node).includes('Ver mi pedido'));
      assert.equal(fallback.props.to, `/plantilla/${template}/seguimiento`);
      resetTracking(); location = {search: '', state: fallback.props.state}; render(Tracking);
      assert.equal(trackCalls.length, 0, 'Sin identificador no se consulta con el ID numérico');
    }
  }

  // URL sin correo no dispara una consulta incompleta; un cambio de URL sí actualiza la selección.
  resetTracking(); location = {search: `?orden=${identifier}`, state: null}; render(Tracking);
  assert.equal(trackCalls.length, 0);
  location = {...location, state: {email}}; render(Tracking); await settle();
  assert.equal(trackCalls.length, 1);
  location = {search: `?orden=${identifier}`, state: {email: 'wrong@example.com'}};
  request = async () => {throw Error('Pedido no encontrado');}; render(Tracking);
  let tree = await settle();
  assert.ok(tree.includes('Pedido no encontrado'));
  assert.ok(!tree.includes('Producto real'));
  assert.ok(!tree.some(node => node.type === 'Input'), 'Un error desde el enlace tampoco pide datos');
  const callsBeforeManual = trackCalls.length;
  location = {search: '', state: null}; render(Tracking); tree = await settle();
  assert.equal(tree.filter(node => node.type === 'Input').length, 2, 'Volver a Seguimiento por separado pide número y correo');
  assert.equal(trackCalls.length, callsBeforeManual);

  // Una respuesta anterior o tras desmontar no sustituye la orden seleccionada.
  resetTracking(); let resolveOld;
  request = () => new Promise(resolve => {resolveOld = resolve;});
  location = {search: '?orden=OLD', state: {email}}; render(Tracking);
  const oldSignal = trackCalls[0][2];
  request = async () => real;
  location = {search: `?orden=${identifier}`, state: {email}}; render(Tracking);
  assert.equal(oldSignal.aborted, true);
  tree = await settle(); assert.ok(tree.includes(identifier));
  resolveOld({...real, identificador: 'OLD'});
  tree = await settle(); assert.ok(tree.includes(identifier)); assert.ok(!tree.includes('OLD'));
  hooks.forEach(hook => hook.cleanup?.());
  assert.equal(trackCalls.at(-1)[2].aborted, true);

  // El retorno de Webpay también evita los botones duplicados y recupera el pedido real.
  for (template of [1, 2, 3, 4]) {
    resetTracking(); receiptStorage.clear();
    receiptStorage.set(`order-tracking:${identifier}`, JSON.stringify({identificador: identifier, email}));
    const webpay = () => WebpayReturn({orderNumber: identifier, tokenWs: 'test-token', tbkToken: '', tiendaId: 9});
    render(webpay); await new Promise(setImmediate);
    let result = render(webpay);
    assert.equal(result.filter(value => value === 'Seguir comprando').length, 1);
    const primary = result.find(node => node.type === 'Link' && nodes(node).includes('Ver mi pedido'));
    assert.equal(primary.props.to, `/plantilla/${template}/seguimiento?orden=${identifier}`);
    assert.equal(primary.props.state.email, email);
    receiptStorage.delete(`order-tracking:${identifier}`);
    result = render(webpay);
    assert.equal(result.find(node => node.type === 'Link' && nodes(node).includes('Ver mi pedido')).props.to, `/plantilla/${template}/seguimiento`);
  }
  console.log('OK: confirmación y seguimiento real, seis casos requeridos en cuatro plantillas, contrato, errores y cancelación de consultas.');
})().catch(error => {console.error(error); process.exitCode = 1;});
