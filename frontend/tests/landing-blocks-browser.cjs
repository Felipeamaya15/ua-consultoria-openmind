// Real frontend and HTTP clients against the isolated local Postman simulation.
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.EDITOR_TEST_URL || 'http://127.0.0.1:5188', api=process.env.EDITOR_TEST_API || 'http://127.0.0.1:4918/openmind';
const out=process.env.EDITOR_EVIDENCE_DIR || 'C:/Users/maria/Ecommerce/rediseno-editor-evidencias';
const control=async value=>{const r=await fetch(api+'/__qa/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,200);};
const remote=async()=> (await (await fetch(api+'/api/landing/configuracion/')).json()).data;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({viewport:{width:1672,height:1000}});
 await context.addInitScript(()=>localStorage.setItem('token','qa-editor'));
 const page=await context.newPage(),errors=[],writes=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.url().includes('/api/')&&!['GET','OPTIONS'].includes(r.method()))writes.push({url:r.url(),method:r.method()});});
 let success=false;
 try{
  await control({store:1,status:200,reads:200,reset:true});
  await page.goto(base+'/emprendedor/landing');
  const manager=page.locator('#secciones-tienda');
  const add=async name=>{await page.getByRole('button',{name:'Agregar sección',exact:true}).click();await page.getByRole('button').filter({has:page.locator('strong',{hasText:new RegExp('^'+name+'$')})}).click();};
  const saveContent=async()=>{await page.getByRole('button',{name:'Guardar página principal',exact:true}).click();await page.getByText('Página principal guardada en tu tienda.',{exact:true}).waitFor();};
  await add('Nuestra historia');
  await page.getByLabel('Título de la sección',{exact:true}).fill('Nuestra historia: raíces y oficio');
  await page.getByLabel('Subtítulo de la sección',{exact:true}).fill('HECHO CON PROPÓSITO');
  await page.getByLabel('Párrafos de la sección',{exact:true}).fill('Cada pieza nace de una idea y de las manos que la hacen posible.\n\nCreamos objetos cotidianos con materiales honestos, atención al detalle y mucho cariño.');
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=640;const x=c.getContext('2d');x.fillStyle='#ded9cb';x.fillRect(0,0,900,640);x.fillStyle='#64765d';x.fillRect(70,80,330,470);x.fillStyle='#b08167';x.beginPath();x.arc(620,320,190,0,Math.PI*2);x.fill();x.fillStyle='#f7f4ed';x.font='35px Georgia';x.fillText('Taller creativo',105,320);return c.toDataURL('image/png');});
  const file={name:'taller-prueba.png',mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')};
  await page.getByLabel('Agregar imagen a la sección',{exact:true}).setInputFiles(file);
  await page.getByLabel('Descripción de imagen 1',{exact:true}).fill('Composición de prueba del taller creativo');
  const storyId=await manager.locator('[data-block-id]').getAttribute('data-block-id');
  await add('Imagen y texto');await page.getByLabel('Título de la sección',{exact:true}).fill('Materiales que cuentan');
  await add('Texto libre');await page.getByLabel('Título de la sección',{exact:true}).fill('Información adicional');
  await add('Galería');await page.getByLabel('Agregar imagen a la sección',{exact:true}).setInputFiles(file);await page.getByLabel('Agregar imagen a la sección',{exact:true}).setInputFiles(file);
  await page.getByRole('button',{name:'Mover imagen antes',exact:true}).last().click();
  await add('Cita destacada');
  // Order, hide, delete confirmation, undo, redo and discard operate in this form.
  await page.getByRole('button',{name:'Subir sección 5',exact:true}).click();
  await page.getByRole('checkbox',{name:'Mostrar sección 4',exact:true}).uncheck({force:true});
  await page.getByRole('button',{name:'Eliminar sección 5',exact:true}).click();
  await page.getByRole('dialog',{name:'Eliminar sección',exact:true}).getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await manager.locator('[data-block-id]').count(),5);
  await page.getByRole('button',{name:'Eliminar sección 5',exact:true}).click();
  await page.getByRole('dialog',{name:'Eliminar sección',exact:true}).getByRole('button',{name:'Eliminar sección',exact:true}).click();
  assert.equal(await manager.locator('[data-block-id]').count(),4);
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal(await manager.locator('[data-block-id]').count(),5);
  await page.getByRole('button',{name:'Rehacer',exact:true}).click();assert.equal(await manager.locator('[data-block-id]').count(),4);
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();
  await saveContent();
  const content=(await remote()).contenido;assert.equal(content.bloques.length,5);assert.equal(content.bloques[3].visible,false);assert.equal(content.contacto.correo,'tienda@example.test');assert.deepEqual(content.productos_destacados,['p1','p2']);
  await page.reload();await manager.locator('[data-block-id]').first().waitFor();
  await manager.locator('[data-block-id]').first().locator('.lb-expand').click();
  assert.equal(await page.getByLabel('Título de la sección',{exact:true}).inputValue(),'Nuestra historia: raíces y oficio');
  await manager.screenshot({path:path.join(out,'pagina-principal-secciones.png')});
  await page.getByLabel('Título de la sección',{exact:true}).fill('Borrador pendiente');
  await control({status:500});await page.getByRole('button',{name:'Guardar página principal',exact:true}).click();await page.getByRole('alert').first().waitFor();assert.equal(await page.getByLabel('Título de la sección',{exact:true}).inputValue(),'Borrador pendiente');
  await control({status:200});await page.getByRole('button',{name:'Descartar cambios',exact:true}).click();assert.equal(await page.getByLabel('Título de la sección',{exact:true}).inputValue(),'Nuestra historia: raíces y oficio');
  await page.getByLabel('Título de la sección',{exact:true}).fill('Salida pendiente');await page.getByRole('link',{name:'Diseño → Editor visual',exact:true}).click();await page.getByRole('alertdialog',{name:'Cambios sin guardar',exact:true}).getByRole('button',{name:'Seguir editando',exact:true}).click();await page.getByRole('button',{name:'Descartar cambios',exact:true}).click();
  console.log('OK contenido: cinco tipos, imágenes, orden, visibilidad, confirmación, deshacer/rehacer, descarte, error 500 y recarga');

  await page.goto(base+'/emprendedor/diseno/editor?plantilla=editorial');
  const frame=page.frameLocator('iframe'),story=()=>frame.locator(`[data-content-block-id="${storyId}"]`);
  await story().waitFor();
  const selectBlock=async()=>{await page.getByLabel('Sección que estás editando').selectOption('block:'+storyId);await page.getByLabel('Distribución',{exact:true}).waitFor();};
  const details=async label=>{const d=page.locator('.ve-block-inspector details').filter({has:page.locator('summary',{hasText:new RegExp('^'+label+'$')})});if(!await d.evaluate(el=>el.open))await d.locator('summary').click();};
  const until=async(name,value)=>{await page.waitForFunction(({id,name,value})=>{const el=document.querySelector('iframe')?.contentDocument?.querySelector(`[data-content-block-id="${id}"]`);return el&&getComputedStyle(el).getPropertyValue(name).trim()===value;},{id:storyId,name,value});};
  const saveDesign=async()=>{await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('✓ Guardado',{exact:true}).waitFor();};
  await selectBlock();
  // Content entry points are links, with no title or image replacement form.
  assert.equal(await page.getByLabel('Título principal',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Título de la sección',{exact:true}).count(),0);
  await page.getByLabel('Distribución',{exact:true}).selectOption('right');await until('--lb-image-order','2');
  await details('Título');await page.getByLabel('Tamaño · Título',{exact:true}).fill('52');await until('--lb-title-size','52px');
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();await until('--lb-title-size','');
  await page.getByRole('button',{name:'Rehacer',exact:true}).click();await until('--lb-title-size','52px');
  await page.getByLabel('Tipografía · Título',{exact:true}).selectOption('Georgia');await page.getByLabel('Peso · Título',{exact:true}).selectOption('500');
  await page.getByLabel('Color · Título',{exact:true}).fill('#35452f');await page.getByLabel('Color · Título',{exact:true}).blur();
  await details('Contenedor');await page.getByLabel('Espacio interior',{exact:true}).fill('36');await page.getByLabel('Ancho máximo',{exact:true}).fill('1120');
  await details('Imagen');await page.getByLabel('Proporción',{exact:true}).selectOption('4 / 3');await page.getByLabel('Encuadre',{exact:true}).selectOption('contain');
  await page.getByRole('button',{name:'Tablet',exact:true}).click();assert.equal(await page.getByLabel('Alcance de los cambios').inputValue(),'all');await until('--lb-title-size','52px');
  await page.getByLabel('Alcance de los cambios').selectOption('device');await page.getByLabel('Tamaño · Título',{exact:true}).fill('35');await until('--lb-title-size','35px');
  await page.getByRole('button',{name:'Móvil',exact:true}).click();await until('--lb-title-size','52px');
  await page.getByLabel('Alcance de los cambios').selectOption('device');await page.getByLabel('Tamaño · Título',{exact:true}).fill('27');await until('--lb-title-size','27px');
  await control({status:500});await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('No se pudo guardar',{exact:true}).waitFor();await until('--lb-title-size','27px');
  await control({status:200});await saveDesign();
  const persisted=(await remote()).contenido;assert.deepEqual(persisted.bloques,content.bloques);assert.equal(persisted.apariencia_bloques.editorial[storyId].mobile.titleSize,27);
  await page.reload();await story().waitFor();await selectBlock();await page.getByRole('button',{name:'Móvil',exact:true}).click();await until('--lb-title-size','27px');
  await page.getByRole('button',{name:'Computadora',exact:true}).click();await until('--lb-title-size','52px');
  await story().getByRole('heading').click();await page.getByLabel('Distribución',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Contenido y secciones',exact:true}).click();await page.getByRole('link',{name:'Administrar secciones de mi tienda →',exact:true}).waitFor();assert.equal(await page.locator('.ve-properties textarea').count(),0);
  await selectBlock();await details('Título');
  await story().evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  await page.screenshot({path:path.join(out,'editor-secciones.png')});
  console.log('OK apariencia: selección por clic, distribución, textos, imágenes, herencia, variantes independientes, deshacer/rehacer, fallo recuperable, publicación y recarga');

  // A visitor in a fresh browser context sees published styles without local storage.
  const visitor=await browser.newContext(),publicPage=await visitor.newPage();
  for(const [index,template] of ['editorial','minimal','visual','catalog'].entries()){
    for(const [width,device] of [[1440,'desktop'],[768,'tablet'],[375,'mobile']]){
      await publicPage.setViewportSize({width,height:1000});await publicPage.goto(base+'/plantilla/'+(index+1));
      const block=publicPage.locator(`[data-content-block-id="${storyId}"]`);await block.waitFor();assert.equal(await block.getByRole('heading').innerText(),'Nuestra historia: raíces y oficio');
      assert.equal(await publicPage.locator('[data-content-block-id]').count(),4);
      assert.equal(await publicPage.locator('[data-institutional-branding]').count(),2);
      assert(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${template}/${device} overflow`);
      if(index===0){const expected={desktop:'52px',tablet:'35px',mobile:'27px'}[device];assert.equal(await block.evaluate(el=>getComputedStyle(el).getPropertyValue('--lb-title-size').trim()),expected);}
      for(const badge of await publicPage.locator('[data-institutional-branding]').all()){
        const logo=await badge.locator('img').evaluate(img=>({src:img.getAttribute('src'),width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,fit:getComputedStyle(img).objectFit,natural:img.naturalWidth,bg:getComputedStyle(img.parentElement).backgroundColor}));
        assert.equal(logo.src,'/logo-universidad-autonoma.png');assert.equal(logo.width,56);assert.equal(logo.height,48);assert.equal(logo.fit,'contain');assert(logo.natural>0);assert.equal(logo.bg,'rgba(0, 0, 0, 0)');
      }
      await block.screenshot({path:path.join(out,`historia-plantilla-${index+1}-${device}.png`)});
    }
  }
  await publicPage.setViewportSize({width:1440,height:1000});await publicPage.goto(base+'/plantilla/1');await publicPage.locator('[data-institutional-branding]').first().screenshot({path:path.join(out,'logo-institucional-integrado.png')});await publicPage.locator('[data-institutional-branding]').last().screenshot({path:path.join(out,'logo-institucional-pie-integrado.png')});
  await visitor.close();
  console.log('OK 4 plantillas × 3 dispositivos: historia publicada, apariencia sin almacenamiento local, sin desbordamiento y logo original protegido arriba y abajo');

  // Institutional container follows the actual bar controls, in all templates.
  for (const template of ['editorial','minimal','visual','catalog']) {
    await page.goto(base+'/emprendedor/diseno/editor?plantilla='+template);
    await frame.locator('[data-institutional-branding]').first().waitFor();
    for (const background of ['#263d31','#eee6d5']) {
      for (const section of ['topBar','footer']) {
        await page.getByLabel('Sección que estás editando').selectOption(section);
        const colorInput=page.getByLabel('Fondo hexadecimal',{exact:true});
        const colorGroup=colorInput.locator('xpath=ancestor::details[1]');
        if (await colorGroup.count() && !await colorGroup.evaluate(el=>el.open)) await colorGroup.locator('summary').first().click();
        await colorInput.fill(background);
      }
      for (const device of ['Computadora','Tablet','Móvil']) {
        await page.getByRole('button',{name:device,exact:true}).click();
        const results=await frame.locator('[data-institutional-branding]').evaluateAll(badges=>badges.map(badge=>{
          const surface=badge.closest('[data-visual-section="topBar"],[data-visual-section="footer"]');
          const image=badge.querySelector('img');
          const color=getComputedStyle(badge.querySelector('span')).color,bg=getComputedStyle(surface).backgroundColor;
          const lum=v=>{const rgb=v.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
          const a=lum(color),b=lum(bg);
          return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),bg,container:getComputedStyle(badge).backgroundColor,src:image.getAttribute('src'),width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height};
        }));
        assert.equal(results.length,2);
        for(const result of results){assert.equal(result.container,'rgba(0, 0, 0, 0)');assert.equal(result.src,'/logo-universidad-autonoma.png');assert.equal(result.width,56);assert.equal(result.height,48);assert(result.ratio>=4.5,`${template}/${device}/${background}: ${JSON.stringify(result)}`);}
      }
    }
    await saveDesign();
  }
  await page.goto(base+'/plantilla/1');await page.locator('[data-institutional-branding]').first().waitFor();
  await page.locator('[data-visual-section="topBar"]').screenshot({path:path.join(out,'logo-institucional-barra.png')});
  await page.locator('[data-visual-section="footer"]').screenshot({path:path.join(out,'logo-institucional-pie.png')});
  console.log('OK logo original: fondos claro/oscuro con controles reales, 4 plantillas × 3 dispositivos, tamaño 56 × 48, contenedor transparente y contraste >= 4.5');

  // Landing and editor shells on narrow real screens; store isolation in same browser.
  await page.goto(base+'/emprendedor/landing');await manager.waitFor();
  for(const width of [768,375]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await manager.screenshot({path:path.join(out,`pagina-principal-${width}.png`)});}
  await control({store:2});await page.reload();await manager.waitFor();assert.equal(await manager.locator('[data-block-id]').count(),0);await page.goto(base+'/emprendedor/diseno/editor?plantilla=editorial');await frame.locator('[data-storefront-visual]').waitFor();assert.equal(await frame.locator('[data-content-block-id]').count(),0);
  await control({store:1});assert.deepEqual(errors,[]);assert(writes.every(r=>/\/api\/landing\/(configuracion|apariencia)\/?$/.test(r.url)),JSON.stringify(writes));
  console.log('OK Página principal responsiva, aislamiento por tienda y ninguna escritura comercial');
  console.log('Capturas: '+out);success=true;
 }finally{if(!success){await page.screenshot({path:path.join(out,'fallo-bloques.png'),fullPage:true}).catch(()=>{});console.log((await page.locator('body').innerText()).slice(-1800));}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
