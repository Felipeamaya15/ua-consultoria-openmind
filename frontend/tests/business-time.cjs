// Commercial dates must not inherit the browser/OS zone. Run: node tests/business-time.cjs.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file){
 const full=path.resolve(root,file),module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:1,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,require:id=>{
  if(id.endsWith('/api'))return {API_BASE_URL:'https://not-called.test'};
  if(id.includes('authService'))return {authService:{getToken:()=>null}};
  return load(path.relative(root,path.resolve(path.dirname(full),id+'.ts')));
 }});return module.exports;
}
const cases=[
 ['2026-11-01T01:30:00Z','2026-10-31','31 oct 2026, 22:30'],
 ['2026-11-01T03:00:00Z','2026-11-01','1 nov 2026, 00:00'],
 ['2027-01-01T02:59:00Z','2026-12-31','31 dic 2026, 23:59'],
 ['2027-01-01T03:00:00Z','2027-01-01','1 ene 2027, 00:00'],
 ['2026-07-01T03:59:00Z','2026-06-30','30 jun 2026, 23:59'],
 ['2026-07-01T04:00:00Z','2026-07-01','1 jul 2026, 00:00'],
 ['2026-09-06T03:59:00Z','2026-09-05','5 sep 2026, 23:59'],
 ['2026-09-06T04:00:00Z','2026-09-06','6 sep 2026, 01:00'],
 ['2026-04-05T02:30:00Z','2026-04-04','4 abr 2026, 23:30'],
 ['2026-04-05T03:30:00Z','2026-04-04','4 abr 2026, 23:30'],
];
const original=process.env.TZ;
try{for(const zone of ['UTC','America/Santiago','Asia/Tokyo','Pacific/Honolulu']){
 process.env.TZ=zone;const dates=load('src/features/admin/services/orderNavigation.ts'),recent=load('src/features/admin/services/recentOrdersService.ts');
 for(const [instant,day,display]of cases){assert.equal(dates.orderDateInChile(instant),day,`${zone}: ${instant}`);assert.equal(recent.formatRecentOrderDate(instant),display,`${zone}: ${instant}`);}
 assert.equal(dates.orderDateInChile('not a date'),'');assert.equal(recent.formatRecentOrderDate('not a date'),'');
 const filters=dates.readOrderFilters(new URLSearchParams({fecha_desde:'2026-10-31',fecha_hasta:'2026-10-31'}));
 assert.equal(dates.filterStoreOrders(cases.slice(0,2).map(([fecha_creacion],i)=>({id:i,fecha_creacion,estado:'pagado'})),filters).length,1);
 assert(dates.validOrderDate('2024-02-29'));assert(!dates.validOrderDate('2026-02-29'));
 console.log(`OK ${zone}: 10 casos UTC-3/UTC-4, medianoche, mes/año, gap/fold, filtros y fechas inválidas`);
}}finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
