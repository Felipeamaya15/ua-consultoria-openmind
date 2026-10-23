const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), {test} = require('node:test'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals = {}) {
  const module = {exports: {}};
  const source = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('import.meta.env.VITE_API_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    {module, exports: module.exports, Error, console, AbortController, ...globals});
  return module.exports;
}
const jsx = (type, props) => ({type, props});
function nodes(tree, out = []) {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, out));
  else if (tree && typeof tree === 'object') {out.push(tree); nodes(tree.props?.children, out);}
  else if (typeof tree === 'string' || typeof tree === 'number') out.push(tree);
  return out;
}
const territory = load('src/features/storefront/data/comunasChile.ts', {
  require: () => ({default: require('../src/features/admin/data/chileTerritory.json')}),
});
const tick = () => new Promise(setImmediate);
const same = (a,b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
function harness(template) {
  let states, cursor, refs, refCursor, effects, effectCursor, pending, config, failConfig;
  let quoteCalls, created, request, timerId, timers, now, networkReply, createError;
  class Clock extends Date {static now() {return now;}}
  const cart = {items: [{productId: 'real-product', variantId: 'SKU', sku: 'SKU', name: 'Real', attributes: {}, price: 60000, quantity: 1, image: ''}],
    subtotal: 60000, discount: 12000, shipping: 3490, total: 51490, promoCode: '', shippingMethod: 'Retiro',
    clearCart: async () => {}, setShippingMethod: value => {cart.shippingMethod = value;}};
  const realShipping = load('src/features/storefront/services/shippingService.ts', {
    Date: Clock,
    require: name => name.endsWith('/api') ? {API_BASE_URL: 'https://api.example.test'}
      : name.includes('comunasChile') ? territory : name.includes('initialLoad') ? {} : {authService: {getToken() {}}},
    fetch: async (url, options) => {
      const query = JSON.parse(options.body); quoteCalls.push({url, options, query});
      if (request) return request(query, options.signal);
      return response(query);
    },
  });
  function response(query, overrides = {}) {
    const rate = {operador: query.operador, monto: query.operador === 'Chilexpress' ? '4500' : '6900',
      plazo_dias: 2, moneda: 'CLP', region: territory.nombreOficialRegion(query.region), comuna: query.comuna,
      origen: 'configuracion_tienda', cotizacion: `signed:${query.operador}:${query.comuna}`, vence_en: now / 1000 + 900, ...overrides};
    return {ok: true, json: async () => ({exito: true, data: {tarifas: [rate]}})};
  }
  const Checkout = load('src/features/storefront/pages/Checkout.tsx', {
    Date: Clock, crypto: {randomUUID: () => 'new-order-key'},
    setTimeout: (callback, delay) => {const id = ++timerId; timers.set(id, {callback, due: now + delay}); return id;},
    clearTimeout: id => timers.delete(id),
    localStorage: {getItem: () => '{invalid'}, window: {scrollTo() {}, location: {origin: 'http://localhost'}},
    fetch: async () => networkReply,
    require: name => {
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
      if (name === 'react') return {
        useState(initial) {const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
          return [states[i], value => {states[i] = typeof value === 'function' ? value(states[i]) : value;}];},
        useRef(initial) {const i = refCursor++; if (!(i in refs)) refs[i] = {current: initial}; return refs[i];},
        useMemo: fn => fn(), useEffect(fn, deps) {
          const i = effectCursor++;
          if (!effects[i] || !same(effects[i].deps, deps)) {
            const cleanup = effects[i]?.cleanup; effects[i] = {deps};
            pending.push(() => {cleanup?.(); effects[i].cleanup = fn();});
          }
        },
      };
      if (name === 'react-router-dom') return {Link: 'Link', useNavigate: () => () => {}};
      if (name.includes('CartContext')) return {useCart: () => cart};
      if (name.includes('StoreIdentityContext')) return {useStoreIdentity: () => ({identity: null})};
      if (name.includes('storePreferences')) return {readCheckoutAuthSettings: () => ({emailPassword: true, google: true, guestCheckout: true, requiresAuth: 'optional'})};
      if (name.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => `/plantilla/${template}/${p}`,
        isMinimal: template === 2, isVisual: template === 3, isCatalog: template === 4})};
      if (name.includes('mockData')) return {formatPrice: n => `CLP ${n}`};
      if (name.includes('comunasChile')) return territory;
      if (name.includes('shippingService')) return {
        getDeliveryAlternatives: async () => {if (failConfig) throw Error('Error de alternativas'); return config;},
        getShippingQuotes: realShipping.getShippingQuotes,
      };
      if (name.includes('PickupDetails')) return {default: 'PickupDetails'};
      if (name.includes('PickupSchedule')) return {default: 'PickupSchedule'};
      if (name.includes('pickupSchedule')) return {pickupTimes: () => [], pickupSelectionLabel: () => ''};
      if (name.includes('orderService')) return {orderService: {create: async data => {created.push(data); throw createError || Error('Stop after payload');}}};
      if (name.includes('promotionService')) return {validatePromotion: async code => ({code, type: 'fixed', discount: 1000, shipping: 0, message: 'Aplicado'})};
      if (name.includes('PaymentService')) return {};
      if (name.endsWith('visual/pages')) return load('src/features/storefront/visual/pages.ts', {URLSearchParams});
      if (name.includes('components/ui')) return Object.fromEntries(['Stepper','Button','Input','Select','Alert','Icon'].map(type => [type,type]));
      if (name.includes('shared/components/states')) return {LoadingState: 'LoadingState', ErrorState: 'ErrorState', EmptyListState: 'EmptyListState'}; if (name.includes('humanizeError')) return {humanizeAdminError: message => message}; throw Error(name);
    },
  }).default;
  function reset() {
    effects?.forEach(effect => effect.cleanup?.());
    now = 1800000000000; timerId = 0; timers = new Map();
    states = [[], true, '', 0, 'delivery', 'guest', {name: 'Buyer', email: 'buyer@example.com', phone: ''},
      {street: 'Street', number: '1', apt: '', city: '', region: 'Metropolitana'}, 'Transferencia', false, {}];
    refs = []; effects = []; pending = []; failConfig = false; created = []; quoteCalls = []; request = null; createError = null;
    cart.shippingMethod = 'Retiro';
    config = {chilexpress: {enabled: true}, starken: {enabled: true}, pickup: {enabled: true, address: 'Local 123', schedule: '9 a 18'}};
    networkReply = {ok: true, json: async () => ({exito: true, data: {transfer: {enabled: true, fields: Object.fromEntries(['bank_name','account_type','account_number','holder_rut','holder_name','confirmation_email'].map(key=>[key,'qa']))}}})};
  }
  function render(runEffects = true) {
    cursor = 0; refCursor = 0; effectCursor = 0;
    const tree = nodes(Checkout());
    if (runEffects) {const work = pending; pending = []; work.forEach(fn => fn());}
    return tree;
  }
  async function settle() {await tick(); render(); await tick(); return render();}
  async function ready(method = 'Chilexpress') {
    render(); await settle();
    cart.shippingMethod = method; states[8] = 'Transferencia'; states[7].city = 'Providencia';
    render(); return settle();
  }
  function confirm(tree = render()) {
    return tree.find(node => node.props?.onClick && nodes(node).some(value => typeof value === 'string' && value.startsWith('Confirmar y pagar')));
  }
  function toConfirm() {states[4] = 'confirm'; return render();}
  const setAddress = changes => {states[7] = {...states[7], ...changes};};
  reset();
  return {reset, render, settle, ready, confirm, toConfirm, setAddress, response,
    get states() {return states;}, get calls() {return quoteCalls;}, get created() {return created;}, get cart() {return cart;},
    get config() {return config;}, set fail(value) {failConfig = value;}, set request(value) {request = value;}, set createError(value) {createError = value;},
    get shipping() {return realShipping;}, expire() {now += 901000; [...timers.values()].forEach(timer => {if(timer.due <= now) timer.callback();});},
  };
}

test('Catálogo territorial: 16 regiones, alias y comunas consistentes con backend', () => {
  for (const region of ['Metropolitana','Valparaíso','Biobío','Araucanía','Los Lagos','Antofagasta','Atacama','Coquimbo','OHiggins','Maule','Ñuble','Los Ríos','Aysén','Magallanes','Arica','Tarapacá']) {
    assert.ok(territory.comunasDeRegion(region).length, region);
  }
  assert.ok(territory.esComunaDeRegion('Providencia', 'Metropolitana'));
  assert.equal(territory.esComunaDeRegion('Providencia', 'Valparaíso'), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '../backend/apps/core/data/chile_territory.json'), 'utf8')),
    require('../src/features/admin/data/chileTerritory.json'));
});

test('Servicio: request, referencia, precio y errores de contrato', async () => {
  const h = harness(1), controller = new AbortController();
  const quote = (await h.shipping.getShippingQuotes('Chilexpress','Metropolitana','Providencia',controller.signal))[0];
  assert.equal(quote.monto, 4500); assert.equal(quote.cotizacion, 'signed:Chilexpress:Providencia');
  assert.equal(h.calls[0].url, 'https://api.example.test/api/entregas/cotizacion/');
  assert.deepEqual(h.calls[0].query, {operador:'Chilexpress',region:'Metropolitana',comuna:'Providencia'});
  assert.equal(h.calls[0].options.signal, controller.signal);
  for (const invalid of [{monto:'NaN'}, {monto:'-1'}, {monto:''}, {monto:'4500.5'}, {cotizacion:''}, {vence_en:1},
    {operador:'Starken'}, {region:'Valparaíso'}, {comuna:'Santiago'}, {moneda:'USD'}]) {
    h.request = async query => h.response(query, invalid);
    await assert.rejects(h.shipping.getShippingQuotes('Chilexpress','Metropolitana','Providencia'), /cotización recibida es inválida/);
  }
  h.request = async () => ({ok:false,json:async()=>({exito:false,error:{detalles:{cotizacion:['Tarifa no disponible']}}})});
  await assert.rejects(h.shipping.getShippingQuotes('Chilexpress','Metropolitana','Providencia'), /Tarifa no disponible/);
});

for (const template of [1,2,3,4]) test(`Plantilla ${template}: checkout y despacho`, async t => {
  const h = harness(template);
  const radios = tree => tree.filter(node => node.type === 'input' && node.props.name === 'shipping');
  const select = (tree, label) => tree.find(node => node.type === 'Select' && node.props.label === label);
  await t.test('solo muestra métodos habilitados desde API', async () => {
    for (const [method,key] of [['Chilexpress','chilexpress'],['Starken','starken'],['Retiro','pickup']]) {
      h.reset(); for (const value of Object.values(h.config)) value.enabled = false;
      h.config[key].enabled = true; h.render(); const tree = await h.settle();
      assert.deepEqual(radios(tree).map(node=>node.props.value),[method]);
    }
  });
  await t.test('sin alternativas y error de carga no hay fallback', async () => {
    h.reset(); for (const value of Object.values(h.config)) value.enabled = false;
    h.render(); let tree = await h.settle(); assert.equal(radios(tree).length,0);
    assert.ok(tree.includes('La tienda todavía no tiene alternativas de entrega habilitadas.'));
    await h.confirm(h.toConfirm()).props.onClick(); assert.equal(h.created.length,0);
    h.reset(); h.fail = true; h.render(); tree = await h.settle();
    assert.ok(tree.includes('Error de alternativas')); assert.equal(radios(tree).length,0);
  });
  await t.test('seleccionar región y comuna carga catálogo correcto', async () => {
    h.reset(); let tree = await h.ready();
    select(tree,'Región').props.onChange({target:{value:'Valparaíso'}}); tree = h.render();
    assert.equal(h.states[7].city,'');
    const options = select(tree,'Comuna').props.options;
    assert.ok(options.some(option=>option.value==='Viña del Mar'));
    assert.ok(!options.some(option=>option.value==='Providencia'));
    select(tree,'Comuna').props.onChange({target:{value:'Viña del Mar'}});
    await h.settle(); assert.equal(h.calls.at(-1).query.comuna,'Viña del Mar');
    assert.equal(h.calls.at(-1).query.region,'Valparaíso');
  });
  await t.test('Chilexpress muestra tarifa y total exactos sobre 50.000', async () => {
    h.reset(); const tree = await h.ready();
    assert.ok(tree.includes('CLP 4500')); assert.ok(tree.includes('CLP 64500'));
    assert.ok(!tree.includes('CLP 3490') && !tree.includes('CLP 51490'));
    assert.equal(h.calls.length,1); assert.equal(h.calls[0].query.operador,'Chilexpress');
    assert.equal(h.confirm(h.toConfirm()).props.disabled,false);
  });
  await t.test('seleccionar Starken invalida Chilexpress y usa su tarifa', async () => {
    h.reset(); let tree = await h.ready();
    radios(tree).find(node=>node.props.value==='Starken').props.onChange();
    tree = h.toConfirm(); assert.equal(h.confirm(tree).props.disabled,true);
    tree = await h.settle(); assert.ok(tree.includes('CLP 66900'));
    assert.equal(h.confirm(tree).props.disabled,false);
    assert.equal(h.calls.at(-1).query.operador,'Starken');
    await h.confirm(tree).props.onClick(); assert.equal(h.created[0].shippingQuote,'signed:Starken:Providencia');
  });
  await t.test('cambiar comuna invalida inmediatamente e impide confirmar durante carga', async () => {
    h.reset(); await h.ready(); let release;
    h.request = query => new Promise(resolve=>{release=()=>resolve(h.response(query,{monto:'8500'}));});
    h.setAddress({city:'Santiago'}); let tree = h.toConfirm();
    assert.equal(h.confirm(tree).props.disabled,true); assert.ok(!tree.includes('CLP 64500'));
    await h.confirm(tree).props.onClick(); assert.equal(h.created.length,0);
    release(); tree = await h.settle(); assert.ok(tree.includes('CLP 68500'));
    assert.equal(h.confirm(tree).props.disabled,false);
  });
  await t.test('cambiar región no reutiliza cotización aunque la comuna sea anterior', async () => {
    h.reset(); await h.ready(); h.setAddress({region:'Valparaíso'});
    const tree = h.toConfirm(); assert.equal(h.confirm(tree).props.disabled,true);
    assert.ok(!tree.includes('CLP 64500')); assert.equal(h.calls.length,1);
  });
  await t.test('respuesta tardía de destino anterior no restaura tarifa', async () => {
    h.reset(); let finishOld;
    h.request = query => new Promise(resolve=>{finishOld=()=>resolve(h.response(query,{monto:'1111'}));});
    await h.ready(); assert.equal(h.calls.length,1);
    const old = finishOld; h.request = null; h.setAddress({city:'Santiago'});
    let tree = await h.settle(); assert.ok(tree.includes('CLP 4500'));
    old(); tree = await h.settle(); assert.ok(!tree.includes('CLP 1111'));
    h.toConfirm(); await h.confirm().props.onClick(); assert.equal(h.created[0].shippingQuote,'signed:Chilexpress:Santiago');
  });
  await t.test('fallo al cotizar bloquea y permite reintento sin 3.490', async () => {
    h.reset(); h.request = async()=>({ok:false,json:async()=>({mensaje:'Cotización no disponible'})});
    let tree = await h.ready(); assert.ok(tree.includes('Cotización no disponible'));
    assert.ok(!tree.includes('CLP 3490')); assert.ok(tree.includes('Por cotizar'));
    assert.equal(h.confirm(h.toConfirm()).props.disabled,true);
    await h.confirm().props.onClick(); assert.equal(h.created.length,0);
    h.states[4]='delivery'; tree=h.render(); h.request=null;
    tree.find(node=>node.props?.onClick && nodes(node).includes('Volver a cotizar')).props.onClick();
    tree=await h.settle(); assert.ok(tree.includes('CLP 64500'));
  });
  await t.test('cotización vencida bloquea confirmación', async () => {
    h.reset(); await h.ready(); h.expire();
    const tree=h.toConfirm(); assert.equal(h.confirm(tree).props.disabled,true);
    assert.ok(tree.includes('La cotización venció. Vuelve a cotizar el envío.'));
    assert.ok(!tree.includes('CLP 64500'));
  });
  await t.test('Retiro usa cero, dirección/horario y no cotiza con o sin destino', async () => {
    h.reset(); h.render(); await h.settle(); h.cart.shippingMethod='Retiro'; h.states[8]='Transferencia'; let tree=await h.settle();
    const details = tree.find(node => node.type === 'PickupDetails');
    assert.equal(details.props.pickup.address,'Local 123'); assert.equal(details.props.pickup.schedule,'9 a 18');
    assert.ok(tree.includes('Retira tu pedido en nuestro establecimiento'));
    assert.ok(!tree.some(value => typeof value === 'string' && value.includes('Local 123')));
    assert.ok(tree.includes('Gratis ($0)'));
    assert.equal(h.calls.length,0); assert.ok(!tree.some(node=>node.props?.label==='Región'));
    h.setAddress({city:'Providencia'}); tree=await h.settle(); assert.equal(h.calls.length,0);
    tree=h.toConfirm(); assert.ok(tree.includes('CLP 60000')); assert.equal(h.confirm(tree).props.disabled,false);
    await h.confirm(tree).props.onClick(); assert.equal(h.created[0].shippingQuote,undefined);
  });
  await t.test('payload conserva dirección, operador y referencia sin precios de cliente', async () => {
    h.reset(); await h.ready(); h.toConfirm(); await h.confirm().props.onClick();
    const data=h.created[0]; assert.equal(data.shippingMethod,'Chilexpress');
    assert.equal(data.address.region,'Metropolitana'); assert.equal(data.address.city,'Providencia');
    assert.equal(data.address.street,'Street'); assert.equal(data.address.number,'1');
    assert.equal(data.shippingQuote,'signed:Chilexpress:Providencia');
    assert.ok(!('costo_envio' in data) && !('total' in data));
  });
  h.reset();
});


// ── SCRUM-341 y SCRUM-349: mensajes y manejo de errores de cotización ─────────────────────────────
const textOf = node => nodes(node).filter(value => typeof value === 'string').join('');
const buttonWith = (tree, text) => tree.find(node => node.props?.onClick && textOf(node).includes(text));
const quoteFailure = (codigo, mensaje) => async () => ({ok: false, status: 400, json: async () => ({exito: false,
  mensaje: 'Los datos enviados contienen errores', error: {codigo, detalles: {cotizacion: [mensaje]}}})});

test('Servicio: los errores de cotización se clasifican por código y no filtran textos técnicos', async () => {
  const h = harness(1), quote = () => h.shipping.getShippingQuotes('Chilexpress', 'Metropolitana', 'Providencia');
  const kinds = {TARIFA_NO_DISPONIBLE: 'sin_tarifa', TRANSPORTISTA_NO_HABILITADO: 'no_disponible', OPERADOR_INVALIDO: 'no_disponible',
    DESTINO_INVALIDO: 'destino', COTIZACION_VENCIDA: 'vencida', COTIZACION_INVALIDA: 'vencida', COTIZACION_CAMBIO: 'vencida',
    ERROR_COTIZACION: 'temporal', CODIGO_DESCONOCIDO: 'temporal'};
  for (const [code, kind] of Object.entries(kinds)) {
    h.request = quoteFailure(code, `Mensaje ${code}`);
    await assert.rejects(quote(), error => error.kind === kind && error.code === code && error.message === `Mensaje ${code}`, code);
  }
  h.request = async () => ({ok: false, json: async () => ({mensaje: 'Cotización no disponible'})});   // servidor sin códigos
  await assert.rejects(quote(), error => error.kind === 'temporal' && error.message === 'Cotización no disponible');
  h.request = async () => {throw new TypeError('Failed to fetch');};
  await assert.rejects(quote(), error => error.kind === 'temporal' && /No pudimos conectar/.test(error.message) && !/Failed/.test(error.message));
  h.request = async () => ({ok: false, status: 502, json: async () => {throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"...");}});
  await assert.rejects(quote(), error => error.kind === 'temporal' && /No pudimos obtener la tarifa/.test(error.message) && !/Unexpected token/.test(error.message));
  const abort = Object.assign(new Error('cancelado'), {name: 'AbortError'});
  h.request = async () => {throw abort;};
  await assert.rejects(quote(), error => error === abort);   // la cancelación se propaga para que la pantalla la ignore
});

test('Entrega: sin tarifa para el destino ofrece otras alternativas en vez de reintentar', async () => {
  const h = harness(1), mensaje = 'No hay una tarifa disponible para este destino. Contacta a la tienda.';
  h.request = quoteFailure('TARIFA_NO_DISPONIBLE', mensaje);
  let tree = await h.ready('Chilexpress');
  assert.ok(tree.includes(mensaje));
  assert.ok(tree.includes('Puedes elegir otra alternativa de entrega o cambiar la comuna de tu dirección.'));
  assert.ok(tree.includes('Sin tarifa'));
  assert.ok(buttonWith(tree, 'Usar Starken') && buttonWith(tree, 'Usar Retiro en tienda'));
  assert.ok(!buttonWith(tree, 'Usar Chilexpress') && !buttonWith(tree, 'Volver a cotizar'));
  assert.equal(h.confirm(h.toConfirm()).props.disabled, true);
  h.reset(); h.request = quoteFailure('TARIFA_NO_DISPONIBLE', mensaje); await h.ready('Chilexpress');
  buttonWith(h.render(), 'Usar Starken').props.onClick();
  h.request = null; tree = await h.settle();
  assert.equal(h.cart.shippingMethod, 'Starken'); assert.ok(tree.includes('CLP 6900'));
  assert.ok(!tree.includes(mensaje));
});

test('Entrega: sin otras alternativas se sugiere cambiar la comuna o contactar a la tienda', async () => {
  const h = harness(1); h.config.starken.enabled = false; h.config.pickup.enabled = false;
  h.request = quoteFailure('TRANSPORTISTA_NO_HABILITADO', 'El transportista no está habilitado en esta tienda.');
  const tree = await h.ready('Chilexpress');
  assert.ok(tree.includes('Puedes cambiar la comuna de tu dirección o contactar a la tienda.'));
  assert.ok(!tree.some(node => node.props?.onClick && textOf(node).startsWith('Usar ')));
});

test('Entrega: destino inválido pide revisar la dirección y no ofrece otras alternativas', async () => {
  const h = harness(1);
  h.request = quoteFailure('DESTINO_INVALIDO', 'Selecciona una comuna de la región elegida.');
  const tree = await h.ready('Chilexpress');
  assert.ok(tree.includes('Revisa la región y la comuna de tu dirección.'));
  assert.ok(!buttonWith(tree, 'Usar Starken') && !buttonWith(tree, 'Volver a cotizar'));
});

test('Entrega: un fallo técnico o una cotización vencida sí permiten volver a cotizar', async () => {
  const h = harness(1);
  h.request = async () => ({ok: false, status: 502, json: async () => {throw new SyntaxError('<html>');}});
  let tree = await h.ready('Chilexpress');
  assert.ok(tree.includes('No pudimos obtener la tarifa de envío en este momento. Intenta nuevamente.'));
  assert.ok(buttonWith(tree, 'Volver a cotizar') && !buttonWith(tree, 'Usar Starken'));
  const calls = h.calls.length; h.request = null;
  buttonWith(tree, 'Volver a cotizar').props.onClick();
  tree = await h.settle();
  assert.equal(h.calls.length, calls + 1); assert.ok(tree.includes('CLP 4500'));
  h.expire(); tree = await h.settle();
  assert.ok(tree.includes('La cotización venció. Vuelve a cotizar el envío.') && buttonWith(tree, 'Volver a cotizar'));
});

test('Confirmar: si la tarifa venció o cambió vuelve a Entrega y vuelve a cotizar', async () => {
  const h = harness(1); await h.ready('Chilexpress');
  const before = h.calls.length;
  h.createError = Object.assign(new Error('La cotización cambió. Vuelve a cotizar el envío.'), {code: 'COTIZACION_CAMBIO'});
  await h.confirm(h.toConfirm()).props.onClick();
  assert.equal(h.states[4], 'delivery');
  const tree = await h.settle();
  assert.ok(tree.includes('La tarifa de envío venció o cambió. La actualizamos: revisa el total y continúa.'));
  assert.equal(h.calls.length, before + 1); assert.ok(tree.includes('CLP 4500'));
  h.reset(); await h.ready('Chilexpress'); h.createError = new Error('Producto sin stock');
  await h.confirm(h.toConfirm()).props.onClick();
  assert.equal(h.states[4], 'confirm'); assert.ok(h.render().includes('Producto sin stock'));
});

test('Pedido: los errores conservan su código y no muestran textos técnicos', async () => {
  let reply;
  const {orderService, OrderError} = load('src/features/storefront/services/orderService.ts', {
    require: name => name.includes('authService') ? {authService: {getToken() {}}} : {}, fetch: async () => reply(),
  });
  const create = () => orderService.create({key: 'k', items: [], contact: {name: 'A', email: 'a@b.cl', phone: ''},
    paymentMethod: 'Transferencia', shippingMethod: 'Chilexpress', promoCode: '', shippingQuote: 'token',
    address: {street: 's', number: '1', apt: '', city: 'Providencia', region: 'Metropolitana'}});
  reply = async () => ({ok: false, json: async () => ({exito: false, mensaje: 'x', error: {codigo: 'COTIZACION_VENCIDA',
    detalles: {cotizacion: ['La cotización venció. Vuelve a cotizar el envío.']}}})});
  await assert.rejects(create(), error => error instanceof OrderError && error.code === 'COTIZACION_VENCIDA'
    && error.message === 'La cotización venció. Vuelve a cotizar el envío.');
  reply = async () => ({ok: false, json: async () => ({detail: 'Credenciales inválidas'})});
  await assert.rejects(create(), error => error instanceof OrderError && error.code === undefined && error.message === 'Credenciales inválidas');
  reply = async () => ({ok: false, json: async () => {throw new SyntaxError("Unexpected token '<'");}});
  await assert.rejects(create(), error => /No pudimos registrar tu pedido/.test(error.message) && !/Unexpected/.test(error.message));
  reply = async () => {throw new TypeError('Failed to fetch');};
  await assert.rejects(create(), error => /No pudimos conectar/.test(error.message) && !/Failed/.test(error.message));
});
