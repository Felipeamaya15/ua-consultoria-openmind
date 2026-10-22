// Run from frontend: node tests/editor-emprendedor-ux.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(relative,mocks={}) {
  const file=path.resolve(root,relative),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=id=>{if(id in mocks)return mocks[id];
    if(id==='../visualEditor/content')return {ContentInspector:()=>null};
    if(id==='../../landing/services/landingService')return {fetchLandingConfig:async()=>null,saveLandingConfig:async value=>value};
    if(id==='../../storefront/services/catalogService')return {fetchPublicProducts:async()=>[]};if(id.endsWith('.css'))return {};if(!id.startsWith('.'))return require(id);const p=path.resolve(path.dirname(file),id);return load(['.ts','.tsx'].map(ext=>p+ext).find(fs.existsSync)||path.join(p,'index.ts'),mocks);};
  vm.runInNewContext(code,{module,exports:module.exports,require:req,structuredClone,URLSearchParams,AbortController,requestAnimationFrame:mocks.frame|| (fn=>fn()),window:{addEventListener(){},removeEventListener(){},dispatchEvent(){}},ResizeObserver:undefined,localStorage:{getItem:()=>null,setItem(){}},Event,CustomEvent:class extends Event{}});
  return module.exports;
}
function flat(node,list=[]) { if(Array.isArray(node))node.forEach(n=>flat(n,list));else if(node&&typeof node==='object'){list.push(node);flat(node.props?.children,list);}return list; }
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');
function hooks(){let index=0,refIndex=0;const slots=[],refs=[];return {react:{useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=refIndex++;return refs[i]??={current:initial};},useMemo:fn=>fn(),useEffect(){}},reset(){index=refIndex=0;}};}
const jsx=(type,props)=>({type,props});
function editorHarness(){
  const h=hooks(),pending=[],bridge={};let params=new URLSearchParams('plantilla=editorial'),ok=true;
  const identity={apiBaseUrl:'https://ux.test',storeId:'31'};
  const {adminRepository}=load('src/features/admin/data/adminRepository.ts');let config=adminRepository.load(identity);
  const mocks={react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},frame:fn=>pending.push(fn),'react-router-dom':{Link:'Link',useSearchParams:()=>[params,value=>params=new URLSearchParams(value)],useBlocker:()=>({state:'unblocked'})},'../context/AdminContext':{useAdmin:()=>({config,setConfig:value=>{if(ok)config=value;return ok;},storageError:''})},'../../storefront/context/StoreIdentityContext':{useStoreIdentity:()=>({identity})},'../visualEditor/preview':{connectVisualPreview(doc,onSelect,onImage,onContent){Object.assign(bridge,{onSelect,onImage,onContent});return {update(){},updateBlocks(){},focusBlock:()=>true,content(){},imageMode(){},focus:()=>true,disconnect(){}};}}};
  const Editor=load('src/features/admin/pages/ThemeEditor.tsx',mocks).default;
  return {render(){h.reset();return flat(Editor());},flush(){pending.splice(0).forEach(fn=>fn());},fail(){ok=false;},config:()=>config,bridge};
}
const button=(tree,label)=>{const item=tree.find(n=>n.type==='button'&&text(n)===label);assert(item,'Missing button '+label);return item;};
let count=0;const test=(name,fn)=>{fn();console.log('OK '+name);count++;};

test('all pages are available in the compact selector without dirtying the design',()=>{
  const h=editorHarness();let tree=h.render();
  const selector=()=>tree.find(n=>n.type==='select'&&n.props['aria-label']==='Página que estás editando');
  const expected=['home','catalog','product','login','cart','checkout','tracking','profile','orders','confirmation','terms','privacy','refund'];
  assert(!tree.some(n=>n.props?.className==='ve-sidebar'));
  for(const page of expected){assert(flat(selector()).some(n=>n.type==='option'&&n.props.value===page),page);selector().props.onChange({target:{value:page}});tree=h.render();assert.equal(selector().props.value,page);assert.equal(button(tree,'Guardar cambios').props.disabled,true);assert(tree.find(n=>n.type==='iframe').props.src.includes('visualExample=1'));}
});

test('preview widths remain 1440, 768 and 375 with a visible device status',()=>{
  const h=editorHarness();let tree=h.render();
  for(const [label,width] of [['Computadora',1440],['Tablet',768],['Móvil',375]]){button(tree,label).props.onClick();tree=h.render();assert.equal(tree.find(n=>n.type==='iframe').props.style.width,width);assert(tree.some(n=>text(n).includes(width+' px')));assert.equal(button(tree,label).props['aria-pressed'],true);}
});
test('contextual selection reopens the inspector and shows only the selected product group',()=>{
  const h=editorHarness();let tree=h.render();const frame=tree.find(n=>n.type==='iframe');frame.props.ref.current={contentDocument:{}};frame.props.onLoad();
  button(tree,'Opciones').props.onClick();tree=h.render();assert.equal(tree.find(n=>n.props?.id==='ve-properties').props.hidden,true);
  h.bridge.onSelect('productCard',undefined,'Botón');tree=h.render();assert.equal(tree.find(n=>n.props?.id==='ve-properties').props.hidden,false);const inspector=tree.find(n=>n.type?.name==='VisualInspector');assert.equal(inspector.props.section,'productCard');assert.equal(inspector.props.groupLabel,'Botón');
  h.bridge.onImage('image-key-abc','https://example.test/photo.jpg');tree=h.render();assert(tree.some(n=>n.type?.name==='LegacyImageInspector'));assert(!tree.some(n=>n.type?.name==='VisualInspector'));
});
test('saving shows progress, errors keep the draft, retry clears dirty, and undo/redo preserve edits',()=>{
  const h=editorHarness();let tree=h.render();tree.find(n=>n.type?.name==='VisualInspector').props.onEdit('hero.titleSize',84);tree=h.render();assert(tree.some(n=>n.props?.children==='Cambios sin guardar'));
  button(tree,'Deshacer').props.onClick();tree=h.render();assert.equal(button(tree,'Guardar cambios').props.disabled,true);button(tree,'Rehacer').props.onClick();tree=h.render();
  button(tree,'Guardar cambios').props.onClick();tree=h.render();assert(tree.some(n=>n.props?.children==='Guardando…'));assert.equal(button(tree,'Guardando…').props.disabled,true);h.flush();tree=h.render();assert(tree.some(n=>n.props?.children==='✓ Guardado'));
  tree.find(n=>n.type?.name==='VisualInspector').props.onEdit('hero.titleSize',72);tree=h.render();h.fail();button(tree,'Guardar cambios').props.onClick();h.flush();tree=h.render();assert(tree.some(n=>n.props?.children==='No se pudo guardar'));assert.equal(button(tree,'Guardar cambios').props.disabled,false);button(tree,'Descartar cambios').props.onClick();tree=h.render();assert.equal(tree.find(n=>n.type?.name==='VisualInspector').props.effective.hero.titleSize,84);
});
test('template choice can be saved alone and a discarded choice returns to the saved template',()=>{
  const h=editorHarness();let tree=h.render();button(tree,'Plantillas').props.onClick();tree=h.render();assert.equal(tree.find(n=>n.props?.id==='ve-properties').props.hidden,false);
  tree.find(n=>n.type?.name==='TemplateGallery').props.onSelect('minimal');tree=h.render();assert.equal(button(tree,'Guardar cambios').props.disabled,false);assert(tree.find(n=>n.type==='iframe').props.src.startsWith('/plantilla/2'));
  button(tree,'Guardar cambios').props.onClick();h.flush();tree=h.render();assert.equal(h.config().template,'minimal');assert.equal(button(tree,'Guardar cambios').props.disabled,true);
  tree.find(n=>n.type?.name==='TemplateGallery').props.onSelect('catalog');tree=h.render();button(tree,'Descartar cambios').props.onClick();tree=h.render();assert(tree.find(n=>n.type==='iframe').props.src.startsWith('/plantilla/2'));assert.equal(button(tree,'Guardar cambios').props.disabled,true);
});
test('four visual templates expose their personality and a real selection action',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const {TemplateGallery}=load('src/features/admin/visualEditor/templates.tsx');
  const html=renderToStaticMarkup(React.createElement(TemplateGallery,{selected:'editorial',onSelect(){}}));for(const name of ['Studio Pop','Soft Discovery','Velta Editorial','Obsidian Showcase'])assert(html.includes(name));assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert(html.includes('Probar esta plantilla'));
  let chosen;const tree=flat(TemplateGallery({selected:'editorial',onSelect:id=>chosen=id}));tree.filter(n=>n.type==='button')[3].props.onClick();assert.equal(chosen,'catalog');
});
test('returning from templates to a page or content reopens its editing options',()=>{
  const h=editorHarness();let tree=h.render();button(tree,'Plantillas').props.onClick();tree=h.render();
  button(tree,'Contenido y secciones').props.onClick();tree=h.render();assert.equal(tree.find(n=>n.props?.id==='ve-properties').props.hidden,false);
  button(tree,'Plantillas').props.onClick();tree=h.render();
  tree.find(n=>n.type==='select'&&n.props['aria-label']==='Página que estás editando').props.onChange({target:{value:'product'}});tree=h.render();
  assert.equal(tree.find(n=>n.props?.id==='ve-properties').props.hidden,false);assert.equal(tree.find(n=>n.type?.name==='VisualInspector').props.page,'product');
});
test('image size offers sensible presets and a direct custom value',()=>{
  const h=hooks(),{FriendlySizeControl}=load('src/features/admin/visualEditor/controls.tsx',{react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx}});let value=100;
  const render=()=>{h.reset();return flat(FriendlySizeControl({label:'Tamaño de imagen (%)',path:'image.scale',value,min:1,max:400,onChange:next=>value=next,onReset(){}}));};let tree=render();
  button(tree,'Grande').props.onClick();assert.equal(value,140);tree=render();button(tree,'Personalizado').props.onClick();tree=render();const input=tree.find(n=>n.type==='input');input.props.onChange({target:{valueAsNumber:125}});assert.equal(value,125);input.props.onChange({target:{valueAsNumber:401}});assert.equal(value,125);
});
test('palette previews show three coordinated colors and apply all related surfaces',()=>{
  const {PaletteControl,paletteEdits}=load('src/features/admin/visualEditor/palettes.tsx');let selected;const tree=flat(PaletteControl({onPalette:p=>selected=p,onReset(){}}));const first=tree.find(n=>n.props?.['aria-label']==='Usar esta paleta: Océano');assert.equal(flat(first).filter(n=>n.type==='span'&&n.props.style?.background).length,3);first.props.onClick();assert.equal(paletteEdits(selected)['footer.background'],selected.primary);
});
test('simple inspector prioritizes fonts and palettes; advanced fields remain editable',()=>{
  const h=hooks(),mocks={react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx}};const {VisualInspector}=load('src/features/admin/visualEditor/inspector.tsx',mocks),{resolveVisualConfig}=load('src/features/storefront/visual/resolveVisualConfig.ts');
  const props={section:'global',effective:resolveVisualConfig(),document:{overrides:{},storeOverrides:{}},onEdit(){},onReset(){}};const render=()=>{h.reset();return flat(VisualInspector(props));};let tree=render();const paths=()=>tree.filter(n=>n.props?.path).map(n=>n.props.path);assert(paths().includes('global.typography.heading'));assert(!paths().includes('global.contentMaxWidth'));assert(!paths().includes('global.colors.primary'));assert(tree.some(n=>n.type?.name==='PaletteControl'));
  button(tree,'Personalizar colores y opciones avanzadas').props.onClick();tree=render();assert(paths().includes('global.contentMaxWidth'));assert(paths().includes('global.colors.primary'));
});
test('image fit is normalized, persisted and invalid values cannot reach the preview',()=>{
  const {readThemeImages}=load('src/features/storefront/visual/imageSettings.ts');for(const fit of ['cover','contain'])assert.equal(readThemeImages({'image-key-abc':{src:'photo.jpg',fit}})['image-key-abc'].fit,fit);assert.equal(readThemeImages({'image-key-abc':{fit:'hidden'}})['image-key-abc'].fit,undefined);
});
test('preview keyboard selection, product button context and university image protection survive disconnect',()=>{
  const {connectVisualPreview}=load('src/features/admin/visualEditor/preview.ts'),{resolveVisualConfig}=load('src/features/storefront/visual/resolveVisualConfig.ts');const listeners=new Map();
  const attributes=new Map([['src','photo.jpg']]);const image={tagName:'IMG',dataset:{},style:{objectFit:'cover',objectPosition:'',transform:'',transformOrigin:'',borderRadius:''},src:'photo.jpg',getAttribute:key=>attributes.get(key)??null,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),hasAttribute:()=>false,closest(selector){return selector==='img'?this:null;}};
  const card={tagName:'ARTICLE',dataset:{visualSection:'productCard'},getAttribute:key=>key==='data-visual-section'?'productCard':null,setAttribute(){},removeAttribute(){},closest:()=>null};
  const doc={body:{},head:{appendChild(){}},createElement:()=>({remove(){}}),querySelectorAll:selector=>selector==='img'?[image]:selector==='[data-visual-section]'?[card]:[],addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),defaultView:{}};
  let selected,selectedImage,protectedImage;const connection=connectVisualPreview(doc,(section,href,group)=>selected={section,group},(key,src)=>selectedImage={key,src},institutional=>protectedImage=institutional);connection.update(resolveVisualConfig(),{});
  assert.equal(image.tabIndex,0);assert.equal(card.tabIndex,0);
  const event=target=>({target,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});listeners.get('keydown')({...event(image),key:'Enter'});assert(selectedImage.key.startsWith('image-key-'));assert.equal(attributes.get('data-editor-image-selected'),'true');
  const button={tagName:'BUTTON',closest:selector=>selector==='[data-visual-section]'?card:selector==='button,a'?{}:null};listeners.get('click')(event(button));assert.equal(selected.section,'productCard');assert.equal(selected.group,'Botón');
  const logo={...image,closest:selector=>selector==='img'?logo:selector.includes('institutional-branding')?{}:null};listeners.get('click')(event(logo));assert.equal(protectedImage,true);
  connection.disconnect();assert.equal(listeners.size,0);assert.equal(attributes.has('tabindex'),false);assert.equal(image.style.objectFit,'cover');
});
test('responsive workspace keeps a wide canvas and stacks contextual tools on mobile',()=>{
  const css=require('postcss').parse(fs.readFileSync(path.join(root,'src/features/admin/visualEditor/workspace.css'),'utf8'));
  function style(selector,width){const result={};css.walkRules(rule=>{if(!rule.selector.split(',').map(s=>s.trim()).includes(selector))return;for(let parent=rule.parent;parent;parent=parent.parent){if(parent.type==='atrule'&&parent.name==='media'){const max=parent.params.match(/max-width\s*:\s*(\d+)px/);if(max&&width>Number(max[1]))return;const min=parent.params.match(/min-width\s*:\s*(\d+)px/);if(min&&width<Number(min[1]))return;}}rule.nodes.filter(n=>n.type==='decl').forEach(decl=>result[decl.prop]=decl.value);});return result;}
  assert.equal(style('.ve-redesign .ve-workspace',1440).display,'grid');
  assert.equal(style('.ve-redesign .ve-workspace',1440)['grid-template-columns'],'minmax(0,1fr) 310px');
  assert.equal(style('.ve-redesign .ve-workspace',768).display,'grid');
  assert.equal(style('.ve-redesign .ve-workspace',375).display,'flex');
  assert.equal(style('.ve-redesign .ve-workspace',375)['flex-direction'],'column');
  assert.equal(style('.ve-redesign.ve-expanded .ve-properties',1440).display,'none');
  assert.equal(style('.ve-redesign .ve-preview',375)['min-height'],'480px');
  assert.equal(style('.ve-redesign .ve-tools',375)['overflow-x'],'auto');
});
(async()=>{
  const {fetchStoreIdentity}=load('src/features/storefront/services/storeIdentityService.ts',{'../../../api':{API_BASE_URL:'https://identity.test'},'../../../core/http/initialLoad':{fetchInitialLoad:async()=>({ok:true,json:async()=>({exito:true,data:{tienda_id:42}})})}});
  assert.equal((await fetchStoreIdentity()).storeId,'42');
  for(const status of [401,403,500,503]){
    const service=load('src/features/storefront/services/storeIdentityService.ts',{'../../../api':{API_BASE_URL:'https://identity.test'},'../../../core/http/initialLoad':{fetchInitialLoad:async()=>({ok:false,status})}});
    await assert.rejects(service.fetchStoreIdentity(),status===503?/configuración/:status===401||status===403?/sesión/:/500/);
  }
  count++;console.log('OK identity errors distinguish authentication, server failure and store configuration');
  const h=hooks(),effects=[];h.react.useEffect=fn=>effects.push(fn);h.react.createContext=()=>({Provider:'Provider'});
  let fail=true;
  const {StoreIdentityProvider}=load('src/features/storefront/context/StoreIdentityContext.tsx',{react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'../services/storeIdentityService':{fetchStoreIdentity:async()=>{if(fail)throw new TypeError('connection');return {apiBaseUrl:'https://identity.test',storeId:'42'};}}});
  const render=()=>{h.reset();return StoreIdentityProvider({children:'shop'}).props.value;};
  render();effects.shift()();await new Promise(setImmediate);let value=render();assert(value.error);assert.equal(value.loading,false);fail=false;value.retry();value=render();assert.equal(value.loading,true);assert.equal(value.error,'');effects.at(-1)();await new Promise(setImmediate);value=render();assert.equal(value.identity.storeId,'42');assert.equal(value.loading,false);
  count++;console.log('OK identity retry recovers without a full page reload');
  console.log(`${count} entrepreneur UX tests passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
