// Prueba el componente real con hooks y HTTP simulados. No emite despachos.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{test}=require('node:test'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/features/admin/components/BlueDispatchPanel.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function nodes(v,out=[]){if(Array.isArray(v))v.forEach(n=>nodes(n,out));else if(v&&typeof v==='object'){out.push(v);nodes(v.props?.children,out);}else if(typeof v==='string')out.push(v);return out;}
const text=v=>nodes(v).filter(n=>typeof n==='string').join(' ');
function harness({paid=true,state='sin_emitir',fail=false}={}){
 let states=[],cursor=0,mounted=false,jobs=[],tree;const calls=[];
 let server={estado:state,tracking:state==='emitted'?'12345':'',etiquetas:0,referencia:'BX-TEST'};
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,AbortController,Error,Number,console,setTimeout,
 require(name){if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(name==='react')return {useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(fn){if(!mounted)jobs.push(fn);}};
 if(name.includes('authService'))return {authService:{getToken:()=> 'test-token'}};
 if(name.endsWith('/api'))return {API_BASE_URL:'https://test.invalid'};throw Error(name);},
 fetch:async(url,options)=>{calls.push({url,options});if(options.method==='POST'){
 if(fail){server={...server,estado:'unknown'};return {ok:false,json:async()=>({exito:false,mensaje:'Emisión incierta'})};}
 server={...server,estado:'emitted',tracking:'12345'};}
 return {ok:true,json:async()=>({exito:true,data:server})};}});
 function render(){cursor=0;tree=module.exports.default({orderId:7,paid});if(!mounted){mounted=true;jobs.forEach(fn=>fn());jobs=[];}return tree;}
 async function settle(){for(let i=0;i<3;i++){render();await new Promise(setImmediate);}render();}
 function button(label){return nodes(tree).find(n=>n?.type==='button'&&text(n)===label);}
 function prepare(){nodes(tree).filter(n=>n?.type==='input'&&n.props.type==='number').forEach(n=>n.props.onChange({target:{value:'2'}}));render();nodes(tree).find(n=>n?.props?.type==='checkbox').props.onChange({target:{checked:true}});render();}
 return {settle,render,button,prepare,calls,get tree(){return tree;}};
}
test('Pedido impago no habilita emisión',async()=>{const h=harness({paid:false});await h.settle();assert.equal(h.button('Emitir despacho en Blue').props.disabled,true);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);});
test('Exige medidas y confirmación antes de emitir',async()=>{const h=harness();await h.settle();assert.equal(h.button('Emitir despacho en Blue').props.disabled,true);h.prepare();assert.equal(h.button('Emitir despacho en Blue').props.disabled,false);await h.button('Emitir despacho en Blue').props.onClick();await h.settle();const post=h.calls.find(c=>c.options.method==='POST');assert.deepEqual(JSON.parse(post.options.body),{accion:'emitir',bultos:[{weight:'2',length:'2',width:'2',height:'2'}]});assert.match(text(h.tree),/12345/);assert.equal(h.button('Emitir despacho en Blue'),undefined);});
test('Timeout muestra referencia y evita otra emisión',async()=>{const h=harness({fail:true});await h.settle();h.prepare();await h.button('Emitir despacho en Blue').props.onClick();await h.settle();assert.match(text(h.tree),/BX-TEST/);assert.equal(h.button('Emitir despacho en Blue'),undefined);assert.ok(h.button('Verificar y asociar despacho existente'));});
test('Despacho existente ofrece etiquetas y seguimiento',async()=>{const h=harness({state:'emitted'});await h.settle();assert.ok(h.button('Recuperar etiquetas'));assert.ok(h.button('Actualizar seguimiento'));assert.equal(h.button('Emitir despacho en Blue'),undefined);});
