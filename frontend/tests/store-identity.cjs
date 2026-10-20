// Run: node tests/store-identity.cjs. No network or business writes.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(setImmediate);
function harness() {
  let identity = { apiBaseUrl: 'https://installation.test', storeId: '1' }, stateIndex=0, effectIndex=0;
  const states=[], effects=[], pending=[], requests=[], storage=new Map(), window=new EventTarget(), modules=new Map();
  const react = {
    createContext: value => ({Provider:'Provider',value}), useContext: c=>c.value, useMemo: f=>f(), useCallback: f=>f,
    useState: initial => { const i=stateIndex++; if (!(i in states)) states[i]=typeof initial==='function'?initial():initial; return [states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}]; },
    useEffect: (run,deps) => { const i=effectIndex++, previous=effects[i]; if(!previous || deps.some((d,j)=>!Object.is(d,previous.deps[j]))) pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:run()};}); },
  };
  function request(kind, options={}) {
    return new Promise((resolve,reject)=>requests.push({kind,store:identity?.storeId,signal:options.signal,resolve,reject}));
  }
  const overrides = {
    react, 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    'react-router-dom':{useLocation:()=>({pathname:'/plantilla/3'})},
  };
  function load(file) {
    file=path.resolve(root,file); if(modules.has(file)) return modules.get(file);
    const module={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:1,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const req=id=>{
      if(id in overrides)return overrides[id];
      if(id.includes('StoreIdentityContext')) return {useStoreIdentity:()=>({identity})};
      if(id.includes('storeInformationService'))return {fetchStoreInformation:signal=>request('business',{signal}),STORE_INFORMATION_CHANGED:'business-saved'};
      if(id.includes('landingService'))return {fetchLandingConfig:options=>request('landing',options),LANDING_CONFIG_CHANGED:'landing-saved'};
      if(id.includes('catalogService'))return {fetchPublicProducts:options=>request('catalog',options)};
      if(id.includes('legalService'))return {legalService:{fetchPublicLegalPages:options=>request('legal',options)}};
      const target=path.resolve(path.dirname(file),id);
      return load(['.ts','.tsx','/index.ts'].map(ext=>target+ext).find(fs.existsSync));
    };
    vm.runInNewContext(code,{module,exports:module.exports,require:req,structuredClone,AbortController,Event,window,localStorage:{getItem:k=>storage.get(k)??null}});
    modules.set(file,module.exports);return module.exports;
  }
  const api=load('src/features/storefront/context/StoreContext.tsx');
  return {
    render(){stateIndex=0;effectIndex=0;return api.StoreProvider({children:null}).props.value;},
    commit(){while(pending.length)pending.shift()();}, requests, window,
    switchStore(value){identity=value;},
    seed(config,storeId='1'){const key=`ua-entrepreneur-demo-v1:store:${encodeURIComponent('https://installation.test')}:${storeId}`;storage.set(key,JSON.stringify({version:1,identity:{apiBaseUrl:'https://installation.test',storeId},config}));},
    cleanup(){effects.forEach(e=>e.cleanup?.());},
  };
}
const landing=(tienda,extra={})=>({id:1,tienda,titulo:'Título editorial distinto',descripcion:'Portada distinta',texto_boton:'Comprar',imagen_principal:null,logo:null,secciones:{},...extra});
(async()=>{
  const h=harness();
  h.seed({name:'Nombre antiguo',description:'Descripción antigua',logo:'/logo-antiguo.png',primaryColor:'#123456'});
  let value=h.render();assert.equal(value.config.name,'');assert.equal(value.config.logo,'');h.commit();
  const first=h.requests.slice();
  first.find(r=>r.kind==='business').resolve({nombre:'Comercial A',descripcion:'Negocio A'});
  first.find(r=>r.kind==='landing').resolve(landing(1,{logo:'/logo-a.png'}));
  first.find(r=>r.kind==='catalog').resolve([{catalogId:'a',name:'Producto A'}]);
  first.find(r=>r.kind==='legal').resolve({terms:{published:'Legal A',version:1}});
  await tick();value=h.render();h.commit();
  assert.equal(value.config.name,'Comercial A');assert.equal(value.config.description,'Negocio A');assert.equal(value.landing.descripcion,'Portada distinta');assert.equal(value.config.logo,'/logo-a.png');assert.equal(value.config.primaryColor,'#123456');
  assert.equal(value.legalVerified,true);assert.equal(value.legalPages.terms.published,'Legal A');
  // A request already in flight must not overwrite a later store or a later refresh.
  h.window.dispatchEvent(new Event('focus'));const late=h.requests.slice(first.length);
  h.seed({name:'Otro nombre antiguo',logo:'/local-b.png',primaryColor:'#654321'},'2');
  h.switchStore({apiBaseUrl:'https://installation.test',storeId:'2'});value=h.render();
  assert.equal(value.config.name,'');assert.equal(value.config.logo,'');assert.equal(value.landing,null);assert.equal(value.landingProducts.length,0);assert.equal(value.config.primaryColor,'#654321');h.commit();
  assert.equal(value.legalVerified,false);assert.notEqual(value.legalPages.terms.published,'Legal A');
  assert(late.every(r=>r.signal.aborted));
  late.find(r=>r.kind==='business').resolve({nombre:'Respuesta tardía A',descripcion:''});late.find(r=>r.kind==='landing').resolve(landing(1,{logo:'/late-a.png'}));
  const next=h.requests.filter(r=>r.store==='2');next.find(r=>r.kind==='business').resolve({nombre:'Comercial B',descripcion:null});next.find(r=>r.kind==='catalog').resolve([]);next.find(r=>r.kind==='landing').resolve(landing(2));await tick();
  value=h.render();h.commit();assert.equal(value.config.name,'Comercial B');assert.equal(value.config.logo,'');assert.equal(value.config.description,'');assert.equal(value.landing.tienda,2);
  h.window.dispatchEvent(new Event('landing-saved'));const saved=h.requests.at(-1);saved.resolve(null);await tick();value=h.render();h.commit();assert.equal(value.landing,null);assert.equal(value.config.logo,'');
  h.window.dispatchEvent(new Event('landing-saved'));h.requests.at(-1).resolve(landing(1,{logo:'/wrong-store.png'}));await tick();value=h.render();h.commit();assert.equal(value.landing,null);assert(value.landingError.includes('no corresponde'));assert.equal(value.config.logo,'');
  // Two saves arriving out of order: only the last request is eligible to publish.
  h.window.dispatchEvent(new Event('business-saved'));const slow=h.requests.at(-1);h.window.dispatchEvent(new Event('business-saved'));const fast=h.requests.at(-1);
  fast.resolve({nombre:'B actualizado',descripcion:'Actual'});slow.resolve({nombre:'B obsoleto',descripcion:''});await tick();assert.equal(h.render().config.name,'B actualizado');h.commit();h.cleanup();
  const failed=harness();failed.seed({name:'Nunca publicar',logo:'/local.png'});failed.render();failed.commit();failed.requests.forEach(r=>r.reject(Error('Sin conexión')));await tick();value=failed.render();assert.equal(value.config.name,'');assert.equal(value.config.logo,'');assert(value.landingError);failed.cleanup();
  const unknown=harness();unknown.switchStore(null);value=unknown.render();unknown.commit();assert.equal(unknown.requests.length,0);assert.equal(value.config.name,'');unknown.cleanup();
  // The existing save contract stays multipart; only successful saves notify mounted views.
  const serviceModule={exports:{}}, target=new EventTarget();let notifications=0, success=true;
  const source=ts.transpileModule(fs.readFileSync(path.join(root,'src/features/landing/services/landingService.ts'),'utf8'),{compilerOptions:{module:1,target:ts.ScriptTarget.ES2020}}).outputText;
  target.addEventListener('openmind:landing-config-changed',()=>notifications++);
  vm.runInNewContext(source,{module:serviceModule,exports:serviceModule.exports,FormData,Event,window:target,
    localStorage:{getItem:()=> 'test-token'},sessionStorage:{getItem:()=>null},
    require:()=>({API_BASE_URL:'https://installation.test'}),
    fetch:async()=>({ok:success,json:async()=>({exito:success,data:landing(1),mensaje:'Error simulado'})}),
  });
  await serviceModule.exports.saveLandingConfig({titulo:'Título',descripcion:'',texto_boton:'Ver',imagen_principal:null,logo:null,secciones:{}});
  assert.equal(notifications,1);success=false;
  await assert.rejects(()=>serviceModule.exports.saveLandingConfig({titulo:'Título',descripcion:'',texto_boton:'Ver',imagen_principal:null,secciones:{}}));
  assert.equal(notifications,1);
  console.log('OK: identidad confirmada, precedencia persistida, campos independientes, tienda A/B, respuestas tardías, cancelación, eventos de guardado, logo eliminado, landing ausente/ajena y errores sin fallback local.');
})().catch(e=>{console.error(e);process.exitCode=1;});
