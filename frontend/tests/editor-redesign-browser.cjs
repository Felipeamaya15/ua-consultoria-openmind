// Real browser + real HTTP clients, against the local Postman simulation only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.EDITOR_TEST_URL || 'http://127.0.0.1:5188';
const api = process.env.EDITOR_TEST_API || 'http://127.0.0.1:4918/openmind';
const out = process.env.EDITOR_EVIDENCE_DIR || 'C:/Users/maria/Ecommerce/rediseno-editor-evidencias';
const control = async value => { const response = await fetch(api+'/__qa/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}); assert.equal(response.status,200); };
(async () => {
  fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch({headless:true,channel:process.env.DASHBOARD_BROWSER_CHANNEL || 'msedge'});
  let complete=false;
  try {
    const context = await browser.newContext({viewport:{width:1672,height:1000}});
    context.setDefaultTimeout(15000);
    await context.addInitScript(() => localStorage.setItem('token','qa-editor'));
    const page = await context.newPage(), errors=[], commercial=[];
    page.on('request',request=>{if(request.url().includes('/api/') && !['GET','OPTIONS'].includes(request.method()) && !request.url().includes('/api/landing/configuracion/'))commercial.push(request.method()+' '+request.url());});
    globalThis.qaEditorPage=page;
    page.on('response',async response=>{if(response.status()>=400 && response.url().includes('/api/'))console.log('HTTP',response.status(),response.url(),(await response.text().catch(()=>'' )).slice(0,1000));});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await control({store:1,status:200,reads:200,reset:true});
    await page.goto(base+'/emprendedor/diseno/editor');
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).waitFor();
    const frame = page.frameLocator('iframe');
    await frame.locator('[data-visual-section="topBar"]').waitFor();
    await frame.getByRole('heading',{name:'Hecho para acompañarte',exact:true}).waitFor();
    assert.equal(await page.locator('.ve-sidebar').count(),0);
    assert(await page.getByLabel('Página que estás editando').isVisible());
    assert.equal(await page.getByLabel('Alcance de los cambios').inputValue(),'all');
    assert.deepEqual(errors,[]);
    console.log('OK editor inicial en navegador real, vista amplia y sin navegación lateral duplicada');
    const waitForFrame = async () => { const src=await page.locator('iframe').getAttribute('src'); await page.waitForFunction(src=>{const iframe=document.querySelector('iframe');return iframe?.contentWindow?.location.href===new URL(src,location.href).href && iframe.contentDocument?.readyState==='complete';},src); await frame.locator('[data-storefront-visual]').waitFor(); };
    const choosePage = async value => { await page.getByLabel('Página que estás editando').selectOption(value); if(value==='checkout')await page.getByLabel('Etapa de compra').selectOption('contact'); await waitForFrame(); };
    const chooseSection = value => page.getByLabel('Sección que estás editando').selectOption(value);
    const device = name => page.getByRole('button',{name,exact:true}).click();
    const variable = name => frame.locator('[data-storefront-visual]').evaluate((el,name)=>getComputedStyle(el).getPropertyValue(name).trim(),name);
    const untilVariable = async (name,value) => { await page.waitForFunction(({name,value})=>{const doc=document.querySelector('iframe')?.contentDocument;const root=doc?.querySelector('[data-storefront-visual]');return root && getComputedStyle(root).getPropertyValue(name).trim()===value;},{name,value}); };
    const save = async () => { await page.getByRole('button',{name:'Guardar cambios',exact:true}).click(); await page.getByText('✓ Guardado',{exact:true}).waitFor(); };

    // Default general edits cascade; explicit tablet edits leave desktop/mobile alone.
    await chooseSection('topBar');
    await page.getByLabel('Fondo hexadecimal',{exact:true}).fill('#123456');
    for(const [name,viewport] of [['Computadora','desktop'],['Tablet','tablet'],['Móvil','mobile']]){
      await device(name); assert.equal(await page.getByLabel('Alcance de los cambios').inputValue(),'all');
      await untilVariable('--visual-topbar-bg-'+viewport,'#123456');
    }
    await device('Tablet'); await page.getByLabel('Alcance de los cambios').selectOption('device');
    await page.getByLabel('Fondo hexadecimal',{exact:true}).fill('#abcdef');
    await untilVariable('--visual-topbar-bg-tablet','#abcdef');
    assert.equal(await variable('--visual-topbar-bg-desktop'),'#123456');
    assert.equal(await variable('--visual-topbar-bg-mobile'),'#123456');
    await page.getByRole('button',{name:'Deshacer',exact:true}).click(); await untilVariable('--visual-topbar-bg-tablet','#123456');
    await page.getByRole('button',{name:'Rehacer',exact:true}).click(); await untilVariable('--visual-topbar-bg-tablet','#abcdef');
    await device('Computadora'); await page.getByLabel('Alcance de los cambios').selectOption('device');
    await page.getByLabel('Fondo hexadecimal',{exact:true}).fill('#334455');
    await untilVariable('--visual-topbar-bg-desktop','#334455'); assert.equal(await variable('--visual-topbar-bg-tablet'),'#abcdef'); assert.equal(await variable('--visual-topbar-bg-mobile'),'#123456');
    console.log('OK cambios generales, tablet exclusiva, deshacer y rehacer');

    // A template comparison preserves unsaved drafts and other template settings.
    await page.getByRole('button',{name:'Plantillas',exact:true}).click();
    await page.getByRole('button').filter({hasText:'Soft Discovery'}).click();
    await page.waitForFunction(()=>document.querySelector('iframe')?.getAttribute('src')?.startsWith('/plantilla/2'));
    await frame.locator('[data-storefront-visual]').waitFor();
    await page.getByRole('button').filter({hasText:'Studio Pop'}).click();
    await untilVariable('--visual-topbar-bg-tablet','#abcdef');
    await save(); await page.reload(); await frame.locator('[data-visual-section="topBar"]').waitFor();
    await untilVariable('--visual-topbar-bg-tablet','#abcdef');
    await device('Computadora');

    // Content lives in Página principal; design provides contextual navigation.
    await chooseSection('hero');await page.getByRole('button',{name:'Contenido y secciones',exact:true}).click();
    assert.equal(await page.getByLabel('Título principal',{exact:true}).count(),0);
    await page.getByRole('link',{name:'Portada, logo y apartados de Página principal →',exact:true}).click();
    await page.getByLabel('Título principal',{exact:true}).fill('Colección de prueba');
    const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6RbAAAAAASUVORK5CYII=','base64');
    await page.getByLabel('Subir imagen',{exact:true}).first().setInputFiles({name:'test.png',mimeType:'image/png',buffer:pixel});
    await page.getByRole('button',{name:'Guardar página principal',exact:true}).click();await page.getByText('Página principal guardada en tu tienda.',{exact:true}).waitFor();
    const remote=await(await fetch(api+'/api/landing/configuracion/')).json();assert.equal(remote.data.titulo,'Colección de prueba');assert(remote.data.imagen_principal.endsWith('/__qa/image.png'));
    await page.goto(base+'/emprendedor/diseno/editor?plantilla=editorial');await frame.getByRole('heading',{name:'Colección de prueba',exact:true}).waitFor();
    await frame.locator('[data-institutional-branding] img').last().click();assert.equal(await page.getByLabel('Reemplazar imagen',{exact:true}).count(),0);
    console.log('OK separación de contenido/apariencia, multipart desde Página principal y marca institucional protegida');

    await page.getByRole('button',{name:'Diseño y apariencia',exact:true}).click(); await chooseSection('global');
    await page.getByLabel('Fuente de títulos',{exact:true}).selectOption('georgia');
    await save(); await page.reload(); await untilVariable('--visual-heading-font-desktop','Georgia, serif');
    console.log('OK tipografías guardadas después de recargar');

    const pageIds=['home','catalog','product','login','cart','checkout','confirmation','tracking','profile','orders','terms','privacy','refund'];
    const templateNames=['Studio Pop','Soft Discovery','Velta Editorial','Obsidian Showcase'];
    for(let index=0;index<templateNames.length;index++){
      await page.getByRole('button',{name:'Plantillas',exact:true}).click();
      await page.getByRole('button').filter({hasText:templateNames[index]}).click();
      for(const id of [...pageIds,...(index===2?['story']:[])]){
        await choosePage(id);
        const iframe=page.locator('iframe'); assert((await iframe.getAttribute('src')).includes('visualExample=1'));
        await frame.locator('[data-visual-section="footer"]').waitFor();
        assert.equal(await frame.locator('[data-institutional-branding]').count(),2);
        if(!['home','catalog'].includes(id)){
          await chooseSection('pageLayout');
          await page.getByRole('group',{name:'Tamaño de títulos',exact:true}).getByRole('button',{name:'Mediano',exact:true}).click();
          await untilVariable('--visual-page-'+id+'-title-size-desktop','32px');
        }
        if(id==='checkout'){
          for(const step of ['contact','delivery','payment','confirm']){
            await page.getByLabel('Etapa de compra').selectOption(step);
            await waitForFrame(); await frame.locator('[data-visual-page]').waitFor();
          }
        }
      }
    }
    console.log('OK cuatro plantillas, todas sus páginas, etapas del checkout y marca institucional');

    await page.getByRole('button',{name:'Plantillas',exact:true}).click(); await page.getByRole('button').filter({hasText:'Studio Pop'}).click();
    await save();
    await choosePage('checkout'); await page.getByLabel('Etapa de compra').selectOption('contact');
    await frame.getByRole('heading',{name:'Checkout · Contacto',exact:true}).waitFor();
    await chooseSection('pageLayout');
    await page.screenshot({path:path.join(out,'editor-escritorio.png')});
    const before=await page.locator('.ve-frame-wrap').evaluate(el=>el.clientWidth);
    await page.getByRole('button',{name:'Opciones',exact:true}).click();
    assert(await page.locator('.ve-frame-wrap').evaluate(el=>el.clientWidth)>before);
    await page.getByRole('button',{name:'Opciones',exact:true}).click();
    await page.getByLabel('Zoom de vista previa').selectOption('75');
    assert.equal(await page.locator('iframe').evaluate(el=>el.style.transform),'scale(0.75)');
    await page.getByRole('button',{name:'Ampliar vista',exact:true}).click();
    assert.equal(await page.locator('.ve-properties').isVisible(),false);
    await page.keyboard.press('Escape'); assert(await page.locator('.ve-properties').isVisible());
    await page.getByLabel('Zoom de vista previa').selectOption('fit');
    for(const [width,name,file] of [[768,'Tablet','editor-tablet.png'],[375,'Móvil','editor-movil.png']]){
      await page.setViewportSize({width,height:1000}); await device(name);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(out,file),fullPage:true});
    }
    console.log('OK zoom, panel plegable, vista ampliada, tablet y móvil sin desbordamiento');

    // Same browser, different backend-confirmed store: no visual or content leakage.
    await control({store:2}); await page.reload(); await frame.locator('[data-storefront-visual]').waitFor();
    const store2 = await variable('--visual-topbar-bg-tablet'); assert.notEqual(store2,'#abcdef');
    await choosePage('home'); await frame.getByRole('heading',{name:'Hecho para acompañarte',exact:true}).waitFor();
    await control({store:1});
    assert.deepEqual(errors,[]); assert.deepEqual(commercial,[]);
    console.log('OK aislamiento entre tiendas y ausencia de errores de React');
    console.log('Capturas: '+out); complete=true;
  } finally { if(!complete && globalThis.qaEditorPage) { await globalThis.qaEditorPage.screenshot({path:path.join(out,'ultima-verificacion.png'),fullPage:true}).catch(()=>{}); console.log('Estado final:',(await globalThis.qaEditorPage.locator('body').innerText()).slice(-2000)); } await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
