// Ejecuta Checkout real con hooks y servicios simulados. No usa red ni crea pedidos.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), {test} = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({type, props});
function nodes(value, out = []) {
  if (Array.isArray(value)) value.forEach(v => nodes(v, out));
  else if (value && typeof value === 'object') {out.push(value);nodes(value.props?.children, out);}
  else if (typeof value === 'string' || typeof value === 'number') out.push(value);
  return out;
}
const text = tree => nodes(tree).filter(v => typeof v === 'string' || typeof v === 'number').join(' ');
const tick = () => new Promise(setImmediate);
function harness({enabled = true} = {}) {
  let states=[], refs=[], effects=[], pending=[], cursor=0, rc=0, ec=0, tree;
  let timers=new Map(), nextTimer=0, calls=[], created=[], request, orderError;
  const config={blue_express:{enabled},chilexpress:{enabled:false},starken:{enabled:true},pickup:{enabled:false}};
  const cart={items:[{productId:'product-1',variantId:'SKU-1',sku:'SKU-1',name:'Prueba',image:'',attributes:{},price:10000,quantity:1}],
    subtotal:10000,promoCode:'',shippingMethod:'',clearCart:async()=>{},removePromo(){},setShippingMethod(value){cart.shippingMethod=value;}};
  const imports = name => {
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react')return {
      useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;
        return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
      useRef(initial){const i=rc++;return refs[i]??(refs[i]={current:initial});},
      useMemo:fn=>fn(),
      useEffect(fn,deps){const i=ec++,old=effects[i];if(!old||!deps||deps.some((v,k)=>!Object.is(v,old.deps[k]))){
        effects[i]={deps};pending.push(()=>{old?.cleanup?.();effects[i].cleanup=fn();});}}
    };
    if(name==='react-router-dom')return {Link:'Link',useNavigate:()=>()=>{}};
    if(name==='@react-oauth/google')return {useGoogleLogin:()=>()=>{}};
    if(name.includes('authService'))return {authService:{hasSession:()=>false}};
    if(name.includes('CartContext'))return {useCart:()=>cart};
    if(name.includes('StoreIdentityContext'))return {useStoreIdentity:()=>({identity:null})};
    if(name.includes('storePreferences'))return {readCheckoutAuthSettings:()=>({guestCheckout:true,requiresAuth:'optional',google:false})};
    if(name.includes('useStorefrontTemplate'))return {useStorefrontTemplate:()=>({route:p=>'/'+p,templateNumber:1})};
    if(name.includes('visual/pages'))return {checkoutPreviewStep:()=> 'contact'};
    if(name.includes('mockData'))return {formatPrice:n=>`CLP ${n}`};
    if(name.includes('comunasChile'))return {comunasDeRegion:()=>['Providencia'],esComunaDeRegion:(c,r)=>c==='Providencia'&&!!r};
    if(name.includes('blueExpressService'))return {fetchBlueQuote:async(payload,signal)=>{
      calls.push({payload,signal});if(request)return request(payload,signal);
      return {total:String(2646+(payload.items.reduce((sum,item)=>sum+item.cantidad,0)-1)*1000),cotizacion:'signed-test',items:payload.items,vence_en:Math.floor(Date.now()/1000)+900,fecha_estimada_entrega:null};}};
    if(name.includes('shippingService'))return {getDeliveryAlternatives:async()=>config,getShippingQuotes:async()=>{
      throw Object.assign(new Error('No hay una tarifa disponible para este destino.'),{kind:'sin_tarifa'});}};
    if(name.includes('BlueExpressDestination'))return {default:'BlueExpressDestination'};
    if(name.includes('PickupDetails'))return {default:'PickupDetails'};
    if(name.includes('orderService'))return {orderService:{create:async payload=>{created.push(payload);throw orderError||new Error('Pedido interceptado por la prueba');}}};
    if(name.includes('promotionService'))return {validatePromotion:async()=>{throw Error('Promoción inesperada');}};
    if(name.includes('PaymentService'))return {};
    if(name.includes('CommercialOptIn'))return {CommercialOptIn:'CommercialOptIn'};
    if(name.includes('commercialConsent'))return {requestConsent:async()=>({mensaje:''})};
    if(name.endsWith('components/ui'))return Object.fromEntries(['Stepper','Button','Input','Select','Alert','Icon'].map(v=>[v,v]));
    if(name.includes('components/states'))return {ErrorState:'ErrorState',LoadingState:'LoadingState'};
    throw Error('Import no simulado: '+name);
  };
  const source=fs.readFileSync(path.join(root,'src/features/storefront/pages/Checkout.tsx'),'utf8').replaceAll('import.meta.env.VITE_API_URL', 'undefined');
  const compiled=ts.transpileModule(source,{fileName:'Checkout.tsx',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
  assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  vm.runInNewContext(compiled.outputText,{module,exports:module.exports,require:imports,Error,console,AbortController,
    crypto:{randomUUID:()=> 'test-key'},window:{scrollTo(){},location:{origin:'http://test',search:''}},
    setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    fetch:async url=>{
      assert.match(url,/\/api\/pagos\/activos\/$/);
      return {ok:true,json:async()=>({exito:true,data:{transfer:{enabled:true,fields:Object.fromEntries(['bank_name','account_type','account_number','holder_rut','holder_name','confirmation_email'].map(k=>[k,'Prueba']))}}})};
    }});
  function render(){cursor=rc=ec=0;tree=module.exports.default();const jobs=pending;pending=[];jobs.forEach(fn=>fn());return tree;}
  async function settle(){for(let i=0;i<4;i++){render();await tick();}return render();}
  function find(type,predicate=()=>true){return nodes(tree).find(n=>n?.type===type&&predicate(n.props));}
  function input(label,value){const n=find('Input',p=>p.label===label);assert.ok(n,'Input '+label);n.props.onChange({target:{value}});render();}
  async function next(){const n=nodes(tree).find(n=>n?.props?.onClick&&text(n).includes('Continuar'));assert.ok(n);await n.props.onClick();await settle();}
  async function ready(){await settle();input('Nombre completo','Cliente Prueba');input('Correo electrónico','prueba@example.com');await next();cart.setShippingMethod('Blue Express');await settle();}
  function destination(district='PRO'){const n=find('BlueExpressDestination');assert.ok(n,'Selector Blue');n.props.onChange({codes:{region_code:13,commune_code:13123,district_code:district},regionName:'Metropolitana de Santiago',communeName:'Providencia',districtName:district});render();}
  async function quote(){await settle();for(const [id,t] of [...timers])if(t.delay===350){timers.delete(id);t.fn();}await settle();}
  async function confirm(){input('Calle','Calle Prueba');input('Número','123');destination();await quote();await next();
    const payment=nodes(tree).find(n=>n?.props?.type==='radio'&&n.props.value==='Transferencia');assert.ok(payment);payment.props.onChange();await settle();await next();
    const button=nodes(tree).find(n=>n?.props?.onClick&&text(n).startsWith('Confirmar y pagar'));assert.ok(button);assert.equal(Boolean(button.props.disabled),false);await button.props.onClick();await settle();}
  return {ready,settle,render,next,input,destination,quote,confirm,cart,config,find,
    get tree(){return tree},get calls(){return calls},get created(){return created},
    set request(v){request=v},set orderError(v){orderError=v}};
}
test('Blue deshabilitado no aparece',async()=>{const h=harness({enabled:false});await h.ready();assert.equal(nodes(h.tree).some(n=>n?.props?.type==='radio'&&n.props.value==='Blue Express'),false);assert.equal(h.calls.length,0);});
test('Destino completo cotiza y actualiza total',async()=>{const h=harness();await h.ready();h.destination();await h.quote();assert.equal(h.calls.length,1);assert.equal(h.calls[0].payload.items[0].cantidad,1);assert.match(text(h.tree),/CLP 12646/);});
test('Cambio de localidad elimina tarifa anterior',async()=>{const h=harness();await h.ready();h.destination();await h.quote();h.destination('OTRA');assert.match(text(h.tree),/Total parcial/);await h.quote();assert.equal(h.calls[1].payload.destino.district_code,'OTRA');});
test('Varias unidades cotizan el carrito completo',async()=>{const h=harness();await h.ready();h.cart.items[0].quantity=2;h.cart.subtotal=20000;await h.settle();h.destination();await h.quote();assert.equal(h.calls.length,1);assert.equal(h.calls[0].payload.items[0].cantidad,2);assert.match(text(h.tree),/CLP 23646/);});
test('Cantidades inválidas bloquean la consulta',async()=>{const h=harness();await h.ready();h.cart.items[0].quantity=0;await h.settle();await h.quote();assert.equal(h.calls.length,0);assert.match(text(h.tree),/cantidades inválidos/);});
test('Respuesta tardía cancelada no restaura el precio',async()=>{const h=harness();await h.ready();let release;h.request=()=>new Promise(r=>release=r);h.destination();await h.quote();h.destination('OTRA');await h.settle();release({total:'9999',cotizacion:'old'});await h.settle();assert.match(text(h.tree),/Total parcial/);assert.doesNotMatch(text(h.tree),/19999/);assert.equal(h.calls[0].signal.aborted,true);});
test('Pedido simulado incluye token y códigos Blue, sin precio de envío',async()=>{const h=harness();await h.ready();await h.confirm();assert.equal(h.created.length,1);assert.equal(h.created[0].shippingQuote,'signed-test');assert.equal(h.created[0].blueDestination.district_code,'PRO');assert.equal(h.created[0].shipping,undefined);});
test('Token rechazado devuelve a Entrega',async()=>{const h=harness();await h.ready();h.orderError=Object.assign(new Error('Cotización inválida'),{code:'BLUE_COTIZACION_INVALIDA'});await h.confirm();assert.ok(h.find('BlueExpressDestination'));assert.match(text(h.tree),/Total parcial/);});
test('Starken sin tarifa bloquea avance y cambio de destino limpia aviso viejo',async()=>{const h=harness();await h.ready();h.cart.setShippingMethod('Starken');await h.settle();const select=h.find('Select',p=>p.label==='Comuna');select.props.onChange({target:{value:'Providencia'}});h.input('Calle','Prueba');h.input('Número','1');await h.quote();await h.next();assert.match(text(h.tree),/No hay una tarifa/);assert.doesNotMatch(text(h.tree),/Selecciona un método de entrega/);h.find('Select',p=>p.label==='Región').props.onChange({target:{value:'Arica'}});await h.settle();assert.doesNotMatch(text(h.tree),/No hay una tarifa/);});