
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,request}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const out=process.env.INSTAGRAM_QA_OUTPUT;
assert(out&&!path.resolve(out).toLowerCase().startsWith(path.resolve(__dirname,'../..').toLowerCase()+path.sep));
const session=JSON.parse(fs.readFileSync(path.join(out,'runtime','qa-session.json')));
const origin=fs.readFileSync(path.join(out,'runtime','public-origin.txt'),'utf8').trim();
const base='https://localhost:8444',mock='http://127.0.0.1:5199/instagram';
const results=[],errors=[],traffic=[];let browser,page,context,api,anonymous,control,oauth;
const panel=()=>page.getByRole('region',{name:'Conexión oficial de Instagram'});
const dialog=()=>page.getByRole('dialog',{name:'Publicación individual en Instagram',exact:true});
const button=(name,root=page)=>root.getByRole('button',{name,exact:true});
async function test(id,title,expected,action){const row={id,title,expected,actions:title,started:new Date().toISOString()};
 try{row.obtained=await action()||'Comprobaciones ejecutadas sin diferencias.';row.status='aprobada';}
 catch(e){row.status='fallida';row.obtained=e.message;row.stack=e.stack;}
 row.evidence=`capturas/${id}-${row.status}.png`;await page.screenshot({path:path.join(out,row.evidence),fullPage:false}).catch(()=>{});
 results.push(row);fs.writeFileSync(path.join(out,'pruebas','browser-resultados.json'),JSON.stringify(results,null,2));console.log(id+' '+row.status+': '+title);
 if(row.status==='fallida')throw new Error(row.obtained);
}
async function data(path,body){const r=body===undefined?await api.get('/api/instagram/'+path):await api.post('/api/instagram/'+path,{data:body});assert(r.ok(),await r.text());return(await r.json()).data;}
async function state(){return(await control.get(mock+'/__qa/state')).json();}
async function mode(value){assert((await control.post(mock+'/__qa/mode',{data:{mode:value}})).ok());}
async function connect(renew=false){await panel().getByRole('checkbox').check();
 const returned=page.waitForResponse(r=>r.url().startsWith(origin+'/api/instagram/oauth/callback/?code='));
 await button(renew?'Renovar autorización':'Conectar Instagram',panel()).click();await returned;
 await page.waitForURL(base+'/emprendedor/landing?instagram=conectado#contacto-horarios');await panel().getByText(/@openmind_qa · Conectada/).waitFor();}
async function main(){
 control=await request.newContext();await control.post(mock+'/__qa/reset');
 browser=await chromium.launch({channel:'msedge',headless:true});
 context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 await context.addInitScript(token=>{if(location.origin==='https://localhost:8444')localStorage.setItem('token',token)},session.token);
 await context.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.origin===origin&&u.pathname==='/api/instagram/oauth/callback/'&&u.searchParams.has('inicio')){
   const response=await route.fetch({maxRedirects:0});assert.equal(response.status(),302);
   oauth=new URL(response.headers().location);assert.equal(oauth.origin,'https://www.facebook.com');
   assert.equal(oauth.searchParams.get('config_id'),'100000000000002');assert(!oauth.searchParams.has('scope'));

   return route.fulfill({response,headers:{...response.headers(),location:oauth.searchParams.get('redirect_uri')+'?code=qa-browser-code&state='+encodeURIComponent(oauth.searchParams.get('state'))}});
  }
  if(u.origin==='https://www.facebook.com'&&u.pathname==='/dialog/oauth'){
   oauth=u;assert.equal(u.searchParams.get('config_id'),'100000000000002');assert(!u.searchParams.has('scope'));
   return route.fulfill({status:302,headers:{Location:u.searchParams.get('redirect_uri')+'?code=qa-browser-code&state='+encodeURIComponent(u.searchParams.get('state'))}});
  }
  if(['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1',new URL(origin).hostname].includes(u.hostname))return route.abort();
  return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 page.on('response',r=>{if(r.url().includes('/api/instagram/'))traffic.push({path:new URL(r.url()).pathname,status:r.status(),method:r.request().method()});});
 api=await request.newContext({baseURL:base,ignoreHTTPSErrors:true,extraHTTPHeaders:{Authorization:'Token '+session.token}});
 anonymous=await request.newContext({ignoreHTTPSErrors:true});
 try{
 await api.post('/api/instagram/desconectar/',{data:{}});
 await page.goto(base+'/emprendedor/landing#contacto-horarios');
 await test('IG01','Consentimiento inicial y ubicación en Contacto y horarios','Conectar deshabilitado hasta aceptar; Gmail y Facebook permanecen.',async()=>{
  await panel().getByText('Sin cuenta autorizada · Desconectada').waitFor().catch(async()=>{await panel().getByText(/Desconectada/).waitFor();});
  assert(await button('Conectar Instagram',panel()).isDisabled());assert(await page.getByText('Facebook',{exact:true}).count());assert(await page.getByText(/Gmail/).count());
 });
 await test('IG02','OAuth por callback público con consentimiento y proveedor simulados','State único y cookie Secure HttpOnly Lax en el dominio público; SUAT conectado.',async()=>{
  await connect();assert(oauth);assert.equal(oauth.searchParams.get('redirect_uri'),origin+'/api/instagram/oauth/callback/');
  const c=(await context.cookies(origin)).find(c=>c.name==='openmind_instagram_oauth');assert(!c,'Cookie retirada después del callback');
  assert.equal((await data('estado/')).tipo_token,'SYSTEM_USER');assert((await state()).calls.some(c=>c.path.endsWith('/me/assigned_instagram_accounts')));
 });
 await test('IG03','SUAT sin vencimiento y permisos mínimos de Unified Login','Estado sin vencimiento programado; sin API de mensajes, anuncios o comentarios.',async()=>{
  await panel().getByText(/Token SUAT sin vencimiento programado/).waitFor();
  const calls=(await state()).calls;assert(calls.every(c=>c.path.startsWith('/graph.facebook.com/')));
  assert(!calls.some(c=>/conversations|messages|comments|adaccounts|me\/accounts|system_user_access_tokens/.test(c.path)));
 });
 await test('IG04','Renovar mediante consentimiento nuevo','Nuevo state y vencimiento tomado del SUAT, sin refresh de Instagram Login.',async()=>{
  const prior=oauth.searchParams.get('state');await mode('finite_expiry');await connect(true);assert.notEqual(oauth.searchParams.get('state'),prior);
  await panel().getByText(/Vencimiento:/).waitFor();assert(!((await state()).calls.some(c=>/refresh_access_token/.test(c.path))));await mode('normal');
 });
 await test('IG05','Panel de conexión adaptable a 1440, 768 y 390 px','Controles visibles sin desbordamiento horizontal.',async()=>{
  for(const width of[1440,768,390]){await page.setViewportSize({width,height:1000});await panel().scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(out,'capturas',`conexion-${width}.png`)});
  }await page.setViewportSize({width:1440,height:1000});
 });
 await page.goto(base+'/emprendedor/marketing');
 await test('IG06','JPG cuadrado del editor en la revisión oficial','Producto real de QA; JPG 1080; difusión manual conservada.',async()=>{
  await page.getByLabel('Producto para publicar',{exact:true}).selectOption(session.productId);
  await page.waitForFunction(()=>document.querySelector('.marketing-art')?.dataset.blocked==='false');
  assert(await button('Preparar para Instagram').isVisible());assert(await button('Copiar descripción').isVisible());assert(await button('Abrir Instagram').isVisible());
  await button('Publicar en Instagram').click();await dialog().getByText('Cuenta: @openmind_qa · JPG cuadrado 1080 × 1080').waitFor();
  const dimensions=await dialog().locator('img').evaluate(async image=>{await image.decode();return[image.naturalWidth,image.naturalHeight]});assert.deepEqual(dimensions,[1080,1080]);
 });
 await test('IG07','Editar descripción y revisar sin publicar','Preparación persistente, cero escrituras al proveedor.',async()=>{
  await dialog().getByLabel('Descripción de la publicación en Instagram').fill('Publicación sintética de QA. Algodón y diseño OpenMind.');
  await button('Revisar publicación',dialog()).click();await dialog().getByRole('status').getByText('Preparada: aún no publicada').waitFor();
  assert.equal((await state()).created,0);assert.equal((await state()).published,0);
 });
 await test('IG08','Confirmación explícita, contenedor pendiente e imagen HTTPS acotada','No media_publish hasta FINISHED; enlace público firmado entrega solo JPG.',async()=>{
  await mode('pending');await button('Confirmar publicación en Instagram',dialog()).click();await dialog().getByRole('status').getByText('Instagram está procesando la imagen').waitFor();
  const provider=await state();assert.equal(provider.created,1);assert.equal(provider.published,0);
  const image=provider.calls.find(c=>c.image_url).image_url;assert(image.startsWith(origin+'/api/instagram/imagenes/'));
  const r=await anonymous.get(image);assert.equal(r.status(),200);assert.equal(r.headers()['content-type'],'image/jpeg');
  const bytes=await r.body();assert.equal(bytes[0],255);assert.equal(bytes[1],216);fs.writeFileSync(path.join(out,'capturas','publicacion-editor.jpg'),bytes);
  assert.equal((await anonymous.get(image.replace('firma=','firma=invalid'))).status(),404);
 });
 await test('IG09','Finalización y prevención de duplicados','Una creación y una publicación remota simulada; reintentos no duplican.',async()=>{
  await mode('normal');await button('Consultar resultado en Instagram',dialog()).click();await dialog().getByRole('status').getByText(/Publicación confirmada por Instagram/).waitFor();
  const saved=(await data('publicaciones/')).resultados[0];for(let n=0;n<2;n++)await data('publicaciones/'+saved.id+'/confirmar/',{confirmar:true});
  const s=await state();assert.equal(s.created,1);assert.equal(s.published,1);
  assert.equal((await anonymous.get(s.calls.find(c=>c.image_url).image_url)).status(),404);
  await dialog().getByText('Historial de publicaciones de Instagram',{exact:true}).click();assert(await dialog().getByText(saved.descripcion,{exact:true}).count());
 });
 await test('IG10','Revisión de publicación a 390 px','Imagen y confirmaciones accesibles sin desplazamiento horizontal.',async()=>{
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'capturas','revision-390.png')});await page.setViewportSize({width:1440,height:1000});
 });
 await button('Cerrar revisión',dialog()).click();
 await test('IG11','Respuesta 500 después de aceptación y reconciliación','Resultado incierto consultable; ninguna repetición de media_publish.',async()=>{
  await button('Publicar en Instagram').click();await dialog().getByLabel('Descripción de la publicación en Instagram').fill('Segunda publicación sintética, fallo controlado después de aceptación.');
  await button('Revisar publicación',dialog()).click();await dialog().getByRole('status').getByText('Preparada: aún no publicada').waitFor();await mode('publish500');
  await button('Confirmar publicación en Instagram',dialog()).click();await dialog().getByRole('status').getByText(/Resultado sin confirmar:/).waitFor();assert.equal((await state()).published,2);
  await mode('normal');await button('Consultar resultado en Instagram',dialog()).click();await dialog().getByRole('status').getByText(/Publicación confirmada por Instagram/).waitFor();assert.equal((await state()).published,2);
 });
 await button('Cerrar revisión',dialog()).click();
 await test('IG12','Desconexión conserva perfil social e historial','Token local eliminado; perfil, Facebook e historial no se eliminan.',async()=>{
  await page.goto(base+'/emprendedor/landing#contacto-horarios');await button('Desconectar Instagram',panel()).click();await panel().getByText(/Acceso eliminado de OpenMind/).waitFor();
  assert(!(await data('estado/')).conectado);assert.equal((await data('publicaciones/')).resultados.length,2);assert(await page.getByText('Facebook',{exact:true}).count());
 });
 await test('IG13','Túnel restringido verificado desde HTTPS público','Raíz, administrador y API privada bloqueados con 404.',async()=>{
  for(const route of['/','/admin/','/api/auth/','/api/instagram/estado/','/api/instagram/oauth/iniciar/','/media/'])assert.equal((await anonymous.get(origin+route)).status(),404,route);
  assert.equal((await anonymous.post(origin+'/api/instagram/oauth/callback/',{data:{}})).status(),405);
 });
 await test('IG14','Callback inválido vuelve al panel con aviso seguro','Sin intercambio de código, sin secretos en el aviso y con opción de reautorizar.',async()=>{
  const before=(await state()).calls.length;
  await page.goto(origin+'/api/instagram/oauth/callback/?state=invalid-qa-state&code=invalid-qa-code');
  await panel().getByText('No se completó la conexión de Instagram. Vuelve a autorizar desde este botón.').waitFor();
  assert.equal((await state()).calls.length,before);
 });
 assert.equal(errors.length,0,errors.join('\n'));
 }finally{
  fs.writeFileSync(path.join(out,'pruebas','browser-errors.json'),JSON.stringify(errors,null,2));fs.writeFileSync(path.join(out,'pruebas','browser-traffic.json'),JSON.stringify(traffic,null,2));
  fs.writeFileSync(path.join(out,'pruebas','provider-observado.json'),JSON.stringify(await state(),null,2));await context.unrouteAll({behavior:'ignoreErrors'});await browser.close();await api.dispose();await anonymous.dispose();await control.dispose();
 }
 console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='aprobada').length,failed:results.filter(r=>r.status==='fallida').length,applicationErrors:errors.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
