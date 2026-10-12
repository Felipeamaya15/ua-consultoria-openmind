// Run from frontend: node scripts/generate-visual-css.cjs
// Rebuild aliases from the real resolver contract while preserving consumer CSS.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(relative) {
  const file=path.resolve(root,relative);if(cache.has(file))return cache.get(file);
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const requireLocal=id=>{if(!id.startsWith('.'))throw Error(id);return load(path.resolve(path.dirname(file),id)+'.ts')};
  vm.runInNewContext(code,{module,exports:module.exports,require:requireLocal,structuredClone,URLSearchParams});cache.set(file,module.exports);return module.exports;
}
const {resolveVisualConfig}=load('src/features/storefront/visual/resolveVisualConfig.ts');
const {visualConfigToCssVariables}=load('src/features/storefront/visual/cssVariables.ts');
const variables=Object.keys(visualConfigToCssVariables(resolveVisualConfig()));
const target=path.join(root,'src/styles/visual-config.css');
const source=fs.readFileSync(target,'utf8');
const boundary=source.indexOf('[data-storefront-visual] {\n  background:');
if(boundary<0)throw Error('Consumer boundary not found');
const alias=view=>'[data-storefront-visual] {\n'+variables.filter(key=>key.endsWith('-'+view)).map(key=>'  '+key.replace(/-(desktop|tablet|mobile)$/,'')+': var('+key+');').join('\n')+'\n}\n';
const header='/* Responsive aliases generated from the visual variable contract. */\n'+alias('desktop')+'@media(max-width:1023px) {\n'+alias('tablet')+'}\n@media(max-width:639px) {\n'+alias('mobile')+'}\n';
let consumers=source.slice(boundary).replace(/\/\* Generated page aliases start \*\/[\s\S]*?\/\* Generated page aliases end \*\//,'');
const {STORE_PAGES}=load('src/features/storefront/visual/pages.ts');
const pageAliases=STORE_PAGES.map(({id})=>'[data-storefront-visual] [data-visual-page="'+id+'"] {\n'+variables.filter(key=>key.startsWith('--visual-page-'+id+'-')&&key.endsWith('-desktop')).map(key=>{const base=key.replace(/-desktop$/,'');return '  '+base.replace('--visual-page-'+id+'-','--visual-page-')+': var('+base+');'}).join('\n')+'\n}').join('\n');
fs.writeFileSync(target,header+consumers.trimEnd()+'\n\n/* Generated page aliases start */\n'+pageAliases+'\n/* Generated page aliases end */\n');
console.log('Generated '+variables.length/3+' responsive aliases and '+STORE_PAGES.length+' page bindings.');
