const assert=require('node:assert/strict'),{test}=require('node:test');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./source-loader.cjs');
const order=load('src/features/landing/types/homeSections.ts');
const first={id:'81386c65-c014-4bda-9e4c-4ce4213f0381',tipo:'texto',visible:true,titulo:'Sección A',subtitulo:'',texto:'Contenido A',imagenes:[]};
const second={...first,id:'71386c65-c014-4bda-9e4c-4ce4213f0382',titulo:'Sección B',texto:'Contenido B'};
const normalize=value=>JSON.parse(JSON.stringify(value));

test('legacy order, unique references, removed blocks and 20 custom sections retain capacity',()=>{
  const content={bloques:[first,second]};
  assert.deepEqual(normalize(order.homeSectionOrder(content,'minimal')),[first.id,second.id,'sistema:categorias','sistema:destacados','sistema:banner','sistema:mas-productos']);
  const saved=['sistema:destacados',second.id,'sistema:categorias',first.id];
  assert.deepEqual(normalize(order.homeSectionOrder({...content,orden_apartados:saved},'editorial')),saved);
  assert.deepEqual(normalize(order.reconcileHomeOrder([...saved,second.id,'unknown'],[second])),['sistema:destacados',second.id,'sistema:categorias']);
  assert.equal(order.homeSectionOrder({bloques:Array.from({length:20},(_,i)=>({...first,id:String(i)}))},'catalog',true).length,26);
  assert.equal(content.bloques[0],first);
});

test('individual system visibility inherits historical flags without changing selections',()=>{
  assert.equal(order.systemSectionVisible('sistema:banner',{'Productos destacados':false}),false);
  assert.equal(order.systemSectionVisible('sistema:banner',{'Productos destacados':false,'Banner de colección':true}),true);
  assert.equal(order.systemSectionVisible('sistema:contenido',{}),true);
  assert.equal(order.systemSectionVisible('sistema:categorias',{'Categorías':false}),false);
});

function renderHome(template, content, flags={}) {
  const product={id:'real-slug',catalogId:'000000000000000000000001',name:'Producto real QA',category:'Categoría real',images:['https://example.test/producto.webp'],basePrice:12345,description:'Vigente'};
  const landing={titulo:'Portada QA',descripcion:'Descripción',texto_boton:'Comprar',contenido:content,secciones:flags};
  const visualConfig=load('src/features/storefront/visual/resolveVisualConfig.ts').resolveVisualConfig({template});
  const useStore=()=>({landing,landingProducts:[product],visualConfig,blockStyles:{},config:{name:'Negocio'}});
  const useContent=()=>({content,featured:content.productos_destacados?.length?[product]:[],categories:content.categorias||[]});
  const templ=()=>({template,route:(path='')=>'/plantilla/'+({editorial:1,minimal:2,visual:3,catalog:4}[template])+'/'+path});
  const Home=load(`src/features/storefront/pages/${({editorial:'Editorial',minimal:'Minimal',visual:'Visual',catalog:'Catalog'}[template])}Home.tsx`,{
    '../context/StoreContext':{useStore},'../../storefront/context/StoreContext':{useStore},
    '../hooks/useStorefrontTemplate':{useStorefrontTemplate:templ},'../../storefront/hooks/useStorefrontTemplate':{useStorefrontTemplate:templ},
    '../../landing/hooks/useLandingContent':{useLandingContent:useContent},'../hooks/useLandingContent':{useLandingContent:useContent},
    '../../landing/hooks/useLandingSectionVisibility':{useLandingSectionVisibility:()=>name=>flags[name]!==false},
    '../../landing/components/LandingStatus':{LandingStatus:()=>null},'../../landing/components/LandingDetails':{LandingDetails:()=>React.createElement('footer',null,'Contacto final')},
    '../components/store/ProductCard':{ProductCard:({product})=>React.createElement('a',{'data-real-product':product.catalogId,href:'producto/'+product.id},product.name+' '+product.basePrice)},
    'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{...props,href:to},children),useNavigate:()=>()=>{}},
    '../components/ui':{Icon:()=>null,Badge:({children})=>React.createElement('span',null,children)},
  }).default;
  return renderToStaticMarkup(React.createElement(Home));
}

test('all four real Home renderers interleave commerce and saved sections after hero and benefits',()=>{
  for(const template of ['editorial','minimal','visual','catalog']) {
    const content={bloques:[first,second],productos_destacados:['000000000000000000000001'],categorias:['Categoría real'],beneficios:[{titulo:'Beneficio fijo QA',icono:'truck'}],orden_apartados:['sistema:destacados',first.id,'sistema:categorias',second.id]};
    let html=renderHome(template,content);
    const hero=html.indexOf('data-visual-section="hero"'),benefit=html.indexOf('Beneficio fijo QA'),featured=html.indexOf('data-visual-kind="featured"'),a=html.indexOf('data-content-block-id="'+first.id),categories=html.indexOf('data-visual-section="categories"'),b=html.indexOf('data-content-block-id="'+second.id);
    assert(hero>=0&&hero<benefit&&benefit<featured&&featured<a&&a<categories&&categories<b,template);
    assert.equal((html.match(new RegExp('data-content-block-id="'+first.id,'g'))||[]).length,1);
    assert(html.includes('real-slug'));assert(html.includes('Categoría real'));assert(html.indexOf('Contacto final')>b);
    html=renderHome(template,{...content,orden_apartados:[second.id,'sistema:categorias',first.id,'sistema:destacados']});
    assert(html.indexOf('data-content-block-id="'+first.id)<html.indexOf('data-visual-kind="featured"'),template+' featured moves after content');
    html=renderHome(template,content,{'Productos destacados':false,'Categorías':false,'Banner de colección':false,'Más para ti':false,'Más para descubrir':false});
    assert(!html.includes('data-visual-kind="featured"'));assert(!html.includes('data-visual-section="categories"'));assert(html.includes('Contenido A'));
  }
});

test('empty catalog hides product and category slots without replacing merchant sections',()=>{
  for(const template of ['editorial','minimal','visual','catalog']) {
    const html=renderHome(template,{bloques:[first],productos_destacados:[],categorias:[],beneficios:[]});
    assert(!html.includes('data-visual-kind="featured"'));assert(!html.includes('data-visual-section="categories"'));assert(html.includes('Contenido A'));
  }
});

test('normalizing and serializing draft content preserves the unified order and existing selections',()=>{
  const {normalizeLandingContent}=load('src/features/landing/types/landingContent.ts');
  const content={bloques:[first],orden_apartados:['sistema:categorias',first.id,'sistema:destacados'],productos_destacados:['a'],categorias:['Ropa']};
  const restored=normalizeLandingContent(JSON.parse(JSON.stringify(content)));
  assert.deepEqual(normalize(restored.orden_apartados),content.orden_apartados);
  assert.deepEqual(normalize(restored.productos_destacados),['a']);assert.deepEqual(normalize(restored.bloques),[first]);
});

test('the actual unified editor moves commerce across custom sections and shares existing visibility flags',()=>{
  let cursor=0,slots=[],blocks=[first,second],savedOrder=[first.id,'sistema:destacados',second.id,'sistema:categorias'];
  let flags={'Productos destacados':true};
  const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
  const {LandingBlocksEditor}=load('src/features/admin/components/LandingBlocksEditor.tsx',{
    react:{useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=value;}];}},
    'react-router-dom':{Link:'Link'},'./ui':Object.fromEntries(['AdminCard','Button','Input','Textarea','Toggle','Modal'].map(name=>[name,name])),
    './ui/ImageUpload':{ImageUpload:'ImageUpload'},'./FlexibleSectionEditor':{FlexibleSectionEditor:'FlexibleSectionEditor'},
  });
  const render=()=>{cursor=0;return nodes(LandingBlocksEditor({value:blocks,onChange:next=>{blocks=next;},layout:{order:savedOrder,flags,onMove:next=>{savedOrder=next;},onToggle:(name,value)=>{flags={...flags,[name]:value};},renderConfig:id=>React.createElement('p',null,'Configurar '+id)}}));};
  let tree=render();
  tree.find(node=>node.props?.['aria-label']==='Subir Productos destacados').props.onClick();
  assert.deepEqual(normalize(savedOrder),['sistema:destacados',first.id,second.id,'sistema:categorias']);
  assert.deepEqual(blocks,[first,second]);
  tree=render();tree.find(node=>node.props?.ariaLabel==='Mostrar Productos destacados').props.onChange(false);
  assert.equal(flags['Productos destacados'],false);assert.equal(blocks[0].visible,true);
  assert.equal(tree.filter(node=>node.props?.['data-system-section']==='sistema:destacados').length,1);
  assert(!tree.some(node=>node.props?.['aria-label']==='Eliminar Productos destacados'));
  tree.find(node=>node.props?.['aria-label']==='Editar Productos destacados').props.onClick();
  assert(render().some(node=>node.props?.children==='Configurar sistema:destacados'));
});

test('existing commerce selection remains editable while hidden, with no duplicate visibility control',()=>{
  const {LandingContentEditor}=load('src/features/admin/components/LandingContentEditor.tsx',{
    './ui':{AdminCard:'article',Input:'input',Toggle:'duplicate-toggle',Button:'button'},
    './ChileAddressEditor':{ChileAddressEditor:()=>null},'./WeeklyHoursEditor':{WeeklyHoursEditor:()=>null},
  });
  const html=renderToStaticMarkup(React.createElement(LandingContentEditor,{
    value:{productos_destacados:['real'],categorias:[],beneficios:[],contacto:{},ubicacion:{}},
    flags:{'Productos destacados':false},products:[{catalogId:'real',name:'Producto conservado',category:'Ropa'}],sections:['Productos destacados'],
    showVisibilityToggle:false,onChange:()=>{},onToggle:()=>{},
  }));
  assert(html.includes('Producto conservado'));assert(html.includes('checked=""'));
  assert(!html.includes('duplicate-toggle'));assert(!html.includes('disabled=""'));
});
