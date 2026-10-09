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
  let quoteCalls, created, request, timerId, timers, now, networkReply;
  class Clock extends Date {static now() {return now;}}
  const cart = {items: [{productId: 'real-product', variantId: 'SKU', sku: 'SKU', name: 'Real', attributes: {}, price: 60000, quantity: 1, image: ''}],
    subtotal: 60000, discount: 12000, shipping: 3490, total: 51490, promoCode: 'VERANO20', shippingMethod: 'Retiro',
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
      if (name.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => `/plantilla/${template}/${p}`,
        isMinimal: template === 2, isVisual: template === 3, isCatalog: template === 4})};
      if (name.includes('mockData')) return {formatPrice: n => `CLP ${n}`};
      if (name.includes('comunasChile')) return territory;
      if (name.includes('shippingService')) return {
        getDeliveryAlternatives: async () => {if (failConfig) throw Error('Error de alternativas'); return config;},
        getShippingQuotes: realShipping.getShippingQuotes,
      };
      if (name.includes('orderService')) return {orderService: {create: async data => {created.push(data); throw Error('Stop after payload');}}};
      if (name.includes('PaymentService')) return {};
      if (name.includes('components/ui')) return Object.fromEntries(['Stepper','Button','Input','Select','Alert','Icon'].map(type => [type,type]));
      throw Error(name);
    },
  }).default;
  function reset() {
    effects?.forEach(effect => effect.cleanup?.());
    now = 1800000000000; timerId = 0; timers = new Map();
    states = [[], true, '', 0, 'delivery', 'guest', {name: 'Buyer', email: 'buyer@example.com', phone: ''},
      {street: 'Street', number: '1', apt: '', city: '', region: 'Metropolitana'}, 'Transferencia', false, {}];
    refs = []; effects = []; pending = []; failConfig = false; created = []; quoteCalls = []; request = null;
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
    get config() {return config;}, set fail(value) {failConfig = value;}, set request(value) {request = value;},
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
    assert.ok(tree.includes('CLP 4500')); assert.ok(tree.includes('CLP 52500'));
    assert.ok(!tree.includes('CLP 3490') && !tree.includes('CLP 51490'));
    assert.equal(h.calls.length,1); assert.equal(h.calls[0].query.operador,'Chilexpress');
    assert.equal(h.confirm(h.toConfirm()).props.disabled,false);
  });
  await t.test('seleccionar Starken invalida Chilexpress y usa su tarifa', async () => {
    h.reset(); let tree = await h.ready();
    radios(tree).find(node=>node.props.value==='Starken').props.onChange();
    tree = h.toConfirm(); assert.equal(h.confirm(tree).props.disabled,true);
    tree = await h.settle(); assert.ok(tree.includes('CLP 54900'));
    assert.equal(h.confirm(tree).props.disabled,false);
    assert.equal(h.calls.at(-1).query.operador,'Starken');
    await h.confirm(tree).props.onClick(); assert.equal(h.created[0].shippingQuote,'signed:Starken:Providencia');
  });
  await t.test('cambiar comuna invalida inmediatamente e impide confirmar durante carga', async () => {
    h.reset(); await h.ready(); let release;
    h.request = query => new Promise(resolve=>{release=()=>resolve(h.response(query,{monto:'8500'}));});
    h.setAddress({city:'Santiago'}); let tree = h.toConfirm();
    assert.equal(h.confirm(tree).props.disabled,true); assert.ok(!tree.includes('CLP 52500'));
    await h.confirm(tree).props.onClick(); assert.equal(h.created.length,0);
    release(); tree = await h.settle(); assert.ok(tree.includes('CLP 56500'));
    assert.equal(h.confirm(tree).props.disabled,false);
  });
  await t.test('cambiar región no reutiliza cotización aunque la comuna sea anterior', async () => {
    h.reset(); await h.ready(); h.setAddress({region:'Valparaíso'});
    const tree = h.toConfirm(); assert.equal(h.confirm(tree).props.disabled,true);
    assert.ok(!tree.includes('CLP 52500')); assert.equal(h.calls.length,1);
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
    tree=await h.settle(); assert.ok(tree.includes('CLP 52500'));
  });
  await t.test('cotización vencida bloquea confirmación', async () => {
    h.reset(); await h.ready(); h.expire();
    const tree=h.toConfirm(); assert.equal(h.confirm(tree).props.disabled,true);
    assert.ok(tree.includes('La cotización venció. Vuelve a cotizar el envío.'));
    assert.ok(!tree.includes('CLP 52500'));
  });
  await t.test('Retiro usa cero, dirección/horario y no cotiza con o sin destino', async () => {
    h.reset(); h.render(); await h.settle(); h.cart.shippingMethod='Retiro'; h.states[8]='Transferencia'; let tree=await h.settle();
    assert.ok(tree.some(value=>typeof value==='string' && value.includes('Local 123') && value.includes('9 a 18')));
    assert.ok(tree.includes('Gratis'));
    assert.equal(h.calls.length,0); assert.ok(!tree.some(node=>node.props?.label==='Región'));
    h.setAddress({city:'Providencia'}); tree=await h.settle(); assert.equal(h.calls.length,0);
    tree=h.toConfirm(); assert.ok(tree.includes('CLP 48000')); assert.equal(h.confirm(tree).props.disabled,false);
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
