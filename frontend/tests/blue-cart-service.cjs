const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{test}=require('node:test'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/features/storefront/services/blueExpressService.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const payload={items:[{producto_id:'a',sku:'A',cantidad:2},{producto_id:'b',sku:'B',cantidad:1}],destino:{region_code:13,commune_code:13123,district_code:'PRO'}};
function harness(change={}){
 const module={exports:{}},requests=[];
 vm.runInNewContext(compiled,{module,exports:module.exports,Error,Date,require:()=>({API_BASE_URL:'https://test.invalid'}),
 fetch:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({exito:true,data:{proveedor:'BLUE_EXPRESS',servicio:'EX',total:'4000',cotizacion:'signed',items:payload.items,vence_en:Math.floor(Date.now()/1000)+900,fecha_estimada_entrega:null,...change}})};}});
 return {...module.exports,requests};
}
test('Envía todos los productos y cantidades sin precio ni medidas',async()=>{const h=harness();const q=await h.fetchBlueQuote(payload);assert.equal(q.total,'4000');assert.deepEqual(JSON.parse(h.requests[0].options.body),payload);});
test('Acepta respuesta con líneas reordenadas',async()=>{await harness({items:[...payload.items].reverse()}).fetchBlueQuote(payload);});
test('Rechaza cantidad o producto distintos',async()=>{for(const item of [{...payload.items[0],cantidad:1},{...payload.items[0],producto_id:'otro'}])await assert.rejects(()=>harness({items:[item,payload.items[1]]}).fetchBlueQuote(payload),e=>e.code==='INVALID_QUOTE');});
test('Rechaza vencimiento y precio inválido',async()=>{for(const change of [{vence_en:1},{total:'4.25'},{total:'NaN'},{items:[]}])await assert.rejects(()=>harness(change).fetchBlueQuote(payload),e=>e.code==='INVALID_QUOTE');});
