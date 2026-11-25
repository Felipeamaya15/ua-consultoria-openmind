const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(clientId){
 let calls=0;const module={exports:{}};
 const source=fs.readFileSync(path.join(__dirname,'../src/features/auth/hooks/useOptionalGoogleLogin.ts'),'utf8').replaceAll('import.meta.env.VITE_GOOGLE_CLIENT_ID',JSON.stringify(clientId));
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:()=>({useGoogleLogin:options=>{calls++;return ()=>options;}})});
 return {...module.exports,calls:()=>calls};
}
test('sin client_id no inicializa Google ni requiere proveedor',()=>{
 for(const id of ['', '   ']){const h=load(id);assert.equal(h.GOOGLE_LOGIN_CONFIGURED,false);assert.doesNotThrow(()=>h.useOptionalGoogleLogin({})());assert.equal(h.calls(),0);}
});
test('con client_id conserva el hook y las opciones de Google',()=>{
 const h=load(' qa.apps.googleusercontent.com '),options={onSuccess:()=>{}};
 assert.equal(h.GOOGLE_CLIENT_ID,'qa.apps.googleusercontent.com');assert.equal(h.GOOGLE_LOGIN_CONFIGURED,true);
 assert.equal(h.useOptionalGoogleLogin(options)(),options);assert.equal(h.calls(),1);
});
