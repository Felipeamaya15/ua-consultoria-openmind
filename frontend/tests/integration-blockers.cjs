const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const { load } = require('./source-loader.cjs');
const consent=load('src/features/storefront/services/cookieConsent.ts');
const scope={apiBaseUrl:'https://api.example.test',storeId:'1',principal:'user:7',legalVersion:'3'};
const memory=()=>{const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
test('consentimientos independientes por instalación, tienda, usuario/visitante y versión',()=>{
 const storage=memory();consent.saveConsent(storage,scope,'accepted');assert.equal(consent.readConsent(storage,scope),'accepted');
 for(const changes of [{apiBaseUrl:'https://other.test'},{storeId:'2'},{principal:'user:8'},{principal:'guest'},{legalVersion:'4'}])assert.equal(consent.readConsent(storage,{...scope,...changes}),null);
 assert.ok(!consent.consentKey(scope).includes('token'));
});
test('reset quita solamente el ámbito actual',()=>{
 const storage=memory();consent.saveConsent(storage,scope,'accepted');const other={...scope,storeId:'2'};consent.saveConsent(storage,other,'essential_only');
 consent.resetConsent(storage,scope);assert.equal(consent.readConsent(storage,scope),null);assert.equal(consent.readConsent(storage,other),'essential_only');
});
test('JSON corrupto, sobre ajeno, fecha y elección inválidas no cuentan como consentimiento',()=>{
 for(const value of ['{','null','[]',JSON.stringify({version:1,scope:'otra',at:new Date().toISOString(),choice:'accepted'}),JSON.stringify({version:1,scope:consent.consentKey(scope),at:'mal',choice:'accepted'})]){
  const storage=memory();storage.setItem(consent.consentKey(scope),value);assert.equal(consent.readConsent(storage,scope),null);assert.equal(storage.getItem(consent.consentKey(scope)),value);
 }
});
test('storage denegado no inventa consentimiento ni borra otras claves',()=>{
 const storage={getItem(){throw Error('denegado')},setItem(){throw Error('denegado')},removeItem(){throw Error('denegado')}};
 assert.equal(consent.readConsent(storage,scope),null);assert.throws(()=>consent.saveConsent(storage,scope,'accepted'));assert.throws(()=>consent.resetConsent(storage,scope));
});
function promotion(fetch){return load('src/features/admin/services/promotionService.ts',{'../../../api':{API_BASE_URL:'http://qa.test'}},{localStorage:{getItem:()=>'owner-fixture'},sessionStorage:{getItem:()=>null},fetch}).promotionService;}
test('PATCH de nombre/estado no reenvía ni trunca fechas; instantes explícitos conservan microsegundos',async()=>{
 const calls=[];const service=promotion(async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({exito:true,data:{id:1,name:'Nombre',code:'CODE',type:'percentage',active:true,value:'10',startsAt:'2026-09-06T02:45:12.123456Z'}})};});
 await service.update({id:'1',name:'Nombre'});await service.update({id:'1',active:false});
 assert.deepEqual(calls,[{name:'Nombre'},{active:false}]);
 await service.update({id:'1',startsAt:'2026-09-05T22:45:12.123456-04:00'});assert.equal(calls[2].startsAt,'2026-09-05T22:45:12.123456-04:00');
 await service.update({id:'1',maxUses:0});assert.equal(calls[3].maxUses,0);
});
test('errores 400/403/409/500 rechazan la operación sin fabricar una respuesta exitosa',async()=>{
 for(const status of [400,403,409,500]){
  const service=promotion(async()=>({ok:false,status,json:async()=>({exito:false,mensaje:'No se guardó'})}));await assert.rejects(service.update({id:'1',active:false}),status===403?/permiso/:status===500?/disponible/:/No se guardó/);
 }
});

test('editar el nombre en el componente conserva campos históricos y permite varias ofertas sin código',async()=>{
 for(const type of ['free_shipping','precio_oferta']){
  const row={id:'1',name:'Histórica',code:type==='precio_oferta'?'':'legacy-code',type,value:999.25,minAmount:0,maxUses:0,usedCount:7,startsAt:'2026-09-06T02:45:12.123456Z',endsAt:'2026-09-07T06:20:43.654321Z',active:true};
  const states=[],effects=[],calls=[];let index=0;
  const jsx=(type,props)=>({type,props});
  const mocks={
   react:{useRef:()=>({current:false}),useState:initial=>{const i=index++;if(!(i in states))states[i]=initial;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next];},useEffect:fn=>{if(!effects.length)effects.push(fn);}},
   'react/jsx-runtime':{jsx,jsxs:jsx},
   '../data/mockAdminData':{formatPrice:String},
   '../context/AdminContext':{useAdmin:()=>({config:{},setConfig:()=>true})},
   '../components/ui':Object.fromEntries(['Button','Badge','Input','Select','Toggle','Modal','Alert'].map(name=>[name,name])),
   '../services/promotionService':{promotionService:{list:async()=>[row,{...row,id:'2',name:'Otra',code:type==='precio_oferta'?'':'OTHER'}],update:async data=>{calls.push(data);return {...row,...data};}}},
  };
  const Page=load('src/features/admin/pages/Promotions.tsx',mocks).default;
  const render=()=>{index=0;return Page();};
  const flatten=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flatten):[node,...flatten(node.props?.children)];
  render();effects[0]();await new Promise(setImmediate);
  let nodes=flatten(render());nodes.find(node=>node.type==='button'&&node.props.children==='Editar').props.onClick();
  nodes=flatten(render());nodes.find(node=>node.type==='Input'&&node.props.label==='Nombre interno').props.onChange({target:{value:'Renombrada'}});
  nodes=flatten(render());nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{id:'1',name:'Renombrada'}]);
 }
});
