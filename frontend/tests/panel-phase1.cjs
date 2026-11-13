const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./source-loader.cjs');
const jsx=(type,props)=>({type,props});
const ui=Object.fromEntries(['AdminCard','Alert','Badge','Button','Icon','Input','Textarea','Select','Toggle','Tabs','Modal'].map(name=>[name,name]));
function flat(node,all=[]){if(Array.isArray(node))node.forEach(n=>flat(n,all));else if(node&&typeof node==='object'){all.push(node);flat(node.props?.children,all);flat(node.props?.action,all)}return all}
function text(node){return Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'')}
function harness(file,mocks={},globals={}){
 let cursor=0;const states=[],effects=[];
 const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>states[index]=typeof value==='function'?value(states[index]):value]},useRef(initial){const index=cursor++;return states[index]??=( {current:initial})},useMemo:fn=>fn(),useEffect(fn){const index=cursor++;if(!(index in states)){states[index]=true;effects.push(fn)}}};
 const exports=load(file,{react,'react/jsx-runtime':{jsx,jsxs:jsx},'../components/ui':ui,'./ui':ui,'../../../shared/components/states':{EmptyListState:'EmptyListState',LoadingState:'LoadingState'},...mocks},globals);
 return{exports,render(fn=exports.default,props){cursor=0;return flat(fn(props))},async flush(){effects.splice(0).forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve))}};
}
const button=(tree,label)=>{const found=tree.find(n=>n.type==='Button'&&text(n)===label);assert(found,label);return found};

test('Productos: publicación antes de archivados, fecha descendente, stock independiente y búsqueda combinable',async()=>{
 const rows=[{id:'old-active',status:'active',createdAt:'2026-01-01',name:'Camisa',category:'Ropa'},{id:'new-archived',status:'archived',createdAt:'2026-11-09',name:'Bolso',category:'Accesorios'},{id:'new-active',status:'active',createdAt:'2026-11-08',name:'Polera',category:'Ropa'}].map(p=>({...p,tags:['algodón'],variants:[{id:p.id,sku:p.id,attributes:{},stock:0,price:100}],images:[],basePrice:100}));
 const h=harness('src/features/admin/pages/Products.tsx',{'../../../shared/services/imageUpload':{},'../services/productService':{fetchAdminProducts:async()=>rows},'react-router-dom':{Link:'Link',useLocation:()=>({state:null}),useNavigate:()=>()=>{}},'../data/mockAdminData':{formatPrice:String}});
 h.render(h.exports.ProductList);await h.flush();let tree=h.render(h.exports.ProductList);
 const ids=()=>tree.filter(n=>n.type==='tr'&&n.props.children?.some?.(c=>c?.type==='td')).map(n=>text(n.props.children[0]).split(' ')[0]);
 assert.deepEqual(ids(),['PoleraRopa1','CamisaRopa1','BolsoAccesorios1']);
 tree.find(n=>n.type==='Select'&&n.props.label==='Estado').props.onChange({target:{value:'archived'}});tree=h.render(h.exports.ProductList);assert.equal(tree.filter(n=>n.type==='article').length,1);assert(text(tree).includes('Bolso'));
 tree.find(n=>n.type==='Input'&&n.props.id==='catalog-search').props.onChange({target:{value:'Ropa'}});tree=h.render(h.exports.ProductList);assert.equal(tree.filter(n=>n.type==='article').length,0);
 button(tree,'Limpiar filtros').props.onClick();tree=h.render(h.exports.ProductList);assert.equal(tree.filter(n=>n.type==='article').length,3);
 tree.find(n=>n.type==='Select'&&n.props.label==='Orden').props.onChange({target:{value:'recent'}});tree=h.render(h.exports.ProductList);assert.equal(ids()[0],'BolsoAccesorios1');
});

test('Pedidos: plegar conserva filtros, consulta y fechas; exportación sigue disponible',()=>{
 let applied,exported=0;
 const h=harness('src/features/admin/components/OrderFilters.tsx');
 const props={params:new URLSearchParams('q=camisa&metodo_pago=Transferencia&pago=pendiente&entrega=retiro&fecha_desde=2026-01-02&fecha_hasta=2026-01-09'),onChange:value=>applied=value,onClear(){},onExport:()=>exported++,exportBusy:false,exportDisabled:false};
 let tree=h.render(h.exports.OrderFilters,props);tree.find(n=>n.type==='details').props.onToggle({currentTarget:{open:false}});tree=h.render(h.exports.OrderFilters,props);
 assert.equal(tree.find(n=>n.type==='details').props.open,false);button(tree,'Aplicar filtros').props;tree.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(applied.metodo_pago,'Transferencia');assert.equal(applied.pago,'pendiente');assert.equal(applied.q,'camisa');assert.equal(applied.fecha_desde,'2026-01-02');assert.equal(applied.entrega,'retiro');
 button(tree,'Exportar pedidos Excel').props.onClick();assert.equal(exported,1);
});

test('Promociones: vigencias incluyen el día de Chile y respetan instante, habilitación y usos',()=>{
 const h=harness('src/features/admin/pages/Promotions.tsx',{'../context/AdminContext':{},'../services/promotionService':{},'../data/mockAdminData':{}});
 const state=h.exports.promotionState,now=new Date('2026-11-10T01:00:00Z'),base={active:true,usedCount:0};
 assert.equal(state({...base,endsAt:'2026-11-09'},now),'active');assert.equal(state({...base,startsAt:'2026-11-10'},now),'scheduled');assert.equal(state({...base,endsAt:'2026-11-08'},now),'ended');assert.equal(state({...base,endsAt:'2026-11-10T00:59:59Z'},now),'ended');assert.equal(state({...base,active:false},now),'inactive');assert.equal(state({...base,maxUses:2,usedCount:2},now),'exhausted');
});

test('SEO: cargar y aceptar sugerencias nunca reemplaza texto personalizado ni guarda automáticamente',async()=>{
 let saved;let resolveBusiness;
 const h=harness('src/features/admin/pages/SeoAnalytics.tsx',{'../context/AdminContext':{useAdmin:()=>({config:{metaTitle:'Título propio',metaDescription:''},setConfig:value=>{saved=value;return true}})},'../../storefront/services/storeInformationService':{fetchStoreInformation:()=>new Promise(resolve=>resolveBusiness=resolve)},'../components/GoogleAnalyticsField':{GoogleAnalyticsField:'GoogleAnalyticsField'},'../components/MetaPixelField':{MetaPixelField:'MetaPixelField'}});
 h.render();await h.flush();let tree=h.render();tree.find(n=>n.type==='Input'&&n.props.label==='Título de la tienda en buscadores').props.onChange({target:{value:'Escrito durante la carga'}});
 resolveBusiness({nombre:'Nombre del negocio',descripcion:'Descripción del negocio'});await h.flush();tree=h.render();assert.equal(saved,undefined);button(tree,'Usar sugerencias en campos vacíos').props.onClick();tree=h.render();assert.equal(tree.find(n=>n.type==='Input').props.value,'Escrito durante la carga');assert.equal(tree.find(n=>n.type==='Textarea').props.value,'Descripción del negocio');assert.equal(saved,undefined);
 tree.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(saved.metaTitle,'Escrito durante la carga');assert.equal(saved.metaDescription,'Descripción del negocio');
});

test('Diseño: entrada directa confirmada, cancelar no activa; guardar paletas no activa el preview',async()=>{
 let config={template:'editorial',themeEditor:{}},preview=null,writes=0;const opened=[];
 const colors={primary:'#123456'};
 const h=harness('src/features/admin/pages/Design.tsx',{'../../../shared/PaletteLibrary':{PaletteLibrary:'PaletteLibrary'},'../../../shared/palettes':{usePaletteLibrary:()=>({}),paletteOverrides:()=>({}),saveAppearance:async()=>{}},'../../storefront/visual/presets':{VISUAL_PRESETS:{}},'../../storefront/visual/defaults':{VISUAL_DEFAULTS:{global:{colors}}},'../../storefront/visual/resolveVisualConfig':{resolveStoreVisualConfig:()=>({global:{colors}})},'../context/AdminContext':{useAdmin:()=>({config,setConfig:value=>{config=value;writes++;return true},previewTemplate:preview,setPreviewTemplate:value=>preview=value})},'../components/AdminPageHeader':{AdminHelp:'AdminHelp'},'../auth/demoSession':{openAdminWindow:url=>opened.push(url)},'react-router-dom':{Link:'Link',useBlocker:()=>({state:'unblocked'})},'../data/themeCustomization':{loadThemeCustomization:()=>({}),clearEditorColorOverrides:()=>({}),patchThemeCustomization:(theme,patch)=>({...theme,...patch})}},{window:{addEventListener(){},removeEventListener(){}}});
 let tree=h.render();const cards=tree.filter(n=>n.type==='Button'&&text(n)==='Editar plantilla');assert.equal(cards.length,4);cards[1].props.onClick();tree=h.render();let modal=tree.find(n=>n.type==='Modal'&&n.props.title.startsWith('¿Quieres'));assert.equal(modal.props.open,true);assert.equal(writes,0);button(flat(modal),'Cancelar').props.onClick();tree=h.render();assert.equal(opened.length,0);
 tree.filter(n=>n.type==='Button'&&text(n)==='Editar plantilla')[1].props.onClick();tree=h.render();modal=tree.find(n=>n.type==='Modal'&&n.props.title.startsWith('¿Quieres'));button(flat(modal),'Ir al editor').props.onClick();assert.deepEqual(opened,['/emprendedor/diseno/editor?plantilla=minimal']);assert.equal(config.template,'editorial');
 tree=h.render();tree.find(n=>n.type==='button'&&text(n)==='Previsualizar').props.onClick();assert.equal(writes,0);preview='catalog';tree=h.render();assert.equal(button(tree,'Guardar cambios').props.disabled,true);
 tree.find(n=>n.type==='PaletteLibrary').props.onApply({id:'palette-qa',nombre:'Paleta QA',colores:colors});tree=h.render();button(tree,'Guardar cambios').props.onClick();await h.flush();assert.equal(config.template,'editorial');assert.equal(writes,1);tree=h.render();
 tree.find(n=>n.type==='button'&&text(n)==='Activar plantilla').props.onClick();tree=h.render();modal=tree.find(n=>n.type==='Modal'&&n.props.title==='Activar plantilla');assert.equal(modal.props.open,true);button(flat(modal),'Activar plantilla').props.onClick();await h.flush();assert.equal(config.template,'minimal');assert.equal(writes,2);
});
