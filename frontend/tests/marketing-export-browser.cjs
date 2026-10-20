const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MARKETING_TEST_URL||'http://127.0.0.1:5197',api='http://127.0.0.1:4912/openmind';
const out=process.env.MARKETING_EVIDENCE_DIR;
if(!out)throw new Error('Define MARKETING_EVIDENCE_DIR fuera del repositorio.');
const fontFile=process.env.MARKETING_TEST_FONT;
if(!fontFile)throw new Error('Define MARKETING_TEST_FONT con la fuente de QA Plus Jakarta Sans.');
(async()=>{
  await fetch(api+'/__qa/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId:1,deleted:false,missingVariant:false,price:30000,offer:24000,image:'data',cors:true,failImage:false})});
  const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.addInitScript(()=>localStorage.setItem('token','qa-owner-seven'));
  await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  const page=await context.newPage();let permit=true,downloads=0,settleDialog=Promise.resolve();page.on('dialog',d=>{settleDialog=permit?d.accept():d.dismiss();});page.on('download',()=>downloads++);
  const button=name=>page.getByRole('button',{name,exact:true}).click();
  try{
    await page.goto(base+'/emprendedor/marketing');await page.getByLabel('Producto para publicar',{exact:true}).selectOption('1'.padStart(24,'0'));
    const art=page.locator('.marketing-art');await art.waitFor();
    await button('Textos');await page.getByLabel('Encabezado adicional (opcional)',{exact:true}).fill('Diseñado para acompañarte en cada nueva aventura');
    await page.getByRole('radio',{name:/Historia vertical/}).check();
    // Fuente real de Google Fonts, embebida de forma determinista desde la carpeta externa de QA.
    await page.addStyleTag({content:`@font-face{font-family:'Plus Jakarta Sans';src:url(data:font/ttf;base64,${fs.readFileSync(fontFile).toString('base64')}) format('truetype');font-style:normal;font-weight:200 800;}`});
    await page.getByLabel('Tipografía de la publicación').selectOption('jakarta');
    await page.evaluate(async()=>{await document.fonts.load('700 20px "Plus Jakarta Sans"');await document.fonts.ready;});
    let event=page.waitForEvent('download');await button('Descargar PNG');await(await event).saveAs(path.join(out,'fuente-web-texto-largo.png'));
    // La aplicación espera las fuentes y no entrega un archivo mientras siguen pendientes.
    await page.evaluate(()=>{window.qaLoad=FontFaceSet.prototype.load;const hold=new Promise(resolve=>window.qaRelease=resolve);FontFaceSet.prototype.load=function(...args){return hold.then(()=>window.qaLoad.apply(this,args));};});
    let count=downloads;event=page.waitForEvent('download');await button('Descargar PNG');await page.waitForTimeout(200);assert.equal(downloads,count);assert(await page.getByRole('button',{name:'Descargar PNG',exact:true}).isDisabled());
    await page.evaluate(()=>{FontFaceSet.prototype.load=window.qaLoad;window.qaRelease();});await(await event).saveAs(path.join(out,'espera-fuentes.png'));
    await page.evaluate(()=>{window.qaLoad=FontFaceSet.prototype.load;FontFaceSet.prototype.load=()=>Promise.reject(new Error('font failed'));});
    count=downloads;await button('Descargar PNG');await page.getByRole('alert').filter({hasText:'No pudimos cargar la fuente'}).waitFor();assert.equal(downloads,count);
    await page.evaluate(()=>FontFaceSet.prototype.load=window.qaLoad);
    // También espera imágenes y evita codificaciones vacías.
    await page.evaluate(()=>{window.qaDecode=HTMLImageElement.prototype.decode;const hold=new Promise(resolve=>window.qaRelease=resolve);HTMLImageElement.prototype.decode=function(){return hold.then(()=>window.qaDecode.call(this));};});
    count=downloads;event=page.waitForEvent('download');await button('Descargar JPG');await page.waitForTimeout(200);assert.equal(downloads,count);
    await page.evaluate(()=>{HTMLImageElement.prototype.decode=window.qaDecode;window.qaRelease();});await(await event).saveAs(path.join(out,'espera-imagenes.jpg'));
    await page.evaluate(()=>{window.qaToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb){cb(new Blob([],{type:'image/png'}));};});
    count=downloads;await button('Descargar PNG');await page.getByRole('alert').filter({hasText:'archivo completo'}).waitFor();assert.equal(downloads,count);
    await page.evaluate(()=>HTMLCanvasElement.prototype.toBlob=window.qaToBlob);
    // Cancelar una navegación conserva el diseño; la confirmación de salida es accesible nativa.
    permit=false;const cancelled=page.waitForEvent('dialog');await page.getByRole('link',{name:'Administrar productos →',exact:true}).click();await cancelled;await settleDialog;assert(page.url().includes('/marketing'));permit=true;
    // Los controles nuevos y los nombres largos no generan desplazamiento horizontal.
    const longName='Colección para acompañarte en cada aventura de primavera y verano';
    await page.getByLabel('Nombre del borrador',{exact:true}).fill(longName);await button('Guardar borrador');await button('Mis borradores');
    for(const width of [375,768]){
      await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: responsive con borrador de nombre largo`);
      event=page.waitForEvent('download').catch(error=>({error}));await button('Descargar PNG');
      const downloaded=await event;if(downloaded.error)throw new Error(`Exportación ${width}px: ${await page.getByRole('alert').allTextContents()}; bloqueada=${await art.getAttribute('data-blocked')}`,{cause:downloaded.error});
      await downloaded.saveAs(path.join(out,`exportacion-${width}.png`));
    }
    await page.setViewportSize({width:1440,height:1000});await button('Mis borradores');
    // Producto con nombre largo: fuente, imagen y precio permanecen completos en el archivo.
    let extreme=false;
    await page.route('**/api/catalog/productos/admin/listado/',async route=>{const response=await route.fetch(),body=await response.json();body.data[0].nombre=extreme?'Texto comercial excepcionalmente extenso '.repeat(400):'Mochila de materiales resistentes con bolsillos interiores y detalles especiales para acompañarte en cada recorrido de la ciudad';await route.fulfill({json:body});});
    await button('Actualizar datos');await page.waitForTimeout(300);assert.equal(await art.getAttribute('data-blocked'),'false');
    event=page.waitForEvent('download');await button('Descargar PNG');await(await event).saveAs(path.join(out,'producto-nombre-largo.png'));
    extreme=true;await button('Actualizar datos');await page.getByText('Esta combinación no cabe de forma legible.',{exact:false}).waitFor();
    count=downloads;await button('Descargar PNG');await page.getByRole('alert').filter({hasText:'Ajusta el contenido:'}).waitFor();assert.equal(downloads,count);
    // Una sesión que cambia durante una exportación pendiente cancela el archivo anterior.
    extreme=false;await button('Actualizar datos');await page.waitForTimeout(250);
    await page.evaluate(()=>{window.qaLoad=FontFaceSet.prototype.load;const hold=new Promise(resolve=>window.qaRelease=resolve);FontFaceSet.prototype.load=function(...args){return hold.then(()=>window.qaLoad.apply(this,args));};});
    count=downloads;await button('Descargar PNG');await page.evaluate(()=>{localStorage.setItem('token','qa-owner-eight');window.dispatchEvent(new StorageEvent('storage',{key:'token'}));});
    await page.getByText('Publicación nueva.',{exact:false}).waitFor();await page.evaluate(()=>{FontFaceSet.prototype.load=window.qaLoad;window.qaRelease();});await page.waitForTimeout(300);assert.equal(downloads,count);assert.equal(await art.count(),0);
    console.log('OK adicionales: fuente web real y textos largos, espera de fuentes e imágenes, errores sin descarga, PNG/JPG no vacíos, navegación cancelada, 375/768 px, nombres largos, bloqueo y sesión cambiada durante exportación.');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

