const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(relative,mocks={},globals={}) {
  const file=path.resolve(root,relative),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=id=>{if(id in mocks)return mocks[id];if(!id.startsWith('.'))return require(id);const p=path.resolve(path.dirname(file),id);return load(['.ts','.tsx'].map(ext=>p+ext).find(fs.existsSync)||path.join(p,'index.ts'),mocks,globals);};
  vm.runInNewContext(code,{module,exports:module.exports,require:req,...globals});return module.exports;
}
let passed=0;function test(name,fn){fn();console.log('OK '+name);passed++;}
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
test('help defaults to visible and preference survives new providers, unavailable storage is safe',()=>{
  const storage=new Map();let state,index=0;
  const react={createContext:()=>({Provider:'provider'}),useState(initial){index++;if(state===undefined)state=typeof initial==='function'?initial():initial;return[state,next=>state=next];}};
  const globals={localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}};
  const api=load('src/features/admin/context/AdminHelpContext.tsx',{react},globals);
  const render=()=>api.AdminHelpProvider({children:'page'}).props.value;
  assert.equal(render().showHelp,true);render().toggleHelp();assert.equal(render().showHelp,false);assert.equal(storage.get(api.ADMIN_HELP_KEY),'false');state=undefined;assert.equal(render().showHelp,false);render().toggleHelp();assert.equal(render().showHelp,true);assert.equal(storage.get(api.ADMIN_HELP_KEY),'true');
  const blocked=load('src/features/admin/context/AdminHelpContext.tsx',{react},{localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});assert.equal(blocked.readAdminHelpPreference(),true);assert.doesNotThrow(()=>blocked.saveAdminHelpPreference(false));
});
test('headers and contextual explanations follow the same toggle, actions and title remain',()=>{
  let showHelp=true;const toggleHelp=()=>showHelp=!showHelp;
  const {AdminPageHeader,AdminHelp}=load('src/features/admin/components/AdminPageHeader.tsx',{'../context/AdminHelpContext':{useAdminHelp:()=>({showHelp,toggleHelp})}});
  const render=()=>renderToStaticMarkup(React.createElement(AdminPageHeader,{title:'Productos',description:'Organiza tus productos',action:React.createElement('button',null,'Agregar producto')}));
  let html=render();assert(html.includes('Ocultar ayudas'));assert(!html.includes('hidden=""'));assert(html.includes('aria-expanded="true"'));
  toggleHelp();html=render();assert(html.includes('hidden=""'));assert(html.includes('Mostrar ayudas'));assert(html.includes('Agregar producto'));assert(html.includes('Productos'));assert.equal(AdminHelp({children:'Explicación opcional'}),null);
  toggleHelp();assert(render().includes('aria-expanded="true"'));assert(AdminHelp({children:'Explicación opcional'}));
});
test('every main panel and nested product/legal route has a friendly description; visual editor is excluded',()=>{
  const {ADMIN_PAGE_HELP,getAdminPageHelp}=load('src/features/admin/config/pageHelp.ts');
  const {menuItems}=load('src/features/admin/config/navigation.ts');
  for(const item of menuItems) assert(getAdminPageHelp(item.path), item.path);
  for(const [route,help] of Object.entries(ADMIN_PAGE_HELP)){assert.equal(getAdminPageHelp(route).description,help.description);assert(!/backend|frontend|\bAPI\b|endpoint|JSON|token|base de datos/i.test(help.description));}
  assert.equal(getAdminPageHelp('/emprendedor/productos/nuevo').title,'Productos');assert.equal(getAdminPageHelp('/emprendedor/legal/privacidad').title,'Páginas legales');assert.equal(getAdminPageHelp('/emprendedor/diseno/editor'),undefined);
  assert.equal(ADMIN_PAGE_HELP['/emprendedor/landing'].description,'Administra la información del negocio, la página principal, el logo y los datos de contacto. Guarda los cambios de cada apartado.');
});
test('technical errors become human messages while actionable validation and session errors survive',()=>{
  const {humanizeAdminError}=load('src/features/admin/utils/humanizeError.ts');
  for(const error of ['Request failed 500','Invalid payload','resolver_tienda returned null','TypeError: Failed to fetch','El backend devolvió un ID inválido','{"password":["invalid"]}','<html>error</html>','No pudimos confirmar la tienda (500).'])assert.equal(humanizeAdminError(error),'No pudimos completar esta acción. Intenta nuevamente.');
  for(const error of ['Completa el correo de contacto.','Inicia sesión para consultar los pedidos.','El monto debe ser mayor que 500 pesos.'])assert.equal(humanizeAdminError(error),error);
});
test('critical alerts and confirmations do not depend on optional help visibility',()=>{
  const mocks={'../../../storefront/components/ui':{Alert:'StoreAlert'},'../../../storefront/components/ui/Icon':{Icon:'Icon'},'./AdminModal':{AdminModal:'Modal'}};
  const {Alert}=load('src/features/admin/components/ui/index.tsx',mocks);
  assert.equal(Alert({variant:'error',children:'Request failed 500'}).props.children,'No pudimos completar esta acción. Intenta nuevamente.');
  assert.equal(Alert({variant:'success',children:'Cambios guardados.'}).props.children,'Cambios guardados.');
  assert.equal(Alert({variant:'warning',children:'Los pagos todavía no están disponibles.'}).props.children,'Los pagos todavía no están disponibles.');
  const link=React.createElement('a',{key:'back',href:'/emprendedor/productos'},'Volver');const result=Alert({variant:'error',children:['Invalid payload',link]}).props.children;assert.equal(result[0],'No pudimos completar esta acción. Intenta nuevamente.');assert.equal(result[1],link);
  const code=fs.readFileSync(path.join(root,'src/features/admin/components/layout/AdminLayout.tsx'),'utf8');assert(code.includes('{storageError &&'));assert(!code.includes('showHelp &&'));assert(code.includes('<AdminHelpProvider><Layout /></AdminHelpProvider>'));
});
test('visible panel copy no longer promises backend operations and landing explains required and optional fields',()=>{
  const files=['LandingPage','Payments','Shipping','Legal','Emails','Authentication'];
  for(const name of files){const source=fs.readFileSync(path.join(root,'src/features/admin/pages/'+name+'.tsx'),'utf8');const ast=ts.createSourceFile(name+'.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(node){if(ts.isJsxText(node)||ts.isStringLiteral(node))assert(!/\bbackend\b|base de datos|API Conectada|API CONECTADA/i.test(node.text),name+': '+node.text);ts.forEachChild(node,visit);}visit(ast);}
  const landing=fs.readFileSync(path.join(root,'src/features/admin/components/LandingPageContent.tsx'),'utf8');assert(!landing.includes('Texto del botón CTA'));assert(!landing.includes('Imagen principal (Hero)'));assert(landing.includes('Es obligatorio.'));assert(landing.includes('Es opcional.'));assert(landing.includes('<AdminHelp>'));
});
test('form hints follow the preference but validation and operational hints remain visible',()=>{
  let showHelp=false;
  const api=load('src/features/admin/components/ui/index.tsx',{
    '../../../storefront/components/ui':{Input:'Input',Textarea:'Textarea',Select:'Select',Alert:'Alert'},
    '../../../storefront/components/ui/Icon':{Icon:'Icon'},'./AdminModal':{AdminModal:'Modal'},
    '../../context/AdminHelpContext':{useAdminHelp:()=>({showHelp})},
  });
  for(const name of ['Input','Textarea','Select']) {
    const field=api[name]({hint:'Explicación opcional',error:'Completa este campo.',required:true});
    assert.equal(field.props.hint,undefined);assert.equal(field.props.error,'Completa este campo.');assert.equal(field.props.required,true);
    assert.equal(api[name]({hint:'Esta función aún no está disponible.',persistentHint:true}).props.hint,'Esta función aún no está disponible.');
    showHelp=true;assert.equal(api[name]({hint:'Explicación opcional'}).props.hint,'Explicación opcional');showHelp=false;
  }
});
console.log(`${passed} admin panel help tests passed.`);
