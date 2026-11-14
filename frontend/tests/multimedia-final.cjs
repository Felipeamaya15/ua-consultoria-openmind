const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{MemoryRouter}=require('react-router-dom');
const {load}=require('./source-loader.cjs');
const {resolveVisualConfig,resolveStoreVisualConfig,mergeVisualOverrides}=load('src/features/storefront/visual/resolveVisualConfig.ts');
const {visualConfigWithCarouselVars}=load('src/features/storefront/visual/carouselConfig.ts');
const hero={hoverFeaturedMotion:'slide',hoverFeaturedLight:'sparkle',hoverCatalogMotion:'zoom',hoverCatalogLight:'twinkle',carouselMode:'manual',carouselInterval:7,carouselIndicators:false,carouselTransition:'slide',productImageMode:'automatic',productImageInterval:3,productImageTransition:'fade'};
test('saved effects and product gallery settings survive real schema normalization for all four templates',()=>{
 for(const template of ['editorial','minimal','visual','catalog']){
  const stored=JSON.parse(JSON.stringify({themeEditor:{[template]:{visualConfig:mergeVisualOverrides({hero}, {})}}}));
  const resolved=resolveStoreVisualConfig(stored,template);for(const [key,value]of Object.entries(hero))assert.equal(resolved.hero[key],value,template+key);
  const variables=visualConfigWithCarouselVars(resolved);assert.equal(variables['--om-hover-featured-transform'],load('src/features/storefront/visual/effectLibrary.ts').motionTransform('slide'));assert(variables['--om-hover-featured-overlay-background'].includes('radial-gradient'));assert.equal(variables['--openmind-product-mode'],'automatic');assert.equal(variables['--openmind-carousel-indicators'],'0');
 }
 const rejected=resolveVisualConfig({customization:{hero:{hoverCatalogLight:'url(javascript:bad)',productImageMode:'execute',carouselInterval:0}}});assert.equal(rejected.hero.hoverCatalogLight,'none');assert.equal(rejected.hero.productImageMode,'hover');assert.equal(rejected.hero.carouselInterval,5);
});
test('slide content has legacy fallbacks, independent visibility, stable links and safe destinations',()=>{
 const {resolveHeroContent}=load('src/features/storefront/hooks/useHeroContent.ts');const landing={titulo:'General',descripcion:'Descripción general',texto_boton:'Ver'},route=path=>'/plantilla/2/'+path;
 assert.equal(resolveHeroContent(landing,{},route).title,'General');const slide={titulo:'Colección',descripcion:'Texto propio',texto_boton:'Explorar',enlace:'catalogo?categoria=Flores',mostrar_descripcion:false};const value=resolveHeroContent(landing,slide,route);assert.equal(value.title,'Colección');assert.equal(value.showDescription,false);assert.equal(value.href,'/plantilla/2/catalogo?categoria=Flores');assert.equal(value.buttonText,'Explorar');assert.equal(resolveHeroContent(landing,{enlace:'javascript:alert(1)'},route).href,'/plantilla/2/catalogo');assert.equal(resolveHeroContent(landing,{enlace:'//evil.test'},route).href,'/plantilla/2/catalogo');
});
test('gallery keeps product links separate from controls and hides arrows for a single image',()=>{
 const {ProductImageGallery}=load('src/features/storefront/components/store/ProductImageGallery.tsx');
 const render=images=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(ProductImageGallery,{images,alt:'Producto QA',href:'/producto/qa'})));
 const one=render(['/a.png']);assert(!one.includes('Imagen siguiente'));const several=render(['/a.png','/b.png']);assert(several.includes('Imagen anterior'));assert(several.includes('Imagen siguiente'));assert(several.includes('href="/producto/qa"'));assert(!/<a[^>]*>(?:(?!<\/a>).)*<button/s.test(several));
});
test('expanded media preference changes rendered content without opening arbitrary link pages',()=>{
 const {MediaPreview}=load('src/features/marketing/components/MediaPreview.tsx');const media={id:'qa',titulo:'Video QA',tipo:'youtube',url:'https://www.youtube.com/watch?v=M7lc1UVf-VE',activo:true,archivo:null};
 const render=(opened,resource=media)=>renderToStaticMarkup(React.createElement(MediaPreview,{resource,initiallyOpen:opened}));assert(!render(false).includes('<iframe'));assert(render(true).includes('<iframe'));assert(!render(true,{...media,tipo:'enlace',url:'https://example.test/recurso'}).includes('<iframe'));
});
test('video upload UX rejects oversize files and keeps image and external URL validation',()=>{
 const {mediaProblem}=load('src/features/marketing/domain/mediaLibrary.ts');const draft={titulo:'Video',descripcion:'',tipo:'video',url:'',activo:true};assert.equal(mediaProblem(draft,{name:'clip.mp4',size:5000}), '');assert.match(mediaProblem(draft,{name:'clip.webm',size:8*1024*1024+1}),/8 MB/);assert.match(mediaProblem(draft,null),/dispositivo/);assert.equal(mediaProblem({...draft,tipo:'imagen'},{name:'foto.png',size:100}), '');
});
