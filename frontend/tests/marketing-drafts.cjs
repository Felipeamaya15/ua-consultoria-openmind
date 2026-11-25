const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const assert = require('node:assert/strict'), {test} = require('node:test');
function load(file) {
  const full = path.resolve(__dirname, '../src/features/marketing', file), module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(full,'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code, {module,exports:module.exports,structuredClone,crypto:require('node:crypto').webcrypto,URL,Date,require:id=>id.startsWith('.')?load(['.ts','.tsx'].map(ext=>path.resolve(path.dirname(full),id)+ext).find(fs.existsSync)):require(id)});
  return module.exports;
}
const d = load('domain/drafts.ts'), e = load('domain/editor.ts'), {draftRepository,draftStorageKey} = load('services/draftStorage.ts');
const scope = {apiBaseUrl:'https://api.example.test',storeId:'1',userId:'7'};
const memory = () => { const values = new Map(); return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values}; };
const publication = () => d.snapshot('a'.repeat(24),'AZUL','promotion','story',e.initialTemplateHistory());
test('crear, guardar cambios y recargar conserva metadatos y no crea otra copia',()=>{
  const storage=memory(), repo=draftRepository(scope,storage), first=repo.save(' Campaña ',publication());
  assert.equal(first.name,'Campaña'); assert.equal(first.version,1); assert.equal(first.createdAt,first.updatedAt);
  const next=repo.save('Actualizado',{...publication(),format:'banner'},first.id,first.updatedAt);
  assert.equal(next.id,first.id); assert.equal(next.createdAt,first.createdAt); assert(next.updatedAt>first.updatedAt);
  const rows=draftRepository(scope,storage).list(); assert.equal(rows.length,1); assert.equal(rows[0].publication.format,'banner');
});
test('las tres plantillas recuperan sus ajustes con historial nuevo, deshacer y rehacer funcionan',()=>{
  let session=e.initialTemplateHistory();
  for(const template of e.TEMPLATES){session=e.templateHistory(session,{type:'change',next:{...session.documents[session.active].present,template:template.id}}); session=e.templateHistory(session,{type:'change',next:{...session.documents[session.active].present,heading:`Diseño ${template.id}`,appearance:{...e.defaultAppearance(),copyBackground:'#ffffff',buttonShape:'pill',buttonWidth:60}}});}
  const p=d.snapshot('a'.repeat(24),'','product','square',session), restored=d.restoreSession(d.readSnapshot(JSON.parse(JSON.stringify(p))));
  for(const template of e.TEMPLATES){assert.equal(restored.documents[template.id].present.heading,`Diseño ${template.id}`);assert.equal(restored.documents[template.id].present.appearance.buttonShape,'pill');assert.equal(restored.documents[template.id].past.length,0);}
  const original=JSON.stringify(restored.documents.minimal.present);
  let next=e.templateHistory(restored,{type:'change',next:{...restored.documents.minimal.present,heading:'Otra idea'}});
  next=e.templateHistory(next,{type:'undo'});assert.equal(JSON.stringify(next.documents.minimal.present),original);
  next=e.templateHistory(next,{type:'redo'});assert.equal(next.documents.minimal.present.heading,'Otra idea');
});
test('renombrar, duplicar y eliminar conservan el original y asignan IDs nuevos',()=>{
  const repo=draftRepository(scope,memory()), original=repo.save('Original',publication());
  const renamed=repo.rename(original.id,'Renombrado',original.updatedAt), copy=repo.duplicate(original.id);
  assert.equal(renamed.createdAt,original.createdAt);assert.notEqual(copy.id,original.id); assert.equal(copy.name,'Renombrado · copia');
  copy.publication.designs.photo.heading='Cambio de copia'; assert.equal(repo.list().find(x=>x.id===original.id).publication.designs.photo.heading,'');
  repo.remove(copy.id,copy.updatedAt);assert.equal(repo.list().length,1);assert.equal(repo.list()[0].id,original.id);
});
test('instalación, tienda y usuario separan namespaces; no acepta un sobre ajeno',()=>{
  const storage=memory(), repo=draftRepository(scope,storage);repo.save('Privado',publication());
  for(const other of [{...scope,userId:'8'},{...scope,storeId:'2'},{...scope,apiBaseUrl:'https://another.example.test'}]){
    const otherRepo=draftRepository(other,storage);assert.equal(otherRepo.list().length,0);
    storage.setItem(otherRepo.key,storage.getItem(repo.key));assert.throws(()=>otherRepo.list(),/corresponden/);
  }
  assert.throws(()=>draftStorageKey({...scope,userId:''}),/identidad/);
});
test('solo persiste referencias y estilos, jamás precios, productos, URLs ni credenciales',()=>{
  const storage=memory(), repo=draftRepository(scope,storage), p=publication();
  Object.assign(p,{price:1,productName:'Nombre cacheado',image:'https://private.test/image',token:'secret'});
  Object.assign(p.designs.photo,{price:2,image:'https://private.test',token:'secret'});
  repo.save('Diseño',p);const raw=storage.getItem(repo.key);
  for(const sensitive of ['secret','private.test','cacheado','"token":'])assert(!raw.includes(sensitive));
  const saved=JSON.parse(raw).drafts[0].publication;assert(!('price' in saved));assert(!('price' in saved.designs.photo));
  assert(raw.includes('AZUL'));assert(raw.includes('promotion'));
});
test('datos corruptos y versiones incompatibles no se sobrescriben',()=>{
  const storage=memory(), repo=draftRepository(scope,storage);
  for(const raw of ['{bad','null','[]',JSON.stringify({version:9}),JSON.stringify({version:1,scope,drafts:[{version:7}]})]){
    storage.setItem(repo.key,raw);assert.throws(()=>repo.list());assert.throws(()=>repo.save('Nuevo',publication()));assert.equal(storage.getItem(repo.key),raw);
  }
});
test('cuota, lectura denegada y errores de escritura conservan la edición y el borrador anterior',()=>{
  const storage=memory(), repo=draftRepository(scope,storage), draft=repo.save('Original',publication()), before=storage.getItem(repo.key);
  storage.setItem=()=>{throw new Error('QuotaExceededError');};
  assert.throws(()=>repo.save('Editar',publication(),draft.id,draft.updatedAt),/espacio/);assert.equal(storage.getItem(repo.key),before);
  assert.throws(()=>draftRepository(scope,{getItem:()=>{throw new Error('denied');}}).list(),/permisos/);
});
test('límite de cantidad y conflictos entre pestañas impiden sobrescrituras accidentales',()=>{
  const repo=draftRepository(scope,memory()), first=repo.save('Primero',publication());
  const next=repo.rename(first.id,'Otra pestaña',first.updatedAt);
  assert.throws(()=>repo.save('Sobrescribir',publication(),first.id,first.updatedAt),/otra pestaña/);
  assert.throws(()=>repo.remove(first.id,first.updatedAt),/otra pestaña/);
  for(let i=1;i<30;i++)repo.save(`Diseño ${i}`,publication());
  assert.throws(()=>repo.duplicate(next.id),/30 borradores/);assert.equal(repo.list().length,30);
});
test('rechaza nombres vacíos, referencias inválidas y esquemas incompletos; normaliza CSS inseguro',()=>{
  assert.throws(()=>d.draftName('  '));assert.throws(()=>d.draftName('a'.repeat(81)));
  for(const patch of [{productId:'other'},{source:'bad'},{sku:'a'.repeat(201)},{activeTemplate:'__proto__'},{format:'bad'},{designs:{}}])assert.throws(()=>d.readSnapshot({...publication(),...patch}));
  const p=publication();p.designs.photo.appearance.copyBackground='url(bad)';assert.equal(d.readSnapshot(p).designs.photo.appearance.copyBackground,null);
});
