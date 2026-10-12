// Additional coverage for the final editor features; existing suites keep regression coverage.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map(),storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
function load(relative,mocks={}) {
  const file=path.resolve(root,relative);if(!Object.keys(mocks).length&&cache.has(file))return cache.get(file);
  const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=id=>{if(id in mocks)return mocks[id];if(id.endsWith('.css'))return {};if(!id.startsWith('.'))return require(id);const p=path.resolve(path.dirname(file),id);return load(['.ts','.tsx'].map(ext=>p+ext).find(fs.existsSync)||path.join(p,'index.ts'),mocks);};
  vm.runInNewContext(code,{module,exports:module.exports,require:req,requestAnimationFrame: callback => callback(), structuredClone,URLSearchParams,localStorage,window:{dispatchEvent(){}},Event,CustomEvent:class extends Event{},ResizeObserver:undefined});
  if(!Object.keys(mocks).length)cache.set(file,module.exports);return module.exports;
}
const model=load('src/features/admin/visualEditor/model.ts'),resolver=load('src/features/storefront/visual/resolveVisualConfig.ts'),css=load('src/features/storefront/visual/cssVariables.ts').visualConfigToCssVariables;
const base={storeOverrides:{},overrides:{},storeColors:{},templateColors:{},images:{}};
let count=0;function test(name,fn){fn();count++;console.log('OK '+name);}
const plain=v=>JSON.parse(JSON.stringify(v));
test('history undoes resets, redoes, clears a branch and bounds memory',()=>{
  const h=load('src/features/admin/visualEditor/history.ts');let history=h.createHistory(base);
  history=h.recordHistory(history,model.editProperty(base,'pages.product.content.imageSize',370));history=h.undoHistory(history);assert.deepEqual(plain(history.present),base);
  history=h.redoHistory(history);assert.equal(history.present.overrides.pages.product.content.imageSize,370);
  history=h.recordHistory(history,model.resetSection(history.present,'pages.product.content'));history=h.undoHistory(history);assert.equal(history.present.overrides.pages.product.content.imageSize,370);
  history=h.recordHistory(history,model.editProperty(history.present,'pages.product.content.imageSize',420));assert.equal(history.future.length,0);
  for(let i=0;i<70;i++)history=h.recordHistory(history,model.editProperty(history.present,'pages.product.content.imageSize',200+i));assert.equal(history.past.length,40);assert.equal(h.recordHistory(history,history.present),history);
});
test('selector actually changes the iframe, page inspector, history and sparse publication',()=>{
  const {adminRepository}=load('src/features/admin/data/adminRepository.ts'),storeApi=load('src/features/storefront/visual/storage.ts'),identity={apiBaseUrl:'https://final-editor.test',storeId:'123'};
  let config=adminRepository.load(identity),index=0,refIndex=0;const slots=[],refs=[];
  const react={useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=refIndex++;if(!(i in refs))refs[i]={current:initial};return refs[i];},useMemo:fn=>fn(),useEffect(){}};
  const jsx=(type,props)=>({type,props}),mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-router-dom':{Link:'Link',useSearchParams:()=>[new URLSearchParams('plantilla=editorial')],useBlocker:()=>({state:'unblocked'})},'../context/AdminContext':{useAdmin:()=>({config,setConfig:next=>{adminRepository.save(next,identity);config=adminRepository.load(identity);return true;},storageError:''})},'../../storefront/context/StoreIdentityContext':{useStoreIdentity:()=>({identity})}};
  const Editor=load('src/features/admin/pages/ThemeEditor.tsx',mocks).default;
  function flat(node,list=[]){if(Array.isArray(node))node.forEach(n=>flat(n,list));else if(node&&typeof node==='object'){list.push(node);flat(node.props?.children,list);}return list;}
  const render=()=>{index=refIndex=0;return flat(Editor());},button=(tree,text)=>tree.find(n=>n.type==='button'&&n.props.children===text);
  let tree=render();const selector=()=>tree.find(n=>n.type==='select'&&n.props['aria-label']==='Página que estás editando');
  const labels=flat(selector().props.children).filter(n=>n.type==='option').map(n=>n.props.children);for(const label of ['Inicio','Catálogo','Producto','Carrito','Acceso','Checkout','Seguimiento','Perfil','Mis pedidos'])assert(labels.includes(label),label);
  for(const page of ['product','cart','login','checkout','tracking','profile','orders']){
    selector().props.onChange({target:{value:page}});tree=render();assert(tree.find(n=>n.type==='iframe').props.src.includes('visualExample=1'));
    if(page==='product')assert(tree.find(n=>n.type==='iframe').props.src.includes('/producto/ejemplo-editor'));
    const inspector=tree.find(n=>n.type?.name==='VisualInspector');assert.equal(inspector.props.page,page);inspector.props.onEdit('pages.'+page+'.layout.titleSize',49);tree=render();
    button(tree,'Deshacer').props.onClick();tree=render();assert.notEqual(tree.find(n=>n.type?.name==='VisualInspector').props.effective.pages[page].layout.titleSize,49);
    button(tree,'Rehacer').props.onClick();tree=render();button(tree,'Guardar cambios').props.onClick();tree=render();assert.equal(resolver.resolveStoreVisualConfig(storeApi.readStoredStoreConfig(identity),'editorial').pages[page].layout.titleSize,49);
    assert(!tree.some(n=>n.props?.children==='Cambios sin guardar'));
    if(page==='checkout'){const select=tree.find(n=>n.type==='select'&&n.props['aria-label']==='Etapa de compra');for(const step of ['contact','delivery','payment','confirm']){select.props.onChange({target:{value:step}});tree=render();assert(tree.find(n=>n.type==='iframe').props.src.includes('visualStep='+step));assert.equal(tree.find(n=>n.type?.name==='VisualInspector').props.page,step==='confirm'?'confirmation':'checkout');}}
  }
  for(const [label,width] of [['Computadora',1440],['Tablet',768],['Móvil',375]]) { button(tree,label).props.onClick(); tree=render(); assert.equal(tree.find(n=>n.type==='iframe').props.style.width,width); assert(!tree.some(n=>n.props?.children==='Cambios sin guardar')); }
  button(tree,'Opciones').props.onClick();tree=render();assert.equal(tree.find(n=>n.props?.id==='ve-properties').props.hidden,true);button(tree,'Opciones').props.onClick();
  slots.length=refs.length=0;tree=render();for(const page of ['product','cart','login','checkout','tracking','profile','orders'])assert.equal(tree.find(n=>n.type?.name==='VisualInspector').props.effective.pages[page].layout.titleSize,49);assert.equal(button(tree,'Deshacer').props.disabled,true);
  assert.equal(storeApi.readStoredStoreConfig(identity).history,undefined);
});
test('safe examples render complete pages without mounting public business children',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),pages=load('src/features/storefront/visual/pages.ts');let embedded=true,location={pathname:'',search:'?visualExample=1'},mounted=0;
  const Component=load('src/features/storefront/components/store/StorePageContent.tsx',{react:{...React,lazy:()=>({previewProduct})=>React.createElement('p',null,previewProduct.name)},'react-router-dom':{useLocation:()=>location},'../../visual/pages':{...pages,isActiveEditorPreview:()=>embedded}}).StorePageContent;
  function Business(){mounted++;return React.createElement('p',null,'REAL');}
  for(const [page,text]of [['product','Bolso de algodón'],['cart','Tu carrito'],['login','Iniciar sesión'],['checkout','Datos de contacto'],['confirmation','Ver mi pedido'],['tracking','Preparando tu pedido'],['profile','Datos personales'],['orders','Pedidos recientes']]){
    location={pathname:'/plantilla/1/'+pages.STORE_PAGES.find(p=>p.id===page).path+(page==='product'?'/ejemplo-editor':''),search:'?visualExample=1'};
    const html=renderToStaticMarkup(React.createElement(Component,null,React.createElement(Business)));assert(html.includes(text),page);assert(html.includes('Datos ficticios'));assert.equal(mounted,0);
  }
  location={pathname:'/plantilla/1/compra',search:'?visualExample=1&visualStep=delivery'};assert(renderToStaticMarkup(React.createElement(Component)).includes('Opciones de entrega'));
  location.search='?visualExample=1&visualStep=payment';assert(renderToStaticMarkup(React.createElement(Component)).includes('Webpay'));
  location.search='?visualExample=1&visualStep=confirm';assert(renderToStaticMarkup(React.createElement(Component)).includes('data-visual-page="confirmation"'));
  location={pathname:'/plantilla/1/ingresar',search:'?visualExample=1&modo=registro'};assert(renderToStaticMarkup(React.createElement(Component)).includes('Confirmar contraseña'));
  embedded=false;assert(renderToStaticMarkup(React.createElement(Component,null,React.createElement(Business))).includes('REAL'));assert.equal(mounted,1);
  embedded=true;location.search='';renderToStaticMarkup(React.createElement(Component,null,React.createElement(Business)));assert.equal(mounted,2);
});
test('product geometry and cart/form properties reach responsive public variables',()=>{
  let document=base;for(const [path,value]of Object.entries({'pages.product.content.imageRatio':1.5,'pages.product.content.imageSize':380,'pages.product.content.imageWidth':60,'pages.cart.content.imageSize':80,'pages.login.content.formWidth':440,'responsive.mobile.pages.product.content.imageSize':240}))document=model.editProperty(document,path,value);
  const config=model.resolveEditorDocument(document,'editorial'),vars=css(config);assert.equal(vars['--visual-page-product-image-size-desktop'],'380px');assert.equal(vars['--visual-page-product-image-size-mobile'],'240px');assert.equal(vars['--visual-page-product-content-columns-desktop'],'minmax(0,60fr) minmax(0,40fr)');assert.equal(vars['--visual-page-cart-image-size-desktop'],'80px');assert.equal(config.pages.profile.content.formWidth,560);
  const productSource=fs.readFileSync(path.join(root,'src/features/storefront/pages/ProductDetail.tsx'),'utf8');assert.equal((productSource.match(/data-page-main-image/g)||[]).length,3);assert.equal((productSource.match(/<QuantityControl /g)||[]).length,3);assert(fs.readFileSync(path.join(root,'src/features/storefront/components/store/QuantityControl.tsx'),'utf8').includes('data-page-quantity'));
  const {getInspectorGroups}=load('src/features/admin/visualEditor/inspector.tsx');for(const page of ['product','cart','login','checkout','tracking','profile','orders'])for(const section of ['pageLayout','pagePanel','pageField','pageButton'])for(const group of getInspectorGroups(section,false,page))for(const field of group.fields)assert.notEqual(model.readPath(config,field.path),undefined,field.path);
});
test('stable image keys survive reordered DOM and replacements while reading old keys',()=>{
  const api=load('src/features/storefront/visual/imageSettings.ts'),img={src:'asset.png',dataset:{},style:{},getAttribute(key){return key==='src'?this.src:null;},closest(){return null;}};
  const key=api.stableImageKey(img),setting={src:'new.png',scale:100,x:50,y:50,radius:3};img.src='new.png';assert.equal(api.stableImageKey(img),key);
  const normalized=api.readThemeImages({[key]:setting,'image-7':setting});assert.equal(api.findImageSetting(normalized,img,99).radius,3);assert.equal(api.findImageSetting({'image-7':setting},img,7).radius,3);
});
test('contrast warnings distinguish insufficient contrast from dynamic colors',()=>{const {contrastRatio}=load('src/features/admin/visualEditor/contrast.ts');assert.equal(contrastRatio('#000','#fff'),21);assert.equal(contrastRatio('#fff','#fff'),1);assert(contrastRatio('#777777','#ffffff')<4.5);assert.equal(contrastRatio('currentColor','#fff'),null);});
console.log(`${count} final editor tests passed.`);
