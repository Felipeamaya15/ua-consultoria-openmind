const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{test}=require('node:test'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){const resolved=path.resolve(root,file),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(resolved,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=name=>{if(name in mocks)return mocks[name];if(!name.startsWith('.'))return require(name);const p=path.resolve(path.dirname(resolved),name);if(p.endsWith('.json'))return{default:JSON.parse(fs.readFileSync(p,'utf8'))};return load(['.ts','.tsx'].map(ext=>p+ext).find(fs.existsSync)||path.join(p,'index.tsx'),mocks)};
  vm.runInNewContext(code,{module,exports:module.exports,require:req,URLSearchParams});return module.exports;}
const analytics=load('src/features/admin/services/dashboardAnalytics.ts');
const history=n=>Array.from({length:n},(_,i)=>({fecha:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),ventas:`${i*100}.00`,pedidos:i%4}));

test('agrupación diaria/semanal/mensual conserva todas las ventas y pedidos e intervalos',()=>{
 for(const n of [1,7,30,60,365]){const rows=history(n),{buckets,granularity}=analytics.dashboardBuckets(rows);
 assert.equal(buckets.reduce((s,b)=>s+b.sales,0),rows.reduce((s,b)=>s+Number(b.ventas),0));
 assert.equal(buckets.reduce((s,b)=>s+b.orders,0),rows.reduce((s,b)=>s+b.pedidos,0));
 assert.equal(buckets[0].from,rows[0].fecha);assert.equal(buckets.at(-1).to,rows.at(-1).fecha);
 if(n===365){assert.equal(buckets.length,12);assert.equal(granularity,'Totales mensuales')}
 if(n===60)assert.ok(buckets.length<=9);
 if(n<=30)assert.equal(buckets.length,n);
 }
});
test('picos, empates, ausencia de actividad y porcentajes no inventan resultados',()=>{
 const rows=[{fecha:'2026-10-08',ventas:'1000.00',pedidos:2},{fecha:'2026-10-09',ventas:'1000.00',pedidos:3}];
 const peak=analytics.dashboardPeak(rows,'ventas');assert.equal(peak.date,'2026-10-08');assert.equal(peak.ties,2);
 assert.equal(analytics.dashboardPeak(rows,'pedidos').date,'2026-10-09');
 assert.equal(analytics.dashboardPeak([{fecha:'2026-10-08',ventas:'0.00',pedidos:0}],'ventas'),null);
 assert.equal(analytics.variationLabel(null),'Sin base anterior para comparar');
 assert.ok(analytics.variationLabel('25.00').includes('+25%'));assert.ok(analytics.variationLabel('-100.00').includes('-100%'));
});
const pickup=load('src/features/admin/services/pickupConfiguration.ts');
function disclosure(value){let expanded=false;const module=load('src/features/storefront/components/checkout/PickupDetails.tsx',{
 react:{useId:()=> 'test-details',useState:()=>[expanded,next=>{expanded=typeof next==='function'?next(expanded):next}]},
 '../../../admin/services/pickupConfiguration':pickup});
 return{html:()=>renderToStaticMarkup(React.createElement(module.default,{pickup:value})),tree:()=>module.default({pickup:value})};}
function walk(node,fn){if(Array.isArray(node))return node.forEach(n=>walk(n,fn));if(node&&typeof node==='object'){fn(node);walk(node.props?.children,fn)}}
function toggle(view){let button;walk(view.tree(),n=>{if(n.type==='button')button=n});let prevented=false,stopped=false;button.props.onClick({preventDefault(){prevented=true},stopPropagation(){stopped=true}});assert.ok(prevented&&stopped);}

test('desplegable inicia cerrado, expande/contrae y no propaga selección ni envía formulario',()=>{
 const draft=pickup.structuredPickup({enabled:true,address:'Dirección real configurada',schedule:''});
 draft.location={region:'Metropolitana de Santiago',comuna:'Providencia',street:'Calle configurada',number:'42',reference:'Local A',verification:''};
 for(const day of ['mon','tue','fri'])draft.hours[day]={enabled:true,start:'09:30',end:'18:30'};
 const view=disclosure(draft);let html=view.html();
 assert.ok(html.includes('aria-expanded="false"')&&html.includes('aria-controls="pickup-details-test-details"'));
 assert.ok(!html.includes('Calle configurada')&&!html.includes('09:30'));
 toggle(view);html=view.html();assert.ok(html.includes('aria-expanded="true"')&&html.includes('type="button"'));
 for(const text of ['Calle configurada','42','Providencia','Local A','Lunes, Martes, Viernes','09:30 a 18:30','Cerrado'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('maps.google')&&!html.includes('https://'));
 toggle(view);assert.ok(!view.html().includes('Calle configurada'));
});
test('dirección y horario legacy se conservan sin inventar estructura ni horarios',()=>{
 const view=disclosure({enabled:true,address:'Dirección antigua del local',schedule:'Lunes a viernes de 9 a 18'});
 toggle(view);const html=view.html();assert.ok(html.includes('Dirección antigua del local')&&html.includes('Lunes a viernes de 9 a 18'));
});
