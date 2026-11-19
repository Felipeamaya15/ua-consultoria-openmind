const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {load} = require('./source-loader.cjs');
const crypto = require('node:crypto').webcrypto;
const id = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const campaign = {id, clave:key, revision:1, nombre:'QA', asunto:'Novedades', cuerpo:'Texto seguro',
  producto:{}, diseno:{imagen:'',boton_texto:'',boton_url:''}, destinatarios:[{id:1,email:'authorized@example.test',elegible:true,intentos:0,estado:'seleccionado'}],
  estado:'borrador', envio_habilitado:true, aviso_envio:'Buzón Mailpit', actualizado:'2026-11-14T12:00:00Z', resultados:{seleccionado:1}};
const connection = {conectado:false,correo:'',correo_negocio:'owner@example.test',autorizacion_vigente:false,autorizacion_fecha:null,autorizacion_version:'',oauth_configurado:true,modo:'mailpit',estado:'desconectado',envio_habilitado:true,aviso:'Pruebas locales'};
const serviceMocks = request => ({'../../../api':{API_BASE_URL:'http://qa'},
  '../../auth/services/authService':{authService:{getToken:()=> 'synthetic-token'}},
  '../../../shared/services/apiRequest':{requestJson:request}});
const flat = (node,out=[]) => { if(Array.isArray(node))node.forEach(n=>flat(n,out));else if(node&&typeof node==='object'){out.push(node);flat(node.props?.children,out)}return out; };
const text = node => Array.isArray(node) ? node.map(text).join('') : node&&typeof node==='object' ? text(node.props?.children) : String(node??'');
const tick = () => new Promise(resolve=>setImmediate(resolve));
function hooks(file,name,mocks,globals={}) {
  let cursor=0,props={}; const slots=[],effects=[];
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial}},
    useCallback(fn){cursor++;return fn},
    useEffect(fn,deps){const i=cursor++;if(!(i in slots)||!deps||deps.some((v,j)=>!Object.is(v,slots[i]?.[j]))){slots[i]=deps;effects.push(fn)}}};
  const jsx=(type,props)=>({type,props});
  const component=load(file,{react,'react/jsx-runtime':{jsx,jsxs:jsx},
    './ui':Object.fromEntries(['AdminCard','Alert','Button','Input','Textarea','Modal','Select'].map(n=>[n,n])),
    '../../../shared/components/states':{LoadingState:'LoadingState'},...mocks},
    {crypto,window:{addEventListener(){},removeEventListener(){},confirm:()=>true,open(){}},...globals})[name];
  return {render(next){if(next)props=next;cursor=0;const result=flat(component(props));effects.splice(0).forEach(fn=>fn());return result}, async flush(){await tick();return this.render()}};
}

test('campaign actions freeze the saved revision and explicit confirmation; processing cannot override recipients',async()=>{
  const calls=[];
  const api=load('src/features/admin/services/campaignService.ts',serviceMocks(async(url,options)=>{calls.push({url,options});return campaign})).campaignService;
  await api.action(campaign,'enviar');await api.action(campaign,'procesar');
  assert.deepEqual(JSON.parse(calls[0].options.body),{revision:1,confirmar:true});
  assert.deepEqual(JSON.parse(calls[1].options.body),{});
  assert.equal(calls[0].options.headers.Authorization,'Token synthetic-token');
});

test('preview is read from the backend; malformed preview and unknown delivery states reject',async()=>{
  for(const answer of [{html:null,campana:campaign},{html:'safe',campana:{...campaign,estado:'entregada'}}]){
    const api=load('src/features/admin/services/campaignService.ts',serviceMocks(async()=>answer)).campaignService;
    await assert.rejects(api.preview(id));
  }
  const api=load('src/features/admin/services/campaignService.ts',serviceMocks(async()=>({html:'<p>Backend</p>',campana:campaign}))).campaignService;
  assert.equal((await api.preview(id)).html,'<p>Backend</p>');
});

test('connection service rejects non-Google authorization URLs and never accepts caller recipients',async()=>{
  for(const url of ['https://evil.example/auth','https://accounts.google.com.evil.example/o/oauth2/v2/auth']){
    const api=load('src/features/admin/services/mailConnectionService.ts',serviceMocks(async()=>({url_autorizacion:url}))).mailConnectionService;
    await assert.rejects(api.connect('owner@example.test',true),/válido/);
  }
  const calls=[];const api=load('src/features/admin/services/mailConnectionService.ts',serviceMocks(async(url,options)=>{calls.push({url,options});return{estado:'aceptada',codigo:'enviado_local'}})).mailConnectionService;
  await api.test(key);assert.deepEqual(JSON.parse(calls[0].options.body),{clave:key});
});

test('Campaigns belongs to Marketing; legacy Contacts redirects; Gmail belongs to Negocio and Correos is preserved',()=>{
  const h=hooks('src/features/admin/pages/Contacts.tsx','default',{
    'react-router-dom':{useSearchParams:()=>[new URLSearchParams('vista=campanas')],Navigate:'Navigate'},
    '../components/ui':{},'../components/HistoryControls':{},'../components/CommercialFilters':{},
    '../hooks/useCommercialHistory':{},'../services/commercialService':{},
  });
  const tree=h.render();assert.equal(tree[0].type,'Navigate');assert.equal(tree[0].props.to,'/emprendedor/marketing#campanas');assert.equal(tree[0].props.replace,true);
  const marketing=fs.readFileSync(path.join(__dirname,'../src/features/marketing/components/MarketingSections.tsx'),'utf8');
  assert(marketing.includes('<CampaignWorkspace'));assert(!marketing.includes("label: 'Redes sociales'"));
  const emails=fs.readFileSync(path.join(__dirname,'../src/features/admin/pages/Emails.tsx'),'utf8');
  assert(!emails.includes('MailConnectionPanel'));
  assert(!emails.includes('mailConnectionService'));
  for(const marker of ['AutomaticFieldEditor','previewFields','validateAutomaticFields','Guardar correos automáticos','sendEmergencyEmail']) assert(emails.includes(marker),marker);
  const business=fs.readFileSync(path.join(__dirname,'../src/features/admin/components/LandingPageContent.tsx'),'utf8');
  assert(business.includes('<MailConnectionPanel businessEmail={form.negocio.correo_negocio} businessSaved={!businessDirty && !saving} />'));
});

test('campaign UI keeps draft and idempotency key on failure, previews backend HTML in sandbox, confirms before sending',async()=>{
  let fail=true, previews=0;const writes=[],actions=[];
  const api={list:async()=>({resultados:[],pagina:1,paginas:1,total:0}),audience:async()=>({total:1,limite:1000,limite_excedido:false,resultados:[{id:1,email:'authorized@example.test'}]}),
    save:async(form,key)=>{writes.push({form,key});if(fail)throw new Error('Fallo controlado');return{...campaign,...form,clave:key,destinatarios:campaign.destinatarios}},
    preview:async()=>{previews++;return{html:'<h1>Vista del servidor</h1>',campana:{...campaign,nombre:'Mi campaña',asunto:'Mi asunto',cuerpo:'Mi contenido'}}},
    action:async(row,action)=>{actions.push(action);return{...row,estado:action==='enviar'?'pendiente':'aceptada',resultados:action==='enviar'?{pendiente:1}:{aceptada:1}}}};
  const h=hooks('src/features/admin/components/CampaignWorkspace.tsx','CampaignWorkspace',{
    './MailConnectionPanel':{MailConnectionPanel:'MailConnectionPanel'},
    '../../marketing/components/PublishedContentPicker':{PublishedContentPicker:'PublishedContentPicker'},
    '../../marketing/components/MediaPreview':{MediaPreview:'MediaPreview'},
    'react-router-dom':{useBlocker:()=>({state:'unblocked'})},'../services/campaignService':{campaignService:api},'../services/productService':{fetchAdminProducts:async()=>[]}},
    {window:{addEventListener(){},removeEventListener(){},confirm:()=>true}});
  let tree=h.render();await new Promise(r=>setTimeout(r,270));tree=await h.flush();
  assert.equal(tree.filter(n=>n.type==='MailConnectionPanel').length,1,'Un solo panel de conexión en Campañas');
  assert.equal(tree.find(n=>n.type==='MailConnectionPanel').props.summary,true,'Campañas muestra solo el resumen');
  assert(tree.findIndex(n=>n.type==='MailConnectionPanel')<tree.findIndex(n=>n.type==='fieldset'),'La conexión permanece disponible fuera del contenido bloqueado de una campaña enviada');
  const button=label=>tree.find(n=>n.type==='Button'&&text(n)===label);
  for(const [label,value] of [['Nombre del borrador','Mi campaña'],['Asunto de la campaña','Mi asunto'],['Contenido de la campaña','Mi contenido']]){
    tree.find(n=>n.props?.label===label).props.onChange({target:{value}});tree=h.render();
  }
  button('Guardar borrador de campaña').props.onClick();tree=await h.flush();
  assert.equal(tree.find(n=>n.props?.label==='Contenido de la campaña').props.value,'Mi contenido');
  assert(tree.some(n=>text(n)==='Fallo controlado'));fail=false;
  button('Guardar y previsualizar').props.onClick();tree=await h.flush();
  assert.equal(writes[0].key,writes[1].key);assert.equal(previews,1);
  const frame=tree.find(n=>n.type==='iframe');assert.equal(frame.props.sandbox,'');assert.equal(frame.props.srcDoc,'<h1>Vista del servidor</h1>');
  button('Confirmar envío promocional').props.onClick();tree=await h.flush();assert.equal(actions.length,0);
  assert.equal(tree.find(n=>n.type==='Modal'&&n.props.title==='Confirmar envío de campaña').props.open,true);button('Volver sin confirmar').props.onClick();tree=h.render();assert.equal(actions.length,0);button('Confirmar envío promocional').props.onClick();tree=h.render();button('Sí, confirmar envío').props.onClick();tree=await h.flush();assert.deepEqual(actions,['enviar','procesar']);
});

test('connection panel refreshes state, opens OAuth and retains a failed test key for retry',async()=>{
  const keys=[],opened=[],connections=[];let fail=true;
  const api={status:async()=>connection,connect:async(...args)=>{connections.push(args);return 'https://accounts.google.com/o/oauth2/v2/auth?state=qa'},
    test:async(key)=>{keys.push(key);if(fail)throw new Error('Prueba no confirmada');return{estado:'aceptada'}}};
  const h=hooks('src/features/admin/components/MailConnectionPanel.tsx','MailConnectionPanel',{'../services/mailConnectionService':{mailConnectionService:api}},
    {window:{addEventListener(){},removeEventListener(){},confirm:()=>true,open:(...args)=>opened.push(args)}});
  let tree=h.render();tree=await h.flush();const button=label=>tree.find(n=>n.type==='Button'&&text(n)===label);
  const checkbox=()=>tree.find(n=>n.type==='input'&&n.props.type==='checkbox');
  assert.equal(checkbox().props.checked,false);assert.equal(button('Conectar Gmail').props.disabled,true);
  checkbox().props.onChange({target:{checked:true}});tree=h.render();
  button('Conectar Gmail').props.onClick();tree=await h.flush();assert.equal(opened.length,1);
  assert.deepEqual(connections,[['owner@example.test',true]]);assert.equal(checkbox().props.checked,false);
  for(const node of tree.filter(n=>n.type==='Button'))assert.equal(node.props.type,'button','No guardar Negocio al pulsar acciones OAuth');
  button('Enviar prueba controlada').props.onClick();tree=await h.flush();assert(tree.some(n=>text(n)==='Prueba no confirmada'));
  fail=false;button('Enviar prueba controlada').props.onClick();tree=await h.flush();assert.equal(keys[0],keys[1]);
  assert(tree.some(n=>text(n).includes('no acredita entrega al buzón')));
});

test('campaign connection summary exposes no OAuth setup, consent checkbox or test actions',async()=>{
  const h=hooks('src/features/admin/components/MailConnectionPanel.tsx','MailConnectionPanel',{
    'react-router-dom':{Link:'Link'},'../services/mailConnectionService':{mailConnectionService:{status:async()=>connection}}});
  h.render({summary:true});const tree=await h.flush();
  assert.equal(tree.filter(n=>n.type==='Button'||n.type==='input').length,0);
  assert.equal(tree.find(n=>n.type==='Link').props.to,'/emprendedor/landing#informacion-negocio');
  assert(tree.some(n=>text(n)==='Estado: Sin conexión autorizada'));
});

test('OAuth service records explicit authorization and refuses a missing or false choice',async()=>{
  const calls=[];
  const api=load('src/features/admin/services/mailConnectionService.ts',serviceMocks(async(url,options)=>{
    calls.push({url,options});return{url_autorizacion:'https://accounts.google.com/o/oauth2/v2/auth?state=qa'};
  })).mailConnectionService;
  await assert.rejects(api.connect('owner@example.test',false),/autoriza/);
  assert.equal(calls.length,0);
  await api.connect('owner@example.test',true);
  assert.deepEqual(JSON.parse(calls[0].options.body),{correo_negocio:'owner@example.test',autorizar:true,version_texto:'uso-correo-negocio-v1'});
});

test('verified customer saves only own preference; unverified customer and visitor keep the email-link path',async()=>{
  for(const verified of [true,false,null]) {
    const calls=[];
    const own={email:'buyer@example.test',correo_verificado:verified,estado:'sin_registro',recibir:false};
    const h=hooks('src/features/storefront/pages/CommercialPreferences.tsx','default',{
      'react-router-dom':{Link:'Link',useLocation:()=>({pathname:'/plantilla/2/preferencias-comerciales',hash:'',state:null})},
      '../hooks/useStorefrontTemplate':{useStorefrontTemplate:()=>({templateNumber:'2',route:(path='')=>path?`/plantilla/2/${path}`:'/plantilla/2'})},
      '../services/commercialConsent':{CONSENT_TEXT:'Autorizo publicidad',hasConsentSession:()=>verified!==null,
        readOwnConsent:async()=>own,saveOwnConsent:async receive=>{calls.push(receive);return{...own,estado:receive?'autorizado':'retirado',recibir:receive}},
        requestConsent:async(...args)=>{calls.push(args);return{mensaje:'Enlace solicitado'}}},
    },{window:{location:{hash:'',pathname:'/plantilla/2/preferencias-comerciales'},history:{replaceState(){}}}});
    let tree=h.render();tree=await h.flush();
    const homeLink=tree.find(n=>n.type==='Link'&&text(n)==='Ir al inicio de la tienda');
    assert(homeLink);assert.equal(homeLink.props.to,'/plantilla/2');assert.equal(homeLink.props['data-page-action'],'primary');
    const email=tree.find(n=>n.type==='input'&&n.props.type==='email');
    if(verified) {
      assert.equal(email,undefined,'La gestión directa no permite editar un correo ajeno');
      tree.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});tree=h.render();
      tree.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=await h.flush();
      assert.deepEqual(calls,[true]);assert(tree.some(n=>text(n)==='Estado actual: Autorizado y verificado'));
    } else {
      assert(email);assert.equal(email.props.readOnly,verified!==null);
      assert.equal(tree.filter(n=>n.type==='input'&&n.props.type==='checkbox').length,0);
      if(verified===null) {email.props.onChange({target:{value:'visitor@example.test'}});tree=h.render();}
      tree.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=await h.flush();
      assert.deepEqual(calls,[[verified===null?'visitor@example.test':'buyer@example.test','2','gestionar']]);
    }
  }
});
