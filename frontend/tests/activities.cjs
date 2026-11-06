const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{webcrypto:crypto}=require('node:crypto');
const {load}=require('./source-loader.cjs');
const id='81386c65-c014-4bda-9e4c-4ce4213f0381',requestId='71386c65-c014-4bda-9e4c-4ce4213f0382';
const plain=value=>JSON.parse(JSON.stringify(value));
const metadata={tipo:'taller',estado:'activa',categoria:'Plantas',zona_horaria:'America/Santiago',plataforma:'Meet',enlace_reunion:'https://meet.google.com/privado-secreto',gratuito:true,inscripciones:true,cupos:2,confirmacion:'manual'};

test('service/workshop presets reuse editable blocks and a stable section without creating a catalog item',()=>{
  const schema=load('src/features/landing/types/sectionElements.ts',{}, {crypto});
  for(const preset of ['servicios','talleres']){
    const section=schema.createFlexibleSection(preset);
    assert.equal(section.tipo,'personalizada');assert.equal(section.visible,false);assert.equal(section.actividad.inscripciones,false);
    assert(section.componentes.some(item=>item.tipo==='consulta'));
    assert(!section.componentes.some(item=>item.tipo==='compra'));assert.equal(section.producto_id,undefined);
    assert.equal(new Set(section.componentes.map(item=>item.id)).size,section.componentes.length);
  }
});

test('public renderer hides private meeting links, labels free/cancelled activities and gates enrollment buttons',()=>{
  const {SectionElements}=load('src/features/landing/components/SectionElements.tsx',{
    './ActivityRequestForm':{ActivityRequestForm:props=>React.createElement('button',{'data-kind':props.kind,'data-section':props.sectionId},props.label)},
    '../services/sectionResources':{fetchPublishedSectionResources:async()=>({})},
    '../services/landingService':{LANDING_CONFIG_CHANGED:'landing'},'../../marketing/services/mediaLibraryService':{MEDIA_LIBRARY_CHANGED:'media'},
  });
  const elements=[{id:'a',tipo:'consulta',visible:true,etiqueta:'Consultar'},{id:'b',tipo:'inscripcion',visible:true,etiqueta:'Inscribirme'},{id:'c',tipo:'fecha',visible:true,fecha:'2030-12-10',hasta:'2030-12-12'}];
  const render=activity=>renderToStaticMarkup(React.createElement(SectionElements,{elements,activity,sectionId:id}));
  let html=render(metadata);assert(html.includes('data-kind="consulta"'));assert(html.includes('data-kind="inscripcion"'));assert(html.includes(id));assert(html.includes('America/Santiago'));assert(html.includes('Gratuito'));assert(!html.includes('privado-secreto'));assert(html.includes('12/12/2030'));
  html=render({...metadata,gratuito:false});assert(html.includes('data-kind="consulta"'));assert(!html.includes('data-kind="inscripcion"'));
  html=render({...metadata,estado:'cancelada'});assert(html.includes('Actividad cancelada'));assert(!html.includes('data-kind='));
  html=render(null);assert(!html.includes('data-kind='));
});

test('four template renderers keep existing section IDs, library references and safe activity forms',()=>{
  for(const template of ['editorial','minimal','visual','catalog']){
    const block={id,tipo:'personalizada',visible:true,titulo:'',subtitulo:'',texto:'',imagenes:[],actividad:metadata,componentes:[{id:'title',tipo:'titulo',visible:true,texto:'Taller real'},{id:'action',tipo:'consulta',visible:true,etiqueta:'Consultar'}]};
    const {LandingBlocks}=load('src/features/landing/components/LandingBlocks.tsx',{
      '../../storefront/context/StoreContext':{useStore:()=>({landing:{contenido:{bloques:[block]}},blockStyles:{}})},
      '../../storefront/hooks/useStorefrontTemplate':{useStorefrontTemplate:()=>({template})},
      './ActivityRequestForm':{ActivityRequestForm:props=>React.createElement('button',{'data-section':props.sectionId},props.label)},
      '../services/sectionResources':{fetchPublishedSectionResources:async()=>({})},'../services/landingService':{LANDING_CONFIG_CHANGED:'landing'},'../../marketing/services/mediaLibraryService':{MEDIA_LIBRARY_CHANGED:'media'},
    });
    const html=renderToStaticMarkup(React.createElement(LandingBlocks));
    assert(html.includes(`data-block-template="${template}"`));assert(html.includes('Taller real'));assert(html.includes(`data-section="${id}"`));assert(!html.includes('privado-secreto'));
  }
});

test('service uses optional guest authentication and owner-only listing; writes validate the actual response',async()=>{
  let token=null,calls=[],answer={recibida:true};
  const service=load('src/features/landing/services/activityService.ts',{
    '../../../api':{API_BASE_URL:'https://local.test'},'../../auth/services/authService':{authService:{getToken:()=>token}},
    '../../../shared/services/apiRequest':{requestJson:async(url,options)=>{calls.push({url,options});return answer;}},
  });
  const data={solicitud_id:requestId,nombre:'Ana',apellido:'',email:'ana@example.test',telefono:'',mensaje:'Consulta',consentimiento:true};
  await service.submitActivity(id,'consulta',data);assert(!calls[0].options.headers.Authorization);assert(calls[0].url.endsWith('/consultas/'));assert.deepEqual(JSON.parse(calls[0].options.body),data);
  await assert.rejects(service.fetchActivityRequests(new URLSearchParams()),/propietario/);
  token='isolated-test-token';await service.submitActivity(id,'inscripcion',data);assert.equal(calls[1].options.headers.Authorization,'Token isolated-test-token');assert(calls[1].url.endsWith('/inscripciones/'));
  answer={recibida:false};await assert.rejects(service.submitActivity(id,'consulta',data),/confirmar/);
  answer={resultados:[],total:0,pagina:1,paginas:1};await service.fetchActivityRequests(new URLSearchParams({tipo:'consulta'}));assert.equal(calls.at(-1).options.cache,'no-store');
  answer={id:requestId,seccion_id:id,tipo:'consulta',titulo_actividad:'Taller',nombre:'Ana',apellido:'',email:'ana@example.test',telefono:'',mensaje:'Original',estado:'respondida',creado:'2030-01-01'};
  await service.updateActivityState(requestId,'respondida');assert.deepEqual(JSON.parse(calls.at(-1).options.body),{estado:'respondida'});
  assert(!calls.some(call=>call.url.includes('isolated-test-token')));
});

let runtime;
const hooks={useState(initial){const own=runtime,i=own.cursor++;if(!(i in own.slots))own.slots[i]=typeof initial==='function'?initial():initial;return[own.slots[i],value=>{own.slots[i]=typeof value==='function'?value(own.slots[i]):value;}];},useRef(value){const i=runtime.cursor++;if(!(i in runtime.slots))runtime.slots[i]={current:value};return runtime.slots[i];},useEffect(){}};
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];

test('actual public form preserves data on failure, reuses idempotency on retry and sends only after consent',async()=>{
  let calls=[],fail=true;
  const {ActivityRequestForm}=load('src/features/landing/components/ActivityRequestForm.tsx',{
    react:hooks,'../../admin/components/ui/AdminModal':{AdminModal:'Modal'},'../../storefront/components/ui':{Button:'Button',Input:'Input',Textarea:'Textarea'},
    '../../../shared/components/states':{ErrorState:'ErrorState',LoadingState:'LoadingState'},'../../admin/utils/humanizeError':{humanizeAdminError:text=>text},
    '../services/activityService':{submitActivity:async(section,kind,data)=>{calls.push({section,kind,data});if(fail)throw new Error('Sin conexión');}},
  },{crypto});
  const own={slots:[],cursor:0};const render=()=>{runtime=own;own.cursor=0;return nodes(ActivityRequestForm({sectionId:id,kind:'consulta',label:'Consultar'}));};
  let tree=render();tree.find(node=>node.type==='button').props.onClick();
  for(const [label,value] of [['Nombre','Ana'],['Correo electrónico','ana@example.test'],['Tu consulta','Pregunta original']]){tree=render();tree.find(node=>node.props?.label===label).props.onChange({target:{value}});}
  const submit=()=>render().find(node=>node.type==='form').props.onSubmit({preventDefault(){},currentTarget:{reportValidity:()=>true}});
  await submit();assert.equal(calls.length,0);
  tree=render();tree.find(node=>node.props?.type==='checkbox').props.onChange({target:{checked:true}});
  await submit();tree=render();assert.equal(calls.length,1);assert.equal(tree.find(node=>node.props?.label==='Nombre').props.value,'Ana');assert(tree.some(node=>node.type==='ErrorState'));
  await submit();assert.equal(calls[0].data.solicitud_id,calls[1].data.solicitud_id);
  tree=render();tree.find(node=>node.props?.label==='Tu consulta').props.onChange({target:{value:'Consulta corregida'}});
  fail=false;await submit();assert.notEqual(calls[2].data.solicitud_id,calls[1].data.solicitud_id);assert.equal(calls[2].data.mensaje,'Consulta corregida');
  tree=render();assert(tree.some(node=>node.props?.role==='status'));assert(!tree.some(node=>node.type==='form'));
});
