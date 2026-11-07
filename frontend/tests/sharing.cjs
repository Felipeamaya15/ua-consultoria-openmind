const assert=require('node:assert/strict'),{test}=require('node:test');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./source-loader.cjs');
const sectionId='81386c65-c014-4bda-9e4c-4ce4213f0381',mediaId='71386c65-c014-4bda-9e4c-4ce4213f0382';
const plain=value=>JSON.parse(JSON.stringify(value));
const serviceMocks={
  '../../landing/services/landingService':{},'../../landing/services/sectionResources':{},'../../storefront/services/catalogService':{},
  '../../admin/services/promotionService':{},'./socialProfilesService':{},'./marketingService':{},
};
const {buildSharingItems}=load('src/features/marketing/services/sharingService.ts',serviceMocks);
const domain=load('src/features/marketing/domain/sharing.ts');
const product={id:'a'.repeat(24),name:'Polera real',category:'Ropa',active:true,description:'Algodón',images:['https://shop.test/polera.webp'],variants:[{sku:'REAL',price:15000,offerPrice:null,stock:2,active:true,attributes:[]}]};
const block={id:sectionId,tipo:'personalizada',visible:true,titulo:'',subtitulo:'',texto:'',imagenes:[],actividad:{tipo:'taller',estado:'activa',gratuito:true,zona_horaria:'America/Santiago',enlace_reunion:'https://meet.google.com/privado-secreto'},componentes:[{id:'title',tipo:'titulo',visible:true,texto:'Taller público'},{id:'text',tipo:'texto',visible:true,texto:'Aprende a cuidar plantas'},{id:'date',tipo:'fecha',visible:true,fecha:'2030-12-10'}]};
const media={id:mediaId,tipo:'imagen',titulo:'Imagen publicada',descripcion:'Reutilizable',url:'',imagen_publica:'https://shop.test/api/landing/multimedia-publica/'+mediaId+'/imagen/',activo:true};
const input=()=>({products:[product],publicProducts:[{id:'polera-real',catalogId:product.id}],landing:{contenido:{productos_destacados:[product.id],bloques:[block]}},promotions:[],resources:{[mediaId]:media},home:'https://shop.test/plantilla/1',now:Date.parse('2026-11-05T12:00:00Z')});

test('sharing joins actual active products with their public slug and never duplicates featured products',()=>{
  let items=buildSharingItems(input());const selected=items.filter(item=>item.reference.kind==='product');
  assert.equal(selected.length,1);assert.equal(selected[0].group,'Destacados');assert.equal(selected[0].url,'https://shop.test/plantilla/1/producto/polera-real');assert.equal(selected[0].content.price,1500000);
  assert.equal(buildSharingItems({...input(),publicProducts:[]}).filter(item=>item.reference.kind==='product').length,0);
  items=buildSharingItems({...input(),products:[{...product,variants:[{...product.variants[0],stock:0}]}]});assert(!items.some(item=>item.reference.kind==='product'));
});

test('hidden/cancelled sections and unpublished library resources never produce share links',()=>{
  const items=buildSharingItems(input()),section=items.find(item=>item.reference.kind==='section');
  assert.equal(section.url,'https://shop.test/plantilla/1#seccion-'+sectionId);assert.equal(section.content.hidePrice,true);assert(section.description.includes('2030-12-10'));assert(section.description.includes('gratuita'));assert(!JSON.stringify(items).includes('privado-secreto'));
  const hidden=buildSharingItems({...input(),landing:{contenido:{bloques:[{...block,visible:false}]}},resources:{}});
  assert(!hidden.some(item=>item.reference.kind==='section'||item.reference.kind==='media'));
  const cancelled=buildSharingItems({...input(),landing:{contenido:{bloques:[{...block,actividad:{...block.actividad,estado:'cancelada'}}]}}});assert(!cancelled.some(item=>item.reference.kind==='section'));
});

test('only current non-exhausted commercial promotions are offered and no sale price is invented',()=>{
  const promotion={id:'7',name:'Promoción real',code:'PLANTAS',type:'percentage',value:15,active:true,startsAt:'2026-11-01T00:00:00Z',endsAt:'2026-11-20T00:00:00Z',usedCount:0,maxUses:10,minAmount:20000};
  let items=buildSharingItems({...input(),promotions:[promotion]});let row=items.find(item=>item.reference.kind==='promotion');assert(row.description.includes('15%'));assert(row.description.includes('PLANTAS'));assert(row.content.hidePrice);assert(row.url.endsWith('/catalogo'));
  for(const patch of [{active:false},{usedCount:10},{endsAt:'2020-01-01T00:00:00Z'},{startsAt:'2030-01-01T00:00:00Z'},{startsAt:'invalid'}])assert(!buildSharingItems({...input(),promotions:[{...promotion,...patch}]}).some(item=>item.reference.kind==='promotion'));
});

test('profiles are registered identities; disabled accounts and incompatible YouTube actions stay unavailable',()=>{
  const profiles={instagram:{perfil:'tienda_real',activo:true},facebook:{perfil:'tienda.real',activo:false},youtube:{perfil:'@tiendareal',activo:true},whatsapp:{perfil:'+56912345678',activo:true}};
  const rows=domain.sharingChannels(profiles,null);assert.equal(rows.length,3);assert(!rows.some(row=>row.network==='facebook'));assert.equal(rows.find(row=>row.network==='youtube').compatible,false);assert.equal(domain.sharingChannels(profiles,{youtube:true}).find(row=>row.network==='youtube').compatible,true);
  const text=domain.sharingText('Título','Consulta sin publicación automática','https://shop.test/p?a=1&b=2');assert.equal(new URL(domain.whatsappShareUrl(text)).searchParams.get('text'),text);
});

test('generic drafts preserve source references and formats without storing server bodies, private URLs or prices',()=>{
  const drafts=load('src/features/marketing/domain/drafts.ts'),editor=load('src/features/marketing/domain/editor.ts');
  for(const format of ['square','story']){
    const snapshot=drafts.snapshot('','','product',format,editor.initialTemplateHistory(),{kind:'section',id:sectionId});
    const restored=drafts.readSnapshot(JSON.parse(JSON.stringify(snapshot)));assert.equal(restored.sharingReference.id,sectionId);assert.equal(restored.format,format);assert(!JSON.stringify(restored).includes('https://'));assert.equal(restored.price,undefined);
    assert.throws(()=>drafts.readSnapshot({...snapshot,sharingReference:{kind:'section',id:'unknown'}}));
  }
});

test('informational content uses the actual publication renderer without displaying a fake zero price',()=>{
  const {PublicationPreview}=load('src/features/marketing/components/PublicationPreview.tsx');
  const content=buildSharingItems(input()).find(item=>item.reference.kind==='section').content;
  const brand={name:'Tienda',logo:null,palette:{primary:'#123456',secondary:'#eeeeee',onPrimary:'#ffffff',onSecondary:'#000000'}};
  for(const format of ['square','story']){const html=renderToStaticMarkup(React.createElement(PublicationPreview,{content,brand,design:{format,layout:'product-spotlight'}}));assert(html.includes('Taller público'));assert(!html.includes('marketing-art-price"'));assert(!html.includes('privado-secreto'));}
});

let runtime;
const hooks={useState(initial){const owner=runtime,i=owner.cursor++;if(!(i in owner.slots))owner.slots[i]=typeof initial==='function'?initial():initial;return[owner.slots[i],value=>{owner.slots[i]=typeof value==='function'?value(owner.slots[i]):value;}];},useRef(initial){const i=runtime.cursor++;if(!(i in runtime.slots))runtime.slots[i]={current:initial};return runtime.slots[i];},useEffect(fn,deps){const i=runtime.cursor++,owner=runtime,old=owner.slots[i];if(!old||deps.some((v,n)=>old.deps[n]!==v)){old?.cleanup?.();owner.effects.push(()=>{owner.slots[i]={deps,cleanup:fn()};});}}};
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('actual sharing form preserves edits, checks availability before copy, and delegates both image formats to the existing generator',async()=>{
  const items=buildSharingItems(input());let unavailable=false,copied=[],prepared=[],dirty=[];
  const {Sharing}=load('src/features/marketing/components/Sharing.tsx',{
    react:hooks,'../../admin/components/ui':Object.fromEntries(['AdminCard','Button','Input','Select','Textarea'].map(name=>[name,name])),
    '../../../shared/components/states':{EmptyListState:'EmptyListState',ErrorState:'ErrorState',LoadingState:'LoadingState'},'../../admin/utils/humanizeError':{humanizeAdminError:text=>text},
    '../services/sharingService':{fetchSharingSources:async()=>({items,profiles:null,errors:[]}),resolveSharingItem:async ref=>{if(unavailable)throw new Error('Contenido no publicado');return items.find(item=>item.reference.id===ref.id);}},
  },{navigator:{clipboard:{writeText:async text=>copied.push(text)}},window:{confirm:()=>true}});
  const own={slots:[],cursor:0,effects:[]};const props={active:true,home:'https://shop.test/plantilla/1',isCurrent:()=>true,onDirty:value=>dirty.push(value),onOpenSocial:()=>{},onPrepare:async(item,format)=>{prepared.push({item,format});return true;}};
  const render=()=>{runtime=own;own.cursor=0;const tree=nodes(Sharing(props));while(own.effects.length)own.effects.shift()();return tree;};
  render();await tick();let tree=render();tree.find(node=>node.type==='button'&&node.props?.children?.[0]?.props?.children==='Taller público').props.onClick();
  tree=render();tree.find(node=>node.props?.label==='Texto descriptivo para compartir').props.onChange({target:{value:'Mi texto preparado'}});
  tree=render();await tree.find(node=>node.props?.children==='Copiar texto y enlace').props.onClick();await tick();assert(copied[0].includes('Mi texto preparado'));assert(copied[0].includes('#seccion-'+sectionId));
  unavailable=true;tree=render();await tree.find(node=>node.props?.children==='Copiar enlace público').props.onClick();await tick();assert.equal(copied.length,1);tree=render();assert(tree.some(node=>node.type==='ErrorState'));assert.equal(tree.find(node=>node.props?.label==='Texto descriptivo para compartir').props.value,'Mi texto preparado');
  unavailable=false;await tree.find(node=>node.props?.children==='Preparar imagen 1:1').props.onClick();await tick();tree=render();await tree.find(node=>node.props?.children==='Preparar imagen 9:16').props.onClick();await tick();assert.deepEqual(prepared.map(row=>row.format),['square','story']);assert(prepared.every(row=>row.item.reference.id===sectionId));assert(dirty.includes(true));
});
