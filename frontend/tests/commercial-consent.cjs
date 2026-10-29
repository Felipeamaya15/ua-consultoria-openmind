const fs=require('fs'),path=require('path'),vm=require('vm');
const assert=require('node:assert/strict'),{test}=require('node:test'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
function load(relative,globals={}){
  const file=path.resolve(root,relative),module={exports:{}};
  const source=fs.readFileSync(file,'utf8').replaceAll('import.meta.env.VITE_API_URL',"'http://qa.local'");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,Error,console,...globals,require:id=>
    globals.mocks?.[id] || (id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts',globals):require(id))});
  return module.exports;
}
const service='src/features/storefront/services/commercialConsent.ts';
const ok={ok:true,json:async()=>({exito:true,mensaje:'Solicitud pendiente',data:null})};
test('Publicity checkbox is optional, unchecked, and distinct from cookies/terms',()=>{
  const {CommercialOptIn}=load('src/features/storefront/components/store/CommercialOptIn.tsx');
  const markup=renderToStaticMarkup(React.createElement(CommercialOptIn,{checked:false,onChange:()=>{}}));
  assert.match(markup,/type="checkbox"/);assert.doesNotMatch(markup,/checked=""|required=""/);
  assert.match(markup,/Opcional/);assert.match(markup,/confirmar el correo/);assert.match(markup,/aceptar cookies no autoriza publicidad/);
});
test('Checked choice renders only when explicitly supplied',()=>{
  const {CommercialOptIn}=load('src/features/storefront/components/store/CommercialOptIn.tsx');
  assert.match(renderToStaticMarkup(React.createElement(CommercialOptIn,{checked:true,onChange:()=>{}})),/checked=""/);
});
test('Request includes version and store template, never an authorization flag',async()=>{
  let sent;
  const api=load(service,{localStorage:{getItem:()=>null},fetch:async(url,options)=>{sent={url,...options};return ok;}});
  await api.requestConsent('artificial@example.test','2');
  const body=JSON.parse(sent.body);
  assert.equal(body.plantilla,2);assert.equal(body.version_texto,api.CONSENT_VERSION);assert.equal(body.proposito,'confirmar');
  assert.equal(body.estado,undefined);assert.equal(body.verificado,undefined);
});
test('Bearer mail link remains usable with a stale login token',async()=>{
  let headers;
  const api=load(service,{localStorage:{getItem:()=> 'stale-test-token'},fetch:async(url,options)=>{headers=options.headers;return ok;}});
  await api.consentRequest('enlace',{accion:'retirar',token:'synthetic-link'});
  assert.equal(headers.Authorization,undefined);
});
test('Transport/API failures reject and do not announce success',async()=>{
  const api=load(service,{localStorage:{getItem:()=>null},fetch:async()=>({ok:false,json:async()=>({exito:false,mensaje:'Temporalmente no disponible'})})});
  await assert.rejects(api.requestConsent('qa@example.test','1'),/Temporalmente no disponible/);
});
test('A failed envelope rejects even with HTTP 200',async()=>{
  const api=load(service,{localStorage:{getItem:()=>null},fetch:async()=>({ok:true,json:async()=>({exito:false,mensaje:'Operación rechazada'})})});
  await assert.rejects(api.requestConsent('qa@example.test','1'),/Operación rechazada/);
});
test('Retry succeeds after a network failure',async()=>{
  let count=0;
  const api=load(service,{localStorage:{getItem:()=>null},fetch:async()=>{if(++count===1)throw new Error('Network failure');return ok;}});
  await assert.rejects(api.requestConsent('qa@example.test','1'),/Revisa tu conexión/);
  assert.equal((await api.requestConsent('qa@example.test','1')).mensaje,'Solicitud pendiente');
});
test('Malformed JSON gets a clear recovery message without parser details',async()=>{
  const api=load(service,{localStorage:{getItem:()=>null},fetch:async()=>({ok:true,json:async()=>{throw new Error('private parser detail');}})});
  await assert.rejects(api.requestConsent('qa@example.test','1'),/No pudimos procesar la respuesta/);
});
const contactMocks={'../../../api':{API_BASE_URL:'http://qa.local'},'../../auth/services/authService':{authService:{getToken:()=> 'synthetic-owner-session'}}};
const page={pagina:1,tamano:20,total:1,total_paginas:1};
test('Contacts accepts pending opt-ins without inventing an order date',async()=>{
  const api=load('src/features/admin/services/commercialService.ts',{mocks:contactMocks,fetch:async()=>({ok:true,json:async()=>({exito:true,paginacion:page,data:[{email:'pending@example.test',cantidad_pedidos:0,ultimo_pedido:null,consentimiento:'pendiente',fecha_consentimiento:null}]})})});
  const result=await api.getContacts(new URLSearchParams());
  assert.equal(result.data[0].ultimo_pedido,null);assert.equal(result.data[0].consentimiento,'pendiente');
});
test('Contacts still rejects malformed dates and unknown permission states',async()=>{
  for(const invalid of [{ultimo_pedido:'not-a-date',consentimiento:'pendiente'},{ultimo_pedido:null,consentimiento:'invented'}]){
    const api=load('src/features/admin/services/commercialService.ts',{mocks:contactMocks,fetch:async()=>({ok:true,json:async()=>({exito:true,paginacion:page,data:[{email:'qa@example.test',cantidad_pedidos:0,...invalid}]})})});
    await assert.rejects(api.getContacts(new URLSearchParams()),/no es válida/);
  }
});

test('Contacts distinguishes schema updates, service outages and connection failures',async()=>{
  const request=fetch=>load('src/features/admin/services/commercialService.ts',{mocks:contactMocks,fetch}).getContacts(new URLSearchParams());
  await assert.rejects(request(async()=>({ok:false,status:503,json:async()=>({error:{codigo:'CONTACTOS_ACTUALIZACION_PENDIENTE'},mensaje:'private sql detail'})})),/actualización de la aplicación/);
  await assert.rejects(request(async()=>({ok:false,status:503,json:async()=>{throw new Error('HTML proxy outage');}})),/no está disponible temporalmente/);
  await assert.rejects(request(async()=>({ok:false,status:500})),/servicio no está disponible/);
  await assert.rejects(request(async()=>{throw new Error('private connection detail');}),/Revisa tu conexión/);
});
