// Run from frontend: node tests/visual-editor.cjs
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map(), storage = new Map();
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } }
function load(relative, mocks = {}) {
  const file = path.resolve(root, relative); if (!Object.keys(mocks).length && cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const req = id => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (id.endsWith('.css')) return {};
    if (!id.startsWith('.')) return require(id);
    const target = path.resolve(path.dirname(file), id), resolved = ['.ts','.tsx'].map(ext => target + ext).find(fs.existsSync);
    return load(resolved || path.join(target, 'index.ts'), mocks);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: req, requestAnimationFrame: callback => callback(), structuredClone, URLSearchParams, localStorage, Event, CustomEvent, window: { dispatchEvent() {}, confirm: () => true }, ResizeObserver: undefined });
  if (!Object.keys(mocks).length) cache.set(file, module.exports); return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
let count = 0; function test(name, fn) { fn(); console.log('OK ' + name); count++; }
const model = load('src/features/admin/visualEditor/model.ts');
const resolver = load('src/features/storefront/visual/resolveVisualConfig.ts');
const css = load('src/features/storefront/visual/cssVariables.ts').visualConfigToCssVariables;
const { adminRepository } = load('src/features/admin/data/adminRepository.ts');
const storageApi = load('src/features/storefront/visual/storage.ts');
const { VISUAL_PRESETS } = load('src/features/storefront/visual/presets.ts');
const sections = load('src/features/admin/visualEditor/sections.ts');
const identityA = { apiBaseUrl: 'http://qa.example.test', storeId: '1' }, identityB = { ...identityA, storeId: '2' };
const seed = (data, identity = identityA) => storageApi.saveStoredStoreConfig(data, identity);
test('stage 3 palette coordinates surfaces while manual bar and footer edits remain independent', () => {
  const {EDITOR_PALETTES,paletteEdits}=load('src/features/admin/visualEditor/palettes.tsx');
  const edits=paletteEdits(EDITOR_PALETTES[2]);
  const resolved=resolver.resolveVisualConfig({customization:{global:{colors:{background:edits['global.colors.background'],surface:edits['global.colors.surface'],text:edits['global.colors.text']}},header:{background:edits['header.background'],textColor:edits['header.textColor']},topBar:{background:'#123456'},footer:{background:'#abcdef'}}});
  const vars=css(resolved); assert.equal(vars['--visual-background-desktop'],'#faf5ff'); assert.equal(vars['--visual-page-product-panel-background-desktop'],'#ffffff');
  assert.equal(vars['--visual-topbar-bg-desktop'],'#123456'); assert.equal(vars['--visual-footer-background-desktop'],'#abcdef');
});
test('stage 3 page geometry follows presets and explicit responsive page values win', () => {
  for(const [template,radius] of [['editorial',8],['minimal',28],['visual',0],['catalog',14]]) {
    const result=resolver.resolveVisualConfig({template,customization:{pages:{product:{panel:{radius:31}}},responsive:{mobile:{pages:{product:{field:{radius:3}}}}}}});
    assert.equal(result.pages.cart.field.radius,radius); assert.equal(result.pages.product.panel.radius,31);
    assert.equal(css(result)['--visual-page-product-field-radius-mobile'],'3px');
    assert.equal(css(result)['--visual-page-product-panel-border-desktop'],`1px solid ${result.global.colors.border}`);
  }
});
test('stage 3 examples require the embedded editor and preserve public confirmation guards', () => {
  const {isStorefrontEditorPreview}=load('src/features/storefront/visual/pages.ts');
  assert.equal(isStorefrontEditorPreview(false,'/emprendedor/diseno/editor'),false);
  assert.equal(isStorefrontEditorPreview(true,'/plantilla/1'),false);
  assert.equal(isStorefrontEditorPreview(true,'/emprendedor/diseno/editor'),true);
  const source=fs.readFileSync(path.join(root,'src/features/storefront/pages/OrderConfirmation.tsx'),'utf8');
  assert(source.includes('if (!state?.orderNumber)')); assert(source.includes('editorPreview')); assert(source.includes('Ver mi pedido')); assert(source.includes('Seguir comprando'));
});
test('stage 3 Velta filter consumers support the existing layout and category contract', () => {
  const source=fs.readFileSync(path.join(root,'src/features/storefront/pages/Catalog.tsx'),'utf8').split('if (isVisual)')[1].split('PLANTILLAS 1 Y 2')[0];
  for(const marker of ['catalogLayout','catalogFilters','catalogResults','categoryList','categoryItem']) assert(source.includes(`data-visual-part="${marker}"`));
  assert.equal(resolver.resolveVisualConfig({template:'visual'}).catalog.filtersPosition,'drawer');
  assert.equal(css(resolver.resolveVisualConfig({template:'visual',customization:{catalog:{filtersPosition:'left'}}}))['--visual-catalog-layout-desktop'],'row');
});
const raw = { name: 'Contenido de negocio', visualConfig: { hero: { gap: 7 }, footer: { background: '#123456' } }, themeEditor: { editorial: { visualConfig: { heroCta: { radius: 50 }, productCard: { radius: 9 }, footer: { gap: 13 } }, images: { 'image-0': { src: 'data:image/png;base64,abc', x: 0, y: 50, scale: 100, radius: 0 } } }, minimal: { visualConfig: { hero: { height: 444 } } } } };
seed(raw); const config = adminRepository.load(identityA), initial = model.createEditorDocument(config, 'editorial', raw);
const effective = document => model.resolveEditorDocument(document, 'editorial');
test('section catalog has 17 unique typed IDs shared with storefront', () => { assert.equal(sections.VISUAL_SECTIONS.length, 17); assert.equal(new Set(sections.VISUAL_SECTIONS.map(v => v[0])).size, 17); assert(!sections.isVisualSection('__proto__')); });
for (const section of ['hero','heroCta','productCard']) test('closest marker selects ' + section, () => { const target = { closest: selector => selector === '[data-visual-section]' ? ({ getAttribute: name => section }) : null }; assert.equal(sections.sectionFromTarget(target), section); });
test('initial draft is clean and selecting does not mutate document', () => { const before = plain(initial); assert.equal(model.isEditorDirty(initial, initial), false); sections.sectionFromTarget({ closest: () => ({ getAttribute: () => 'hero' }) }); assert.deepEqual(plain(initial), before); });
test('hero alignment changes only its leaf and activates dirty', () => { const next = model.editProperty(initial, 'hero.horizontalAlign', 'center'); assert.equal(effective(next).hero.horizontalAlign, 'center'); assert.equal(effective(next).hero.gap, 7); assert(model.isEditorDirty(next, initial)); });
test('editing does not write to storage', () => { const before = [...storage]; model.editProperty(initial, 'hero.height', 900); assert.deepEqual([...storage], before); });
test('pill CTA derives radius 999px and center affects its consumer', () => { let next = model.editProperty(initial, 'heroCta.shape', 'pill'); next = model.editProperty(next, 'heroCta.align', 'center'); const vars = css(effective(next)); assert.equal(vars['--visual-cta-radius-desktop'], '999px'); assert.equal(vars['--visual-cta-align-desktop'], 'center'); });
test('CTA custom width is consumed and clamped by public CSS', () => { let next = model.editProperty(initial, 'heroCta.width', 'custom'); next = model.editProperty(next, 'heroCta.customWidth', 420); assert.equal(css(effective(next))['--visual-cta-width-desktop'], '420px'); const source = fs.readFileSync(path.join(root, 'src/styles/visual-config.css'), 'utf8'); assert(source.includes('width: var(--visual-cta-width); max-width: 100%')); });
test('CTA invalid custom widths do not produce invalid CSS', () => { for (const value of [-1, Infinity, NaN, '500px']) { const resolved = resolver.resolveVisualConfig({ customization: { heroCta: { width: 'custom', customWidth: value } } }); assert.equal(resolved.heroCta.customWidth, 320); } });
test('CTA variants and shapes have distinct public values', () => { for (const [shape, value] of [['square','0px'],['rounded','50px'],['pill','999px']]) assert.equal(css(effective(model.editProperty(initial,'heroCta.shape',shape)))['--visual-cta-radius-desktop'],value); for (const variant of ['solid','outline','ghost']) { const vars = css(effective(model.editProperty(initial,'heroCta.variant',variant))); assert.equal(vars['--visual-cta-background-desktop'], variant === 'solid' ? effective(initial).global.colors.primary : 'transparent'); if(variant === 'ghost') assert.equal(vars['--visual-cta-border-desktop'],'0 solid transparent'); } });
test('product card compact and large sizes reach CSS', () => { for (const [density, factor] of [['compact','.85'],['normal','1'],['spacious','1.15']]) assert.equal(css(effective(model.editProperty(initial,'productCard.density',density)))['--visual-card-density-desktop'],factor); });
test('product card radius, alignment and button radius are independent', () => { let next = model.editProperty(initial,'productCard.radius',33); next = model.editProperty(next,'productCard.buttonRadius',7); next = model.editProperty(next,'productCard.align','right'); const vars = css(effective(next)); assert.equal(vars['--visual-card-radius-desktop'],'33px'); assert.equal(vars['--visual-card-button-radius-desktop'],'7px'); assert.equal(vars['--visual-card-align-desktop'],'right'); });
test('category style and footer background reach consumer variables', () => { const categories = css(effective(model.editProperty(initial,'categories.presentation','pills'))); assert.equal(categories['--visual-categories-radius-desktop'],'999px'); const footer = css(effective(model.editProperty(initial,'footer.background','#abcdef'))); assert.equal(footer['--visual-footer-background-desktop'],'#abcdef'); });
test('sticky header has both sticky and relative states', () => { assert.equal(css(effective(model.editProperty(initial,'header.sticky',true)))['--visual-header-position-desktop'],'sticky'); assert.equal(css(effective(model.editProperty(initial,'header.sticky',false)))['--visual-header-position-desktop'],'relative'); });
test('topbar false, zero height and font size reach public CSS', () => { let next=model.editProperty(initial,'topBar.visible',false); next=model.editProperty(next,'topBar.height',0); next=model.editProperty(next,'topBar.fontSize',17); const vars=css(effective(next)); assert.equal(vars['--visual-topbar-display-desktop'],'none'); assert.equal(vars['--visual-topbar-height-desktop'],'0px'); assert.equal(vars['--visual-topbar-font-size-desktop'],'17px'); });
test('product grids retain separate desktop/tablet/mobile columns', () => { let next=initial; for(const [view,columns] of [['desktop',5],['tablet',3],['mobile',2]]) next=model.editProperty(next,'productGrid.columns.'+view,columns); const vars=css(effective(next)); for(const [view,columns] of [['desktop',5],['tablet',3],['mobile',2]]) assert.equal(vars['--visual-grid-columns-'+view],String(columns)); });
test('responsive edits remain partial and affect the selected breakpoint', () => { const next=model.editProperty(initial,'responsive.mobile.hero.horizontalAlign','right'); const resolved=effective(next); assert.equal(resolver.resolveVisualViewport(resolved,'desktop').hero.horizontalAlign,'left'); assert.equal(resolver.resolveVisualViewport(resolved,'mobile').hero.horizontalAlign,'right'); assert.deepEqual(plain(next.overrides.responsive),{mobile:{hero:{horizontalAlign:'right'}}}); });
test('reset property eliminates override and follows future preset changes', () => { const next=model.resetProperty(initial,'heroCta.radius'); assert.equal(next.overrides.heroCta,undefined); const preset=VISUAL_PRESETS.editorial.config.heroCta.radius; try { VISUAL_PRESETS.editorial.config.heroCta.radius=24; assert.equal(effective(next).heroCta.radius,24); } finally { VISUAL_PRESETS.editorial.config.heroCta.radius=preset; } assert.equal(next.overrides.productCard.radius,9); });
test('reset section removes only its common/template/responsive branches', () => { let next=model.editProperty(initial,'responsive.mobile.heroCta.radius',99); next=model.resetSection(next,'heroCta'); assert.equal(next.overrides.heroCta,undefined); assert.equal(next.overrides.responsive,undefined); assert.equal(next.overrides.productCard.radius,9); assert.equal(next.overrides.footer.gap,13); assert.equal(next.storeOverrides.hero.gap,7); });
test('restore preset keeps content, images and other template overrides', () => { const next=model.restorePreset(initial), published=model.publishEditorDocument(config,'editorial',next); assert.deepEqual(plain(next.overrides),{}); assert.deepEqual(plain(next.storeOverrides),{}); assert.equal(published.name,config.name); assert.deepEqual(plain(published.themeEditor.editorial.images),plain(initial.images)); assert.equal(published.themeEditor.minimal.visualConfig.hero.height,444); });
test('discard returns exactly to saved document including images', () => { const baseline=structuredClone(initial); const changed=model.editProperty(baseline,'footer.paddingTop',0); assert(model.isEditorDirty(changed,baseline)); const discarded=baseline; assert(!model.isEditorDirty(discarded,baseline)); assert.deepEqual(plain(discarded.images),plain(initial.images)); });
test('save reloads overrides and leaves another store untouched', () => { seed({name:'Otra tienda',visualConfig:{hero:{height:888}}},identityB); const b=localStorage.getItem(storageApi.getStoreConfigKey(identityB)); const draft=model.editProperty(initial,'heroCta.customWidth',475); adminRepository.save(model.publishEditorDocument(config,'editorial',draft),identityA); const loaded=adminRepository.load(identityA), document=model.createEditorDocument(loaded,'editorial',storageApi.readStoredStoreConfig(identityA)); assert.equal(effective(document).heroCta.customWidth,475); assert.equal(localStorage.getItem(storageApi.getStoreConfigKey(identityB)),b); assert.equal(storageApi.readStoredStoreConfig(identityA).themeEditor.editorial.visualConfig.heroCta.paddingX,undefined); });
test('legacy color reset is not re-persisted as effective preset color', () => { seed({primaryColor:'#123456',themeEditor:{editorial:{primaryColor:'#654321'}}}); const config=adminRepository.load(identityA), base=model.createEditorDocument(config,'editorial',storageApi.readStoredStoreConfig(identityA)); const next=model.resetProperty(base,'global.colors.primary'); adminRepository.save(model.publishEditorDocument(config,'editorial',next),identityA); const saved=storageApi.readStoredStoreConfig(identityA); assert.equal(saved.primaryColor,undefined); assert.equal(saved.themeEditor?.editorial?.primaryColor,undefined); assert.equal(saved.themeEditor?.editorial?.visualConfig?.global?.colors?.primary,undefined); });
test('zero and false persist through publication and reload', () => { seed({}); let draft=model.createEditorDocument(adminRepository.load(identityA),'editorial',{}); draft=model.editProperty(draft,'heroCta.paddingX',0); draft=model.editProperty(draft,'productCard.buttonVisible',false); adminRepository.save(model.publishEditorDocument(adminRepository.load(identityA),'editorial',draft),identityA); const resolved=resolver.resolveStoreVisualConfig(storageApi.readStoredStoreConfig(identityA),'editorial'); assert.equal(resolved.heroCta.paddingX,0); assert.equal(resolved.productCard.buttonVisible,false); });
test('all inspector property paths exist in the resolver schema', () => { const {INSPECTOR_GROUPS}=load('src/features/admin/visualEditor/inspector.tsx'); const resolved=resolver.resolveVisualConfig(); for(const groups of Object.values(INSPECTOR_GROUPS)) for(const group of groups) for(const field of group.fields) assert.notEqual(model.readPath(resolved,field.path),undefined,field.path); });
test('all emitted variables have responsive aliases and public consumers', () => { const source=fs.readFileSync(path.join(root,'src/styles/visual-config.css'),'utf8'); const vars=css(resolver.resolveVisualConfig()); for(const key of Object.keys(vars)) { const base=key.replace(/-(desktop|tablet|mobile)$/,''); assert(source.includes(`${base}: var(${key})`),key); if(base.startsWith("--visual")) assert(source.includes(`var(${base})`),base); } });
test('selection listeners prevent navigation only while connected and clean up', () => {
  const {connectVisualPreview}=load('src/features/admin/visualEditor/preview.ts'), handlers=new Map(), styles=[], elements=[]; let callback, disconnected=0, selected;
  const element={dataset:{visualSection:'heroCta'},removeAttribute(){},scrollIntoView(){},getAttribute(){return 'heroCta';}}; elements.push(element);
  const doc={body:{},head:{appendChild:e=>styles.push(e)},createElement:()=>({remove(){}}),querySelectorAll:selector=>selector==='img'?[]:elements,querySelector:()=>element,addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:(type,fn)=>{assert.equal(handlers.get(type),fn);handlers.delete(type);},defaultView:{MutationObserver:class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected++;}}}};
  const connection=connectVisualPreview(doc,value=>selected=value,()=>{});connection.update(resolver.resolveVisualConfig(),{});
  let prevented=0,stopped=0;handlers.get('click')({target:{closest:selector=>selector==='[data-visual-section]'?element:null},preventDefault(){prevented++;},stopPropagation(){},stopImmediatePropagation(){stopped++;}});
  assert.equal(selected,'heroCta');assert.equal(prevented,1);assert.equal(stopped,1);callback();assert.equal(styles.length,2);connection.disconnect();assert.equal(handlers.size,0);assert.equal(disconnected,1);
});
test('ThemeEditor save failure keeps dirty and success clears it; discard restores preview', () => {
  seed({}); let config=adminRepository.load(identityA), ok=false, index=0, refIndex=0; const slots=[],refs=[]; let blockerCallback;
  const react={useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=refIndex++;if(!(i in refs))refs[i]={current:initial};return refs[i];},useMemo:fn=>fn(),useEffect(){}};
  const jsx=(type,props)=>({type,props}), mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-router-dom':{Link:'Link',useSearchParams:()=>[new URLSearchParams('plantilla=editorial')],useBlocker:fn=>{blockerCallback=fn;return {state:'unblocked'};}},'../context/AdminContext':{useAdmin:()=>({config,setConfig:next=>{if(ok){adminRepository.save(next,identityA);config=adminRepository.load(identityA);}return ok;},storageError:''})},'../../storefront/context/StoreIdentityContext':{useStoreIdentity:()=>({identity:identityA})}};
  const Editor=load('src/features/admin/pages/ThemeEditor.tsx',mocks).default;
  function flatten(node,list=[]){if(Array.isArray(node))node.forEach(n=>flatten(n,list));else if(node&&typeof node==='object'){list.push(node);flatten(node.props?.children,list);}return list;}
  const render=()=>{index=0;refIndex=0;return flatten(Editor());};
  let tree=render();let inspector=tree.find(n=>typeof n.type==='function'&&n.type.name==='VisualInspector');inspector.props.onEdit('hero.horizontalAlign','center');tree=render();assert(tree.some(n=>n.props?.children==='Cambios sin guardar'));
  const save=()=>tree.find(n=>n.type==='button'&&n.props.children==='Guardar cambios').props.onClick();save();tree=render();assert(tree.some(n=>n.props?.children==='No se pudo guardar')); assert(blockerCallback({currentLocation:{pathname:'/editor',search:''},nextLocation:{pathname:'/other',search:''}}));ok=true;save();tree=render();assert(tree.some(n=>n.props?.children==='✓ Guardado'));
  inspector=tree.find(n=>typeof n.type==='function'&&n.type.name==='VisualInspector');inspector.props.onEdit('hero.horizontalAlign','right');tree=render();assert(blockerCallback({currentLocation:{pathname:'/editor',search:''},nextLocation:{pathname:'/other',search:''}}));tree.find(n=>n.type==='button'&&n.props.children==='Descartar cambios').props.onClick();tree=render();inspector=tree.find(n=>typeof n.type==='function'&&n.type.name==='VisualInspector');assert.equal(inspector.props.effective.hero.horizontalAlign,'center');assert(!tree.some(n=>n.props?.children==='Cambios sin guardar'));
});
test('catalog card and grid selection edit and reset catalog branches only', () => {
  const {getInspectorGroups}=load('src/features/admin/visualEditor/inspector.tsx');
  for(const [section, branch] of [['productCard','catalog.card'],['productGrid','catalog.grid']]) {
    assert.equal(model.sectionOverridePath(section,true),branch);
    for(const group of getInspectorGroups(section,true)) for(const field of group.fields) assert(field.path.startsWith(branch+'.'),field.path);
    let next=model.editProperty(initial,'catalog.card.radius',42); next=model.editProperty(next,'catalog.grid.gap',25);
    next=model.editProperty(next,'responsive.mobile.'+branch+'.gap',10);
    const reset=model.resetSection(next,branch); assert.equal(model.readPath(reset.overrides,branch),undefined);
    assert.equal(reset.overrides.productCard.radius,9); assert.equal(reset.overrides.footer.gap,13);
  }
});
test('legacy image restoration uses the original before saved customizations', () => {
  const {captureOriginalImage}=load('src/features/storefront/visual/imageSettings.ts');
  const img={dataset:{},style:{objectPosition:'',transform:'',transformOrigin:'',borderRadius:''},src:'original.png',getAttribute(key){return key === 'src' ? this.src : null;},setAttribute(k,v){if(k === 'src')this.src=v;},removeAttribute(key){if(key === 'src')this.src=null;},hasAttribute(){return false;},closest(){return null;}};
  captureOriginalImage(img); img.src='published.png'; img.style.borderRadius='15px';
  const {connectVisualPreview}=load('src/features/admin/visualEditor/preview.ts');
  const doc={body:{},head:{appendChild(){}},createElement:()=>({remove(){}}),querySelectorAll:selector=>selector==='img'?[img]:[],addEventListener(){},removeEventListener(){},defaultView:{}};
  const connection=connectVisualPreview(doc,()=>{},()=>{}), saved={'image-0':{src:'published.png',x:50,y:50,scale:100,radius:15}};
  connection.update(resolver.resolveVisualConfig(),saved); connection.update(resolver.resolveVisualConfig(),{});
  assert.equal(img.src,'original.png'); assert.equal(img.style.borderRadius,'');
  connection.update(resolver.resolveVisualConfig(),saved); assert.equal(img.src,'published.png');
  connection.disconnect(); assert.equal(img.src,'original.png');
});
test('business images remain owned by landing and product editors', () => {
  const {isLegacyEditableImage}=load('src/features/storefront/visual/imageSettings.ts');
  assert(!isLegacyEditableImage({hasAttribute:()=>true,closest:()=>null}));
  assert(!isLegacyEditableImage({hasAttribute:()=>false,closest:()=>({})}));
  assert(isLegacyEditableImage({hasAttribute:()=>false,closest:()=>null}));
});
test('legacy palettes edit three sparse color leaves and reset removes them', () => {
  const {EDITOR_PALETTES}=load('src/features/admin/visualEditor/palettes.tsx');
  for(const palette of EDITOR_PALETTES) { let draft=initial; for(const key of ['primary','secondary','accent']) draft=model.editProperty(draft,'global.colors.'+key,palette[key]); assert.deepEqual(plain(draft.overrides.global.colors),{primary:palette.primary,secondary:palette.secondary,accent:palette.accent}); for(const key of ['primary','secondary','accent']) draft=model.resetProperty(draft,'global.colors.'+key); assert.equal(draft.overrides.global,undefined); }
});
test('additive section padding preserves the original benefits spacing', () => {
  const resolved=resolver.resolveVisualConfig(); assert.equal(resolved.sections.benefits.paddingTop,16); assert.equal(resolved.sections.benefits.paddingBottom,16);
  const legacy=resolver.resolveVisualConfig({customization:{sections:{benefits:{paddingY:7}}}}); assert.equal(legacy.sections.benefits.paddingTop,7); assert.equal(legacy.sections.benefits.paddingBottom,7);
});
const banner=load('src/features/admin/visualEditor/banner.tsx');
const children=node=>[node,...(Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children]).flat().filter(v=>v&&typeof v==='object').flatMap(children)];
for(const size of ['small','medium','large']) test('banner '+size+' writes responsive heights and persists only overrides',()=>{
  let draft=initial;
  const control=banner.BannerSizeControl({config:effective(draft),viewport:'desktop',onEdit:(path,value)=>{draft=model.editProperty(draft,path,value)},onReset:()=>{}});
  children(control).find(v=>v.type==='select').props.onChange({target:{value:size}});
  for(const view of ['desktop','tablet','mobile']) { assert.equal(resolver.resolveVisualViewport(effective(draft),view).hero.height,banner.BANNER_SIZES[size][view]); assert.equal(banner.bannerSizeFor(effective(draft),view),size); }
  seed(model.publishEditorDocument(config,'editorial',draft));
  const saved=storageApi.readStoredStoreConfig(identityA);
  assert.equal(saved.themeEditor.editorial.visualConfig.hero.height,banner.BANNER_SIZES[size].desktop);
  assert.equal(saved.themeEditor.editorial.visualConfig.hero.titleSize,undefined);
  assert.equal(resolver.resolveVisualViewport(resolver.resolveStoreVisualConfig(saved,'editorial'),'mobile').hero.height,banner.BANNER_SIZES[size].mobile);
});
test('custom legacy banner height remains readable and reset restores all sizes',()=>{
  let draft=model.editProperty(initial,'hero.height',455); draft=model.editProperty(draft,'responsive.mobile.hero.height',290);
  assert.equal(banner.bannerSizeFor(effective(draft),'desktop'),'custom');
  const control=banner.BannerSizeControl({config:effective(draft),viewport:'mobile',onEdit:()=>{},onReset:path=>{draft=model.resetProperty(draft,path)}});
  children(control).find(v=>v.type==='button').props.onClick();
  assert.equal(draft.overrides.hero?.height,undefined); assert.equal(draft.overrides.responsive,undefined);
});
test('image framing validates all positions and feeds responsive public CSS',()=>{
  for(const position of ['top','center','bottom']) { const value=resolver.resolveVisualConfig({customization:{responsive:{mobile:{hero:{imagePosition:position}}}}}); assert.equal(css(value)['--visual-hero-image-position-mobile'],position); }
  assert.equal(resolver.resolveVisualConfig({customization:{hero:{imagePosition:'unsafe'}}}).hero.imagePosition,'center');
});
test('institutional false is rejected in every cascade and breakpoint for all presets',()=>{
  for(const template of Object.keys(VISUAL_PRESETS)) {
    const value=resolver.resolveVisualConfig({template,customization:{footer:{brandingVisible:false}},templateCustomization:{footer:{brandingVisible:false},responsive:{tablet:{footer:{brandingVisible:false}},mobile:{footer:{brandingVisible:false}}}}});
    for(const view of ['desktop','tablet','mobile']) { assert.equal(resolver.resolveVisualViewport(value,view).footer.brandingVisible,true); assert.equal(css(value)['--visual-footer-branding-'+view],'block'); }
  }
});
test('footer reset and preset restoration retain mandatory branding',()=>{
  const unsafe=model.editProperty(initial,'footer.brandingVisible',false);
  for(const draft of [unsafe,model.resetSection(unsafe,'footer'),model.restorePreset(unsafe)]) assert.equal(effective(draft).footer.brandingVisible,true);
});
test('inspector offers no institutional disabling or topbar hiding field',()=>{
  const {INSPECTOR_GROUPS}=load('src/features/admin/visualEditor/inspector.tsx');
  const fields=Object.values(INSPECTOR_GROUPS).flatMap(groups=>groups.flatMap(group=>group.fields));
  assert(!fields.some(field=>field.path==='footer.brandingVisible'||field.path==='topBar.visible'));
});
test('institutional logo is excluded from legacy image mutation',()=>{
  const {isLegacyEditableImage}=load('src/features/storefront/visual/imageSettings.ts');
  assert.equal(isLegacyEditableImage({hasAttribute:()=>false,closest:selector=>selector.includes('[data-institutional-branding]')?{}:null}),false);
});
test('public layouts share the protected fixed university logo and reference',()=>{
  const ui=fs.readFileSync(path.join(root,'src/features/storefront/components/ui/index.tsx'),'utf8');
  assert(ui.includes('data-institutional-branding')); assert(ui.includes('src="/logo-universidad-autonoma.png"')); assert(ui.includes('<span>Universidad Autónoma de Chile</span>'));
  for(const file of ['EditorialLayout.tsx','minimal/MinimalFooter.tsx','visual/VisualFooter.tsx','catalog/CatalogFooter.tsx']) assert(fs.readFileSync(path.join(root,'src/features/storefront/components/store',file),'utf8').includes('<InstitutionalBadge'));
  const source=fs.readFileSync(path.join(root,'src/styles/visual-config.css'),'utf8'); assert(source.includes('min-width: 32px')); assert(source.includes('[data-institutional-bar] { display: flex;'));
});
test('category navigation lives in the existing landing category section',()=>{
  const header=fs.readFileSync(path.join(root,'src/features/storefront/components/store/EditorialLayout.tsx'),'utf8');
  assert(!header.includes('categories.map'));
  const landing=fs.readFileSync(path.join(root,'src/features/storefront/pages/EditorialHome.tsx'),'utf8');
  assert(landing.includes('VISUAL_SECTION.categories')); assert(landing.includes('catalogo?cat=${encodeURIComponent(cat)}'));
  const soft=fs.readFileSync(path.join(root,'src/features/storefront/pages/MinimalHome.tsx'),'utf8');
  assert(soft.indexOf('</section>')<soft.indexOf('VISUAL_SECTION.categories'),'Soft categories must not impose the banner height');
});
test('main editor section names are friendly without changing shared IDs',()=>{
  const labels=Object.fromEntries(sections.VISUAL_SECTIONS);
  for(const [id,label] of Object.entries({hero:'Banner principal',heroCta:'Botón principal',header:'Encabezado',productGrid:'Distribución de productos',productCard:'Tarjeta de producto',footer:'Pie de página'})) assert.equal(labels[id],label);
});
test('help opens on hover, focus and click and closes with Escape and blur',()=>{
  let state=[],cursor=0;
  const react={useId:()=> 'help-test',useState:initial=>{const index=cursor++; if(!(index in state)) state[index]=initial; return [state[index],value=>{state[index]=value}];}};
  const {FieldHelp,SECTION_HELP}=load('src/features/admin/visualEditor/help.tsx',{'react':react});
  const render=()=>{cursor=0;return FieldHelp({label:'Banner',children:'Ayuda clara'})};
  let tree=render(); assert.equal(tree.props.children[1].props.hidden,true);
  tree.props.onMouseEnter(); tree=render(); assert.equal(tree.props.children[1].props.hidden,false);
  tree.props.onMouseLeave(); tree=render(); assert.equal(tree.props.children[1].props.hidden,true);
  tree.props.children[0].props.onFocus(); tree=render(); assert.equal(tree.props.children[0].props['aria-describedby'],'help-test');
  tree.props.children[0].props.onClick(); tree=render(); assert.equal(tree.props.children[1].props.role,'tooltip');
  tree.props.children[0].props.onKeyDown({key:'Escape'}); tree=render(); assert.equal(tree.props.children[1].props.hidden,true);
  tree.props.children[0].props.onBlur(); tree=render(); assert.equal(tree.props.children[0].props['aria-expanded'],false);
  for(const id of ['hero','heroCta','categories','productGrid','productCard','footer']) assert(SECTION_HELP[id]);
});
test('palettes coordinate bars and footer while allowing subsequent individual edits',()=>{
  const {EDITOR_PALETTES,paletteEdits,PALETTE_PATHS}=load('src/features/admin/visualEditor/palettes.tsx');
  for(const palette of EDITOR_PALETTES) { let draft=initial; for(const [path,value] of Object.entries(paletteEdits(palette))) draft=model.editProperty(draft,path,value);
    assert.equal(effective(draft).topBar.background,palette.primary); assert.equal(effective(draft).footer.background,palette.primary);
    draft=model.editProperty(draft,'footer.background','#234567'); assert.equal(effective(draft).topBar.background,palette.primary); assert.equal(effective(draft).footer.background,'#234567');
    for(const path of PALETTE_PATHS) draft=model.resetProperty(draft,path); assert.equal(draft.overrides.topBar,undefined); assert.equal(draft.overrides.footer?.background,undefined);
  }
});
test('every named font is validated and reaches body and title CSS',()=>{
  const {FONT_FAMILIES}=load('src/features/storefront/visual/types.ts'); assert(FONT_FAMILIES.length>=15);
  for(const family of FONT_FAMILIES) { const value=resolver.resolveVisualConfig({customization:{global:{typography:{body:family,heading:family}}}}); const vars=css(value); assert.equal(value.global.typography.body,family); assert.equal(typeof vars['--visual-body-font-desktop'],'string'); assert.equal(vars['--visual-heading-font-desktop'],vars['--visual-body-font-desktop']); }
  assert.equal(resolver.resolveVisualConfig({customization:{global:{typography:{body:'url(unsafe)'}}}}).global.typography.body,'sans');
});
test('public route scopes match every configurable page and preserve product identifiers',()=>{
  const {STORE_PAGES,pageFromPath,previewPath}=load('src/features/storefront/visual/pages.ts');
  for(const page of STORE_PAGES) assert.equal(pageFromPath('/plantilla/4/'+page.path),page.id);
  assert.equal(pageFromPath('/plantilla/1'),null); assert.equal(pageFromPath('/plantilla/2/producto/polera'),'product');
  assert.equal(previewPath('product','id con espacios'),'producto/id%20con%20espacios'); assert.equal(previewPath('login','',true),'ingresar?modo=registro');
});
test('page inspector paths exist for every page and reset only the selected group',()=>{
  const {STORE_PAGES}=load('src/features/storefront/visual/pages.ts'),{getInspectorGroups}=load('src/features/admin/visualEditor/inspector.tsx');
  for(const {id} of STORE_PAGES) for(const section of ['pageLayout','pagePanel','pageField','pageButton']) {
    for(const group of getInspectorGroups(section,false,id)) for(const field of group.fields) { assert(field.path.startsWith('pages.'+id+'.')); assert.notEqual(model.readPath(effective(initial),field.path),undefined); }
  }
  let draft=model.editProperty(initial,'pages.login.field.radius',21); draft=model.editProperty(draft,'pages.cart.field.radius',13); draft=model.editProperty(draft,'responsive.mobile.pages.login.field.radius',15);
  draft=model.resetSection(draft,model.sectionOverridePath('pageField',false,'login'));
  assert.equal(draft.overrides.pages.login,undefined); assert.equal(draft.overrides.pages.cart.field.radius,13); assert.equal(draft.overrides.responsive,undefined);
});
test('page drafts persist sparsely without affecting checkout data or another page',()=>{
  const original={...config,name:'Contenido intacto'}; let draft=model.editProperty(initial,'pages.checkout.button.radius',29); draft=model.editProperty(draft,'responsive.mobile.pages.checkout.layout.padding',0);
  const published=model.publishEditorDocument(original,'editorial',draft); seed(published); const raw=storageApi.readStoredStoreConfig(identityA),resolved=resolver.resolveStoreVisualConfig(raw,'editorial');
  assert.equal(resolved.pages.checkout.button.radius,29); assert.equal(resolved.pages.login.button.radius,8); assert.equal(resolver.resolveVisualViewport(resolved,'mobile').pages.checkout.layout.padding,0);
  assert.equal(raw.themeEditor.editorial.visualConfig.pages.login,undefined); assert.equal(raw.themeEditor.editorial.visualConfig.pages.checkout.button.background,undefined); assert.equal(raw.name,'Contenido intacto');
});
test('checkout step selection works only inside the embedded design editor',()=>{
  const {checkoutPreviewStep,CHECKOUT_PREVIEW_STEPS}=load('src/features/storefront/visual/pages.ts');
  for(const step of CHECKOUT_PREVIEW_STEPS) { assert.equal(checkoutPreviewStep('?visualStep='+step,true,'/emprendedor/diseno/editor'),step); assert.equal(checkoutPreviewStep('?visualStep='+step,false,'/emprendedor/diseno/editor'),'contact'); assert.equal(checkoutPreviewStep('?visualStep='+step,true,'/plantilla/1'),'contact'); }
  assert.equal(checkoutPreviewStep('?visualStep=__proto__',true,'/emprendedor/diseno/editor'),'contact');
});
test('landing actions keep selecting their product section instead of unrelated page controls',()=>{
  const parent={getAttribute:()=> 'productCard'},button={getAttribute:()=> 'pageButton',parentElement:{closest:()=>parent}};
  assert.equal(sections.sectionFromTarget({closest:selector=>selector==='[data-visual-page]'?null:button}),'productCard');
  assert.equal(sections.sectionFromTarget({closest:selector=>selector==='[data-visual-page]'?{}:selector==='[data-visual-section]'?button:null}),'pageButton');
});
console.log(`\n${count} visual editor tests passed.`);
