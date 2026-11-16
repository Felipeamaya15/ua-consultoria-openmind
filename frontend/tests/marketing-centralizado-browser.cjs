// Real browser -> dedicated Django/PostgreSQL/MongoDB/Mailpit. All output outside Git.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {chromium, request} = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.MARKETING_QA_OUTPUT;
assert(out && !path.resolve(out).toLowerCase().startsWith(path.resolve(__dirname, '../..').toLowerCase() + path.sep));
const base = 'http://127.0.0.1:5211', api = 'http://127.0.0.1:8002';
const session = JSON.parse(fs.readFileSync(path.join(out, 'qa-session.json'), 'utf8'));
const results = [], external = [], errors = [];
async function main() {
  const client = await request.newContext({baseURL:api,extraHTTPHeaders:{Authorization:`Token ${session.token}`}});
  const store = (await (await client.get('/api/tienda/configuracion/')).json()).data;
  assert.equal(store.nombre,'Marketing QA Centralizado');
  const state = (await (await client.get('/api/tienda/correo/google/estado/')).json()).data;
  assert.equal(state.modo,'mailpit');assert.equal(state.envio_habilitado,true);
  const snapshots={};
  for(const endpoint of ['/api/catalog/productos/','/api/catalog/productos/admin/listado/','/api/landing/configuracion/','/api/landing/multimedia-publica/']) {
    const response=await client.get(endpoint);assert.equal(response.status(),200);
    snapshots[endpoint]=await response.json();
  }
  fs.writeFileSync(path.join(out,'real-source-responses.json'),JSON.stringify(snapshots,null,2));
  const browser = await chromium.launch({headless:true,channel:process.env.DASHBOARD_BROWSER_CHANNEL||'msedge'});
  try {
    for(const width of [1440,768,390]) {
      const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
      await context.addInitScript(token=>{if(window===window.top)localStorage.setItem('token',token);},session.token);
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(['http:','https:'].includes(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname)) {external.push(url.origin);return route.abort();}
        return route.continue();
      });
      const page=await context.newPage();page.setDefaultTimeout(15000);
      page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
      const tab=name=>page.getByRole('tab',{name:new RegExp(name)}).click();
      const overflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: ${label}`);
      const capture=async label=>{await overflow(label);await page.screenshot({path:path.join(out,`${label}-${width}.png`),fullPage:true});};
      try {
        await page.goto(base+'/emprendedor/marketing');
        await page.getByLabel('Producto para publicar',{exact:true}).selectOption(session.productId);
        const art=page.locator('.marketing-art');await art.waitFor();
        await page.getByLabel('Variante de la publicación').selectOption('QA-ROJO');
        assert((await art.innerText()).includes('$27.000'));
        await capture('publicaciones');
        for(const type of ['PNG','JPG']) {
          const download=page.waitForEvent('download');await page.getByRole('button',{name:`Descargar ${type}`,exact:true}).click();
          await (await download).saveAs(path.join(out,`publicacion-${width}.${type.toLowerCase()}`));
          assert(fs.statSync(path.join(out,`publicacion-${width}.${type.toLowerCase()}`)).size>1000);
        }
        await page.getByLabel('Nombre del borrador',{exact:true}).fill(`Publicación QA ${width}`);
        await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
        await page.getByText('Borrador guardado correctamente en este navegador. No está publicado.',{exact:true}).waitFor();
        await tab('Difusión');
        const sharing=page.getByRole('tabpanel',{name:/Difusión/});
        await sharing.getByLabel('Tipo de contenido',{exact:true}).selectOption('Productos');
        await sharing.getByRole('button',{name:/Bolso QA Centralizado/}).click();
        assert((await sharing.getByLabel('Título para difundir').inputValue()).includes('Bolso'));
        await sharing.getByLabel('Buscar contenido para difundir').fill('no-existe');
        await sharing.getByText('No hay coincidencias con estos filtros. Prueba otro tipo o búsqueda.',{exact:true}).waitFor();
        await sharing.getByLabel('Buscar contenido para difundir').fill('');
        for(const [group,title] of [['Servicios','Servicio QA publicado'],['Talleres','Taller QA publicado']]) {
          await sharing.getByLabel('Tipo de contenido',{exact:true}).selectOption(group);
          await sharing.getByRole('button',{name:new RegExp(title)}).click();
          await sharing.getByRole('button',{name:'Preparar imagen 1:1',exact:true}).click();
          await art.waitFor();assert((await art.innerText()).includes(title));if(group==='Talleres'){await capture('taller-publicacion');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PNG',exact:true}).click();await(await pending).saveAs(path.join(out,`taller-${width}.png`));}await tab('Difusión');
        }
        await capture('difusion');
        await tab('Biblioteca multimedia');
        await page.getByLabel('Buscar recurso multimedia',{exact:true}).fill('Imagen privada QA');
        await page.getByRole('heading',{name:'Imagen privada QA',exact:true}).waitFor();await capture('biblioteca');
        await tab('Campañas');const campaign=page.locator('.campaign-workspace');
        await campaign.getByText('Campaña histórica conservada',{exact:true}).waitFor();
        await campaign.getByLabel('Nombre del borrador',{exact:true}).fill(`Campaña QA ${width} ${Date.now()}`);
        await campaign.getByLabel('Asunto de la campaña',{exact:true}).fill('Colección y actividades de nuestra tienda');
        await campaign.getByLabel('Contenido de la campaña',{exact:true}).fill('Conoce nuestros productos y actividades. Este correo conserva el texto accesible.');
        await campaign.getByRole('button',{name:/Bolso QA Centralizado/}).click();
        await campaign.getByRole('checkbox',{name:/Color: Rojo/}).check();
        await campaign.getByRole('button',{name:'Seleccionar imágenes disponibles',exact:true}).click();
        await campaign.getByLabel('Plantilla del correo').selectOption('feature');
        await campaign.getByRole('button',{name:'Elegir imagen de biblioteca',exact:true}).click();
        await campaign.locator('.campaign-library-grid').getByRole('button',{name:/Imagen privada QA/}).click();
        if(width===1440)await campaign.getByRole('button',{name:'Seleccionar todos los elegibles del filtro',exact:true}).click();
        assert.equal(await campaign.getByRole('checkbox',{name:'pendiente-marketing@example.test',exact:true}).count(),0);
        const campaignName=await campaign.getByLabel('Nombre del borrador',{exact:true}).inputValue();
        await tab('Publicaciones');await tab('Campañas');assert.equal(await campaign.getByLabel('Nombre del borrador',{exact:true}).inputValue(),campaignName);
        await capture('campanas');
        await campaign.getByRole('button',{name:'Guardar y previsualizar',exact:true}).click();
        const frame=page.frameLocator('iframe[title="Correo promocional generado por el servidor"]');
        await frame.getByText('$27.000 CLP',{exact:true}).first().waitFor();
        await frame.getByText('Bolso QA Centralizado',{exact:true}).waitFor();
        assert(await frame.locator('img').count()>=3);
        assert(await frame.locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)));
        await page.screenshot({path:path.join(out,`correo-preview-${width}.png`),fullPage:true});
        await page.getByRole('button',{name:/Cerrar/}).last().click();
        await campaign.getByRole('button',{name:'Enviar prueba al propietario',exact:true}).click();
        await campaign.getByText(/Prueba aceptada por el proveedor/).waitFor();
        if(width===1440) {
          await campaign.getByRole('button',{name:'Revisar y enviar campaña',exact:true}).click();
          await page.getByRole('button',{name:'Confirmar envío promocional',exact:true}).click();
          await page.getByRole('button',{name:'Sí, confirmar envío',exact:true}).click();
          await campaign.getByText('Resultado actualizado. Revisa el detalle de cada destinatario.',{exact:true}).waitFor();
          const mailbox=await (await client.get('http://127.0.0.1:8026/api/v1/search?query=to:cliente-marketing@example.test')).json();assert(mailbox.messages.length);
          const message=await (await client.get('http://127.0.0.1:8026/api/v1/message/'+mailbox.messages[0].ID)).json();
          assert(message.HTML.includes('cid:image-'));assert(message.Text.includes('$27.000'));
          fs.writeFileSync(path.join(out,'mailpit-campaign.json'),JSON.stringify(message,null,2));
          const unsubscribe=message.Text.match(/http:\/\/127\.0\.0\.1:8002\/api\/tienda\/campanas\/baja\/\?token=[^\s]+/)[0];
          const before=await client.get(unsubscribe);assert.equal(before.status(),200);
          const withdrawn=await client.post(api+'/api/tienda/campanas/baja/',{form:{token:new URL(unsubscribe).searchParams.get('token')}});assert.equal(withdrawn.status(),200);
          const audience=(await (await client.get('/api/tienda/campanas/destinatarios/')).json()).data;
          assert(!audience.resultados.some(row=>row.email==='cliente-marketing@example.test'));
          results.push({check:'Mailpit real, CID, envío individual, enlace de baja y exclusión tras POST',status:'passed'});
        }
        if(width===1440)for(const [group,title] of [['Servicios','Servicio QA publicado'],['Talleres','Taller QA publicado']]) {
          await campaign.getByRole('button',{name:'Nuevo borrador',exact:true}).click();
          await campaign.getByLabel('Nombre del borrador',{exact:true}).fill(group+' QA '+Date.now());
          await campaign.getByLabel('Asunto de la campaña',{exact:true}).fill(title);
          await campaign.getByLabel('Contenido de la campaña',{exact:true}).fill('Información de '+title);
          await campaign.getByLabel('Tipo de contenido de campaña',{exact:true}).selectOption(group);
          await campaign.getByRole('button',{name:new RegExp(title)}).click();
          await campaign.getByRole('button',{name:'Guardar y previsualizar',exact:true}).click();
          await frame.getByText(title,{exact:true}).last().waitFor();
          await page.screenshot({path:path.join(out,'campana-'+group.toLowerCase()+'.png'),fullPage:true});
          await page.getByRole('button',{name:/Cerrar/}).last().click();
        }
        await page.goto(base+'/emprendedor/contactos?vista=campanas');
        await page.waitForURL('**/emprendedor/marketing#campanas');await campaign.getByText('Campaña histórica conservada',{exact:true}).waitFor();
        await page.goto(base+'/emprendedor/productos');await page.locator('.catalog-product-actions:visible').first().waitFor();
        assert.equal(await page.getByText('Crear publicación',{exact:true}).count(),0);
        await page.goto(base+'/emprendedor/contactos');await page.getByLabel('Buscar contacto',{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:/Campañas/}).count(),0);await capture('contactos');
        await page.goto(base+'/emprendedor/correos');await page.getByRole('button',{name:'Guardar correos automáticos',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Conectar Gmail',exact:true}).count(),0);await capture('correos');
        await page.goto(base+'/emprendedor/landing#informacion-negocio');await page.getByRole('button',{name:'Conectar Gmail',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:/Autorizo el uso de esta cuenta/}).isChecked(),false);await capture('negocio-gmail');
        results.push({width,check:'Publicaciones PNG/JPG, borrador, cuatro secciones, filtros reales, campañas, biblioteca, selección, preview y navegación',status:'passed'});
      } catch(error) {await page.screenshot({path:path.join(out,`failure-${width}.png`),fullPage:true});fs.writeFileSync(path.join(out,'failure-state.txt'),await page.locator('body').innerText());throw error;}
      await context.close();
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await client.dispose();fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({results,errors,blockedExternal:external},null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
