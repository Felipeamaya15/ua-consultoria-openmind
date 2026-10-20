// Ejecutar contra Vite con VITE_API_URL=http://127.0.0.1:4912/openmind y la simulación local.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.MARKETING_TEST_URL||'http://127.0.0.1:5197',api='http://127.0.0.1:4912/openmind';
const out=process.env.MARKETING_EVIDENCE_DIR;
if(!out)throw new Error('Define MARKETING_EVIDENCE_DIR fuera del repositorio.');
fs.mkdirSync(out,{recursive:true});
const pid=n=>String(n).padStart(24,'0');
const env=data=>({exito:true,data});
async function state(patch){const res=await fetch(api+'/__qa/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});assert(res.ok);}
(async()=>{
  await state({storeId:1,price:30000,offer:24000,deleted:false,missingVariant:false,image:'data',cors:true,failImage:false});
  const browser=await chromium.launch({headless:true,channel:process.env.DASHBOARD_BROWSER_CHANNEL||'msedge'});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  let accept=true; const errors=[];
  await context.addInitScript(()=>{if(!localStorage.getItem('token'))localStorage.setItem('token','qa-owner-seven');});
  const page=await context.newPage();page.on('dialog',dialog=>accept?dialog.accept():dialog.dismiss());page.on('pageerror',error=>errors.push(error.message));
  const click=name=>page.getByRole('button',{name,exact:true}).click();
  const section=name=>click(name),art=page.locator('.marketing-art');
  const template=name=>page.getByRole('radio',{name:new RegExp(name)}).check();
  const ready=async()=>{await art.waitFor();await page.waitForFunction(()=>document.querySelector('.marketing-art')?.dataset.blocked==='false');await page.waitForTimeout(100);};
  const load=async()=>{await page.goto(base+'/emprendedor/marketing');await page.getByLabel('Producto para publicar',{exact:true}).waitFor();};
  const choose=async id=>{await page.getByLabel('Producto para publicar',{exact:true}).selectOption(pid(id));await ready();};
  const readDrafts=()=>page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ua-marketing-drafts-v1:'));return key?JSON.parse(localStorage.getItem(key)):null;});
  const color=async(name,value)=>page.getByLabel(name,{exact:true}).evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);
  try{
    await load();await page.getByLabel('Nombre del borrador',{exact:true}).fill('Nombre antes de elegir producto');await choose(1);
    assert.equal(await page.getByLabel('Nombre del borrador',{exact:true}).inputValue(),'Nombre antes de elegir producto');
    const matrix=[];
    for(const [name,id] of [['Fotografía','photo'],['Destacado','feature'],['Esencial','minimal']]){
      await section('Plantilla');await template(name);
      await section('Textos');await page.getByLabel('Bloque de texto').selectOption('heading');
      await page.getByLabel('Encabezado adicional (opcional)',{exact:true}).fill('Descubre nuestra colección');
      await page.getByLabel('Tipografía de la publicación').selectOption('georgia');
      await page.getByLabel('Cursiva del bloque',{exact:true}).check();
      await section('Composición');await color('Fondo de la ficha','#ffffff');await color('Fondo de llamada a la acción','#172b3a');
      await page.getByLabel('Espacio interior de la ficha (%)',{exact:true}).fill('1');
      await page.getByLabel('Bordes de la ficha (%)',{exact:true}).fill('2');
      await page.getByLabel('Forma de llamada a la acción').selectOption('pill');
      for(const [format,label,width,height] of [['square','Publicación cuadrada',1080,1080],['story','Historia vertical',1080,1920],['banner','Banner horizontal',1920,1080]]){
        await page.getByRole('radio',{name:new RegExp(label)}).check();await ready();
        const reference=await art.screenshot();
        for(const type of ['png','jpg']){
          const pending=page.waitForEvent('download',{timeout:20000});await click(`Descargar ${type.toUpperCase()}`);
          let download;try{download=await pending;}catch(error){throw new Error(`Fallo ${name}/${format}/${type}: ${await page.getByRole('alert').allTextContents()}`,{cause:error});}
          assert.match(download.suggestedFilename(),new RegExp(`^publicacion-${id}-${format}-[\\d-]+\\.${type}$`));
          const target=path.join(out,download.suggestedFilename());await download.saveAs(target);
          const bytes=fs.readFileSync(target);assert(bytes.length>1000);assert.equal(type==='png'?bytes.subarray(1,4).toString():bytes.subarray(0,2).toString('hex'),type==='png'?'PNG':'ffd8');
          const result=await page.evaluate(async({actual,reference})=>{
            const read=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
            const [a,r]=await Promise.all([read(actual),read(reference)]),w=320,h=Math.round(w*r.height/r.width);
            const pixels=image=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#e9edf4';ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);return ctx.getImageData(0,0,w,h).data;};
            const pa=pixels(a),pr=pixels(r);let diff=0,changed=0;const colors=new Set();
            for(let i=0;i<pa.length;i+=4){let delta=0;for(let k=0;k<3;k++){const d=Math.abs(pa[i+k]-pr[i+k]);diff+=d;delta+=d;}if(delta>90)changed++;colors.add(`${pa[i]>>4},${pa[i+1]>>4},${pa[i+2]>>4}`);}
            return {width:a.width,height:a.height,meanError:diff/(w*h*3),changedFraction:changed/(w*h),colorCount:colors.size};
          },{actual:`data:image/${type==='jpg'?'jpeg':'png'};base64,${bytes.toString('base64')}`,reference:'data:image/png;base64,'+reference.toString('base64')});
          assert.equal(result.width,width);assert.equal(result.height,height);assert(result.colorCount>15,'archivo contiene texto, imagen y composición');
          assert(result.meanError<18,`fidelidad ${id}/${format}/${type}: ${JSON.stringify(result)}`);
          matrix.push({template:id,format,type,...result});console.log('OK exportación',id,format,type,JSON.stringify(result));
        }
      }
    }
    fs.writeFileSync(path.join(out,'matriz-exportaciones.json'),JSON.stringify(matrix,null,2));
    // Guardar las tres personalizaciones y referencia explícita de variante, sin precios cacheados.
    await page.getByLabel('Variante de la publicación').selectOption('AZUL');
    await page.getByLabel('Nombre del borrador',{exact:true}).fill('Campaña primavera');await click('Guardar borrador');
    await page.getByText('Borrador guardado en este navegador.',{exact:true}).waitFor();
    const before=await readDrafts();assert.equal(before.drafts.length,1);assert.equal(before.drafts[0].publication.sku,'AZUL');assert(!('price' in before.drafts[0].publication));
    await section('Textos');await page.getByLabel('Encabezado adicional (opcional)',{exact:true}).fill('Una nueva mirada');
    await click('Deshacer');assert.equal(await art.locator('.marketing-art-heading').innerText(),'Descubre nuestra colección');
    await click('Rehacer');assert.equal(await art.locator('.marketing-art-heading').innerText(),'Una nueva mirada');
    await click('Guardar borrador');assert.equal((await readDrafts()).drafts.length,1);
    await page.reload();await page.getByLabel('Producto para publicar',{exact:true}).waitFor();assert.equal(await art.count(),0);
    await click('Mis borradores');await click('Abrir Campaña primavera');await ready();
    assert.equal(await art.locator('.marketing-art-heading').innerText(),'Una nueva mirada');assert.equal(await art.getAttribute('data-template'),'minimal');assert.equal(await art.getAttribute('data-format'),'banner');
    for(const name of ['Fotografía','Destacado']){await section('Plantilla');await template(name);assert.equal(await art.locator('.marketing-art-heading').innerText(),'Descubre nuestra colección');}
    await click('Mis borradores');await click('Renombrar Campaña primavera');await page.getByLabel('Nuevo nombre del borrador').fill('Campaña editada');await click('Guardar nombre');
    await click('Duplicar Campaña editada');assert.equal((await readDrafts()).drafts.length,2);
    await click('Eliminar Campaña editada · copia');await click('Cancelar');assert.equal((await readDrafts()).drafts.length,2);
    await click('Eliminar Campaña editada · copia');await click('Confirmar eliminación');assert.equal((await readDrafts()).drafts.length,1);
    accept=false;await click('Nueva publicación');assert.equal(await art.count(),1,'cancelar conserva edición');accept=true;
    await click('Nueva publicación');assert.equal(await art.count(),0);assert.equal((await readDrafts()).drafts.length,1);
    // Abrir siempre reconsulta el catálogo; referencias obsoletas no producen publicaciones falsas.
    await state({offer:21000});await click('Abrir Campaña editada');await ready();assert((await art.innerText()).includes('$21.000'));assert(!(await art.innerText()).includes('$24.000'));
    await state({missingVariant:true});await click('Mis borradores');await click('Abrir Campaña editada');await page.getByText('La variante guardada ya no está disponible.',{exact:false}).waitFor();assert.equal(await art.count(),0);
    await state({deleted:true});await click('Mis borradores');await click('Abrir Campaña editada');await page.getByText('Este producto ya no está disponible en tu catálogo.',{exact:false}).waitFor();assert.equal(await art.count(),0);
    await state({deleted:false,missingVariant:false,image:'none'});await click('Nueva publicación');await click('Actualizar datos');await choose(1);
    let downloadEvent=page.waitForEvent('download');await click('Descargar PNG');await (await downloadEvent).saveAs(path.join(out,'sin-imagen.png'));
    // Imagen externa legible en pantalla: CORS permitido exporta; denegado informa sin archivo parcial.
    await state({image:'external',cors:true});await click('Actualizar datos');await ready();downloadEvent=page.waitForEvent('download');await click('Descargar JPG');await (await downloadEvent).saveAs(path.join(out,'externa-cors.jpg'));
    await state({cors:false});await click('Descargar PNG');await page.getByRole('alert').filter({hasText:'CORS'}).waitFor();
    await state({cors:true,failImage:true});await click('Actualizar datos');await page.getByText('No pudimos cargar la imagen.',{exact:false}).waitFor();await click('Descargar PNG');await page.getByRole('alert').filter({hasText:'logo que no pudo cargarse'}).waitFor();
    await state({image:'data',failImage:false});await click('Actualizar datos');await ready();
    // Cuota real simulada en la API Storage del navegador: no se pierde lo editado.
    await page.getByLabel('Nombre del borrador',{exact:true}).fill('No cabe');await page.evaluate(()=>{window.qaOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('ua-marketing-drafts'))throw new DOMException('Quota','QuotaExceededError');return window.qaOriginalSet.call(this,k,v);};});
    await click('Guardar borrador');await page.getByRole('alert').filter({hasText:'no tiene espacio'}).waitFor();assert.equal(await page.getByLabel('Nombre del borrador',{exact:true}).inputValue(),'No cabe');
    await page.evaluate(()=>Storage.prototype.setItem=window.qaOriginalSet);
    // Un usuario distinto dentro de la misma pestaña debe desmontar inmediatamente la sesión anterior.
    await page.evaluate(()=>{localStorage.setItem('token','qa-owner-eight');window.dispatchEvent(new StorageEvent('storage',{key:'token'}));});
    await page.getByText('Publicación nueva.',{exact:false}).waitFor();assert.equal(await art.count(),0);await click('Mis borradores');await page.getByText('Aún no tienes borradores guardados.',{exact:true}).waitFor();
    await choose(1);await page.getByLabel('Nombre del borrador',{exact:true}).fill('Usuario ocho');await click('Guardar borrador');
    await state({storeId:2});await page.reload();await page.getByLabel('Producto para publicar',{exact:true}).waitFor();await click('Mis borradores');await page.getByText('Aún no tienes borradores guardados.',{exact:true}).waitFor();await choose(2);assert((await art.innerText()).includes('Tienda QA 2'));
    // Usuario anónimo: ni listado ni contenido privado.
    await page.evaluate(()=>{localStorage.removeItem('token');window.dispatchEvent(new StorageEvent('storage',{key:'token'}));});await page.getByText('Inicia sesión como emprendedor para acceder a Marketing.',{exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Mis borradores',exact:true}).count(),0);
    // Datos incompatibles y corruptos se preservan byte a byte, con un error comprensible.
    await state({storeId:1});await page.evaluate(()=>localStorage.setItem('token','qa-owner-seven'));await load();
    const original=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.endsWith(':store:1:user:7'));const raw=localStorage.getItem(key);localStorage.setItem(key,JSON.stringify({version:99}));return {key,raw};});
    await page.reload();await page.getByRole('alert').filter({hasText:'versión'}).waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),original.key),JSON.stringify({version:99}));
    await page.evaluate(key=>localStorage.setItem(key,'{corrupto'),original.key);await page.reload();await page.getByRole('alert').filter({hasText:'dañados'}).waitFor();
    await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),original);
    assert.deepEqual(errors,[]);console.log('OK borradores: CRUD, recarga, tres diseños, precios vigentes, referencias ausentes, cuota, corrupción, usuario, tienda y anónimo.');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
