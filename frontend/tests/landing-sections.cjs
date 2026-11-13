const assert=require('node:assert/strict'),{test}=require('node:test');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const{load}=require('./source-loader.cjs');

test('all four home pages place enabled benefits directly after the hero, before merchant sections',()=>{
  const landing={titulo:'Portada QA',descripcion:'Texto real',texto_boton:'Ver productos',contenido:{bloques:[{id:'fec00000-0000-4000-8000-000000000001',tipo:'texto',visible:true,titulo:'Sección del negocio QA',subtitulo:'',texto:'Texto administrable',imagenes:[]}]}};
  const content={beneficios:[{titulo:'Beneficio QA de orden',descripcion:'Compacto',icono:'truck'}],categorias:[],productos_destacados:[]};
  for(const page of ['EditorialHome','MinimalHome','VisualHome','CatalogHome']){
    const useStore=()=>({landing,landingProducts:[],visualConfig:load('src/features/storefront/visual/resolveVisualConfig.ts').resolveVisualConfig(),blockStyles:{},config:{name:'Tienda QA'}});
    const template=()=>({template:'editorial',route:(path='')=>'/plantilla/1/'+path});
    const {default:Home}=load(`src/features/storefront/pages/${page}.tsx`,{
      '../../landing/components/LandingDetails':{LandingDetails:()=>null},
      '../../landing/components/LandingStatus':{LandingStatus:()=>null},
      '../../landing/hooks/useLandingContent':{useLandingContent:()=>({featured:[],categories:[],content})},
      '../hooks/useLandingContent':{useLandingContent:()=>({featured:[],categories:[],content})},
      '../../landing/hooks/useLandingSectionVisibility':{useLandingSectionVisibility:()=>name=>name==='Beneficios'},
      '../context/StoreContext':{useStore},'../../storefront/context/StoreContext':{useStore},
      '../hooks/useStorefrontTemplate':{useStorefrontTemplate:template},'../../storefront/hooks/useStorefrontTemplate':{useStorefrontTemplate:template},
      '../components/store/ProductCard':{ProductCard:()=>null},
      'react-router-dom':{Link:({children})=>React.createElement('a',null,children),useNavigate:()=>()=>{}},
      '../components/ui':{Icon:()=>null,Badge:({children})=>React.createElement('span',null,children)},
      './landing-blocks.css':{},
    });
    const html=renderToStaticMarkup(React.createElement(Home));
    const hero=html.indexOf('data-visual-section="hero"'),benefit=html.indexOf('Beneficio QA de orden'),section=html.indexOf('data-content-block-id=');
    assert(hero>=0&&benefit>=0&&section>=0,`${page}: render must contain hero, enabled benefits and saved section`);
    assert(hero<benefit&&benefit<section,`${page}: benefits must precede merchant sections immediately after the hero`);
  }
});

test('Velta renders no unmanageable demo stories when there are no saved blocks',()=>{
  const {default:VisualHome}=load('src/features/storefront/pages/VisualHome.tsx',{
    '../../landing/components/LandingBlocks':{LandingBlocks:()=>null},
    '../../landing/components/LandingDetails':{LandingDetails:()=>null},
    '../../landing/components/LandingStatus':{LandingStatus:()=>null},
    '../../landing/hooks/useLandingContent':{useLandingContent:()=>({featured:[],content:{beneficios:[]}})},
    '../hooks/useLandingContent':{useLandingContent:()=>({featured:[],categories:[],content:{beneficios:[]}})},
    '../../landing/hooks/useLandingSectionVisibility':{useLandingSectionVisibility:()=>()=>false},
    '../context/StoreContext':{useStore:()=>({visualConfig:load('src/features/storefront/visual/resolveVisualConfig.ts').resolveVisualConfig(),landing:{titulo:'Mi tienda',descripcion:'Real',texto_boton:'Ver'},config:{name:'Mi tienda'}})},
    '../../storefront/context/StoreContext':{useStore:()=>({visualConfig:load('src/features/storefront/visual/resolveVisualConfig.ts').resolveVisualConfig(),landing:{titulo:'Mi tienda',descripcion:'Real',texto_boton:'Ver'},landingProducts:[],config:{name:'Mi tienda'}})},
    '../hooks/useStorefrontTemplate': {useStorefrontTemplate: () => ({template: 'visual', route: path => '/plantilla/3/' + path})},
    '../../storefront/hooks/useStorefrontTemplate': {useStorefrontTemplate: () => ({template: 'visual', route: path => '/plantilla/3/' + path})},
    'react-router-dom':{Link:({children})=>React.createElement('a',null,children)},
    '../components/ui':{Icon:()=>null},
  });
  const html=renderToStaticMarkup(React.createElement(VisualHome));
  assert(!html.includes('Nacido de una idea'));assert(!html.includes('Un catálogo que crece'));assert(html.includes('Mi tienda'));
});

test('the public shared renderer keeps every supported type once, in saved order and visibility',()=>{
  const blocks=['historia','imagen_texto','texto','galeria','cita'].map((tipo,index)=>({id:`00000000-0000-4000-8000-00000000000${index}`,tipo,visible:index!==2,titulo:`Título ${index}`,subtitulo:'Compartido',texto:'Texto <script> de la tienda',imagenes:[]}));
  for(const template of ['editorial','minimal','visual','catalog']){
    const{LandingBlocks}=load('src/features/landing/components/LandingBlocks.tsx',{
      '../../storefront/context/StoreContext':{useStore:()=>({landing:{contenido:{bloques:blocks}},blockStyles:{}})},
      '../../storefront/hooks/useStorefrontTemplate':{useStorefrontTemplate:()=>({template})},
      './landing-blocks.css':{},
    });
    const html=renderToStaticMarkup(React.createElement(LandingBlocks));
    assert(html.includes(`data-block-template="${template}"`));
    assert.deepEqual([...html.matchAll(/data-content-block-id="([^"]+)"/g)].map(match=>match[1]),blocks.filter(b=>b.visible).map(b=>b.id));
    assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
    assert(!html.includes('Título 2'));
  }
});

test('landing reads explicitly bypass HTTP cache and retain cancellation/retry options',async()=>{
  let called;
  const signal=new AbortController().signal;
  const api=load('src/features/landing/services/landingService.ts',{
    '../../../api':{API_BASE_URL:'http://isolated.test'},
    '../../../core/http/initialLoad':{fetchInitialLoad:async(url,options)=>{called={url,options};return {}; }},
    '../../../shared/services/apiRequest':{readApiResponse:async()=>null},
  });
  assert.equal(await api.fetchLandingConfig({signal,retry:true}),null);
  assert.equal(called.options.cache,'no-store');assert.equal(called.options.signal,signal);assert.equal(called.options.retry,true);
});
