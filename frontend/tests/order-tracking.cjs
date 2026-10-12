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
  const {
    orderService, isValidOrderNumber, ORDER_NUMBER_FORMAT_MESSAGE,
    isValidTrackingEmail, TRACKING_EMAIL_FORMAT_MESSAGE,
  } = load('src/features/storefront/services/orderService.ts', {
    require: () => ({authService: {getToken: () => null}}),
    fetch: async (url, options) => {calls.push({url, options}); return reply;},
  });
  const controller = new AbortController();
  assert.equal((await orderService.track(` ${identifier.toLowerCase()} `, ' BUYER@EXAMPLE.COM ', controller.signal)).identificador, identifier);
  assert.equal(calls[0].url, 'http://localhost:8000/api/pedidos/seguimiento/');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {identificador: identifier, email});
  assert.equal(calls[0].options.signal, controller.signal);
  const callsBeforeInvalidFormat = calls.length;
  for (const invalidIdentifier of ['42', 'ORD-20260230-AB12', 'ORD-20261008-AB!2']) {
    await assert.rejects(orderService.track(invalidIdentifier, email), /formato ORD-AAAAMMDD-XXXX/);
  }
  assert.equal(calls.length, callsBeforeInvalidFormat, 'Un número inválido no debe llegar al backend');
  const callsBeforeInvalidEmail = calls.length;
  for (const invalidEmail of ['buyer', 'buyer@', 'buyer @example.com', 'buyer@example', 'buyer..name@example.com']) {
    await assert.rejects(orderService.track(identifier, invalidEmail), /correo electrónico válido/);
  }
  assert.equal(calls.length, callsBeforeInvalidEmail, 'Un correo inválido no debe llegar al backend');
  for (const invalid of [null, {...real, identificador: 'OTHER'}, {...real, items: null}, {...real, monto_total: 'NaN'}]) {
    reply = {ok: true, json: async () => ({exito: true, data: invalid})};
    await assert.rejects(orderService.track(identifier, email), /respuesta del pedido es inválida/);
  }
  reply = {ok: false, json: async () => ({detail: 'Pedido no encontrado'})};
  await assert.rejects(orderService.track(identifier, email), /Pedido no encontrado/);

  let template = 1, location = {search: '', state: {orderNumber: identifier, identificador: identifier, email}};
  let hooks = [], cursor = 0, pending = [], trackCalls = [], request = async () => real, liveReply = async () => ({historial: []});
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
    if (name === '../visual/pages') return load('src/features/storefront/visual/pages.ts', {});
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'react') return react;
    if (name === 'react-router-dom') return {Link: 'Link', Navigate: 'Navigate', useLocation: () => location};
    if (name.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => `/plantilla/${template}/${p}`,
      isMinimal: template === 2, isVisual: template === 3, isCatalog: template === 4})};
    if (name.includes('orderService')) return {
      isValidOrderNumber,
      isValidTrackingEmail,
      ORDER_NUMBER_FORMAT_MESSAGE,
      TRACKING_EMAIL_FORMAT_MESSAGE,
      orderService: {track: (...args) => {trackCalls.push(args); return request(...args);}},
    };
    if (name.includes('transbankPaymentService')) return {transbankPaymentService: {confirmarPago: async () => ({exito: true, data: {orden_compra: identifier}})}};
    if (name.includes('mockData')) return {formatPrice: String};
    if (name.includes('TransbankReturnResult')) return {default: 'WebpayResult'};
    if (name.includes('shippingService')) return {shippingService: {getTracking: async (...args) => liveReply(...args)}};
    if (name.includes('trackingStates')) return load('src/features/storefront/data/trackingStates.ts', {});
    if (name.includes('components/ui')) return Object.fromEntries(['Button','Input','Badge','Alert','Icon'].map(type => [type, type]));
    throw Error(name);
  };
  const Confirmation = load('src/features/storefront/pages/OrderConfirmation.tsx', {require: requireMock}).default;
  const exampleFrame = { parent: { location: { pathname: '/emprendedor/diseno/editor' } } };
  const PreviewConfirmation = load('src/features/storefront/pages/OrderConfirmation.tsx', {require: requireMock, window: exampleFrame}).default;
  location = {search: '', state: null};
  assert.ok(nodes(PreviewConfirmation()).includes('VISTA-PREVIA'));
  exampleFrame.parent.location.pathname = '/plantilla/1';
  assert.ok(nodes(PreviewConfirmation()).some(node => node.type === 'Navigate'));
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
    for (const value of [identifier, 'Producto real', 'Comprador real', 'En tránsito', '15000']) assert.ok(tree.includes(value), value);

    // Entrada directa: conserva el formulario y consulta solo al pulsar.
    resetTracking(); location = {search: '', state: null};
    tree = render(Tracking);
    assert.equal(trackCalls.length, 0);
    assert.equal(tree.find(node => node.type === 'Input' && node.props.label === 'Número de orden').props.value, '');
    tree.find(node => node.type === 'Input' && node.props.label === 'Número de orden').props.onChange({target: {value: 'ORD-INVALIDA'}});
    tree = render(Tracking);
    assert.match(tree.find(node => node.type === 'Input' && node.props.label === 'Número de orden').props.error, /formato ORD-AAAAMMDD-XXXX/);
    assert.equal(tree.find(node => node.props?.onClick && nodes(node).some(value => typeof value === 'string' && value.startsWith('Consultar pedido'))).props.disabled, true);
    tree.find(node => node.type === 'Input' && node.props.label === 'Número de orden').props.onChange({target: {value: identifier}});
    tree.find(node => node.type === 'Input' && node.props.label === 'Correo electrónico').props.onChange({target: {value: 'correo-invalido'}});
    tree = render(Tracking);
    assert.match(tree.find(node => node.type === 'Input' && node.props.label === 'Correo electrónico').props.error, /correo electrónico válido/);
    assert.equal(tree.find(node => node.props?.onClick && nodes(node).some(value => typeof value === 'string' && value.startsWith('Consultar pedido'))).props.disabled, true);
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
  location = {search: '?orden=ORD-20261008-OLD1', state: {email}}; render(Tracking);
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
  // SCRUM-355 y SCRUM-356: En tránsito y En reparto, sin códigos crudos del transportista.
  const carrier = (estado_actual, historial) => ({numero_seguimiento: 'STK1234567', proveedor: 'Starken', estado_actual,
    descripcion_estado: 'Detalle del operador', fecha_estimada_entrega: '', historial});
  for (template of [1, 2, 3, 4]) {
    for (const [code, label] of [['EMITIDO', 'En origen'], ['EN_TRANSITO_INTERURBANO', 'En tránsito'],
      ['EN_CENTRO_DISTRIBUCION', 'En tránsito'], ['EN_REPARTO_DOMICILIO', 'En reparto'], ['EN_DISTRIBUCION', 'En reparto']]) {
      resetTracking(); location = {search: '?orden=STK1234567', state: {email}};
      liveReply = async () => carrier(code, [{fecha_hora: '2026-10-08T12:00:00Z', estado: code, descripcion: 'Evento', ubicacion: 'Hub'}]);
      render(Tracking); const tree = await settle();
      assert.ok(tree.includes(label), `${code} debe mostrarse como ${label}`);
      assert.ok(!tree.includes(code) && !tree.includes(code.replaceAll('_', ' ')), `${code} no debe mostrarse crudo`);
      assert.ok(tree.some(node => node.type === 'Badge' && nodes(node).includes(label)), 'La insignia usa la etapa estandarizada');
    }
  }
  liveReply = async () => ({historial: []});
  // Estado del pedido: "En tránsito" y "En reparto" coherentes en la insignia y en los pasos.
  for (template of [1, 2, 3, 4]) {
    for (const [estado, label] of [['enviado', 'En tránsito'], ['en_reparto', 'En reparto']]) {
      resetTracking(); request = async () => ({...real, estado}); location = {search: `?orden=${identifier}`, state: {email}};
      render(Tracking); const tree = await settle();
      assert.ok(tree.some(node => node.type === 'Badge' && nodes(node).includes(label)), `${estado}: la insignia dice ${label}`);
      assert.ok(tree.filter(value => value === label).length >= 2, `${estado}: tambien aparece en los pasos`);
      assert.ok(!tree.includes('Despachado'), 'Ya no se usa "Despachado"');
    }
  }
  // El servicio acepta el estado En reparto.
  reply = {ok: true, json: async () => ({exito: true, data: {...real, estado: 'en_reparto'}})};
  assert.equal((await orderService.track(identifier, email)).estado, 'en_reparto');
})().catch(error => {console.error(error); process.exitCode = 1;});
