const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file);const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,structuredClone,URLSearchParams,require:id=>load(path.resolve(path.dirname(file),id)+'.ts')});cache.set(file,module.exports);return module.exports;}
const resolver=load('src/features/storefront/visual/resolveVisualConfig.ts'),{visualConfigToCssVariables:css}=load('src/features/storefront/visual/cssVariables.ts'),fonts=load('src/features/storefront/visual/fontLibrary.ts');
test('structural color links header/footer on all templates and viewports, with explicit unlink',()=>{
  for(const template of ['editorial','minimal','visual','catalog']){
    const config=resolver.resolveVisualConfig({template,customization:{global:{colors:{structural:'#224466'}},header:{background:'#abcdef'},footer:{background:'#fedcba'}}});
    const vars=css(config);for(const view of ['desktop','tablet','mobile']){assert.equal(vars['--visual-header-bg-'+view],'#224466');assert.equal(vars['--visual-footer-background-'+view],'#224466');assert.equal(vars['--visual-header-color-'+view],vars['--visual-footer-color-'+view]);}
    const unlinked=css(resolver.resolveVisualConfig({template,customization:{global:{unlinkStructural:true},header:{background:'#abcdef'},footer:{background:'#fedcba'}}}));assert.equal(unlinked['--visual-header-bg-desktop'],'#abcdef');assert.equal(unlinked['--visual-footer-background-desktop'],'#fedcba');
  }
});
test('palette roles flow into sections, cards, pages and borders without touching geometry',()=>{
  for(const template of ['editorial','minimal','visual','catalog']){
    const before=resolver.resolveVisualConfig({template});const changed=resolver.resolveVisualConfig({template,customization:{global:{colors:{background:'#fefefe',alternate:'#eeffee',surface:'#ffefff',muted:'#444444',button:'#225522',buttonText:'#ffffee',border:'#778877'}}}});const vars=css(changed);
    assert.equal(vars['--visual-section-featured-background-desktop'],'#eeffee');assert.equal(vars['--visual-contact-background-desktop'],'#eeffee');assert.equal(vars['--visual-location-background-desktop'],'#eeffee');assert.equal(vars['--visual-page-login-panel-background-desktop'],'#ffefff');assert.equal(vars['--visual-cta-color-desktop'],'#ffffee');assert.equal(vars['--visual-global-border-desktop'],'#778877');assert.equal(changed.hero.height,before.hero.height);assert.equal(changed.productCard.radius,before.productCard.radius);
  }
});
test('fonts load only chosen families, deduplicate per document, and retry after failure',()=>{
  const links=[],doc={querySelector(selector){return links.find(link=>selector.includes('"'+link.dataset.openmindFont+'"'))},createElement(){return {dataset:{},addEventListener(type,callback){this[type]=callback},remove(){links.splice(links.indexOf(this),1)}}},head:{appendChild(link){links.push(link)}}};
  assert(Object.keys(fonts.WEB_FONTS).length>=30);fonts.loadFont('inter',doc);fonts.loadFont('inter',doc);assert.equal(links.length,1);assert(links[0].href.includes('family=Inter&display=swap'));fonts.loadFont('unsafe-font',doc);assert.equal(links.length,1);links[0].error();fonts.loadFont('inter',doc);assert.equal(links.length,1);
  const config=resolver.resolveVisualConfig({customization:{global:{typography:{body:'inter',heading:'playfair'}}}});fonts.loadVisualFonts(config,doc);assert.equal(links.length,2);assert(links.some(link=>link.href.includes('Playfair+Display')));assert.equal(css(config)['--visual-body-font-desktop'],'"Inter", sans-serif');
});
