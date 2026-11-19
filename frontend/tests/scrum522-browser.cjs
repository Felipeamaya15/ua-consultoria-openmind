

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const { chromium, request } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const base = process.env.SCRUM522_BROWSER_URL || 'http://localhost:5174';
const api = 'http://localhost:8001';
assert.equal(base, 'http://localhost:5174', 'Esta prueba solo admite el frontend QA aislado.');
const env = JSON.parse(fs.readFileSync(path.join(root, 'backend/.env.scrum522.postman.json'), 'utf8'));
const token = env.values.find(row => row.key === 'ownerToken').value;
const output = path.join(root, 'docs/scrum-522');
const results = [];
async function main() {
  const client = await request.newContext({ baseURL: api, extraHTTPHeaders: { Authorization: 'Token ' + token } });
  const connection = (await (await client.get('/api/tienda/correo/google/estado/')).json()).data;
  assert.equal(connection.modo, 'mailpit');
  assert.equal(connection.envio_habilitado, true);
  const store = (await (await client.get('/api/tienda/configuracion/')).json()).data;
  assert.match(store.nombre, /QA SCRUM-522/, 'Se requiere la tienda sintética de QA.');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    storageState: { cookies: [], origins: [{ origin: base, localStorage: [{ name: 'token', value: token }] }] } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const suffix = Date.now().toString(36);
  const extraContexts = [];
  async function actor(key) {
    const actorToken = key ? env.values.find(row => row.key === key).value : '';
    const actorContext = await browser.newContext({viewport:{width:1440,height:1000},
      storageState:{cookies:[],origins:actorToken?[{origin:base,localStorage:[{name:'token',value:actorToken}]}]:[]}});
    extraContexts.push(actorContext);
    const actorPage = await actorContext.newPage();
    actorPage.on('pageerror', error=>errors.push(error.message));
    return actorPage;
  }
  try {
    const buyer = await actor('verifiedBuyerToken');
    const unverified = await actor('unverifiedBuyerToken');
    const visitor = await actor();
    for(const template of [1,2,3,4]) {
      const preferences=base+'/plantilla/'+template+'/preferencias-comerciales';
      await buyer.goto(preferences);
      await buyer.getByRole('button',{name:'Guardar preferencia',exact:true}).waitFor();
      assert.equal(await buyer.getByRole('textbox',{name:'Correo electrónico',exact:true}).count(),0);
      await buyer.getByRole('checkbox',{name:/Quiero recibir promociones/}).check();
      await buyer.getByRole('button',{name:'Guardar preferencia',exact:true}).click();
      await buyer.getByText('Estado actual: Autorizado y verificado',{exact:true}).waitFor();
      await buyer.getByRole('checkbox',{name:/Quiero recibir promociones/}).uncheck();
      await buyer.getByRole('button',{name:'Guardar preferencia',exact:true}).click();
      await buyer.getByText('Estado actual: Autorización retirada',{exact:true}).waitFor();
      for(const width of [1440,768,390]) {
        await buyer.setViewportSize({width,height:1000});
        assert(await buyer.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
      }
      await buyer.screenshot({path:path.join(output,`preferencias-directas-${template}.jpg`),fullPage:false});
      results.push({flujo:'cliente verificado: activar, guardar y retirar publicidad; sin correo editable',template,estado:'aprobado'});
      await unverified.goto(preferences);
      await unverified.getByRole('button',{name:'Enviar enlace por correo',exact:true}).waitFor();
      assert.equal(await unverified.getByRole('button',{name:'Guardar preferencia',exact:true}).count(),0);
      assert(await unverified.getByRole('textbox',{name:'Correo electrónico',exact:true}).getAttribute('readonly')!==null);
      await visitor.goto(preferences);
      await visitor.getByRole('button',{name:'Enviar enlace por correo',exact:true}).waitFor();
      assert.equal(await visitor.getByRole('button',{name:'Guardar preferencia',exact:true}).count(),0);
      results.push({flujo:'cliente sin verificación y visitante conservan confirmación por enlace',template,estado:'aprobado'});
    }
    await unverified.getByRole('combobox',{name:'Qué quieres hacer',exact:true}).selectOption('confirmar');
    await unverified.getByRole('button',{name:'Enviar enlace por correo',exact:true}).click();
    await unverified.getByText(/Si corresponde, recibirás un enlace/).waitFor();
    const mailbox=await (await client.get('http://localhost:8025/api/v1/search?query=to:unverified-buyer@example.test')).json();
    assert(mailbox.messages.length,'Mailpit debe contener el enlace sintético');
    const message=await (await client.get('http://localhost:8025/api/v1/message/'+mailbox.messages[0].ID)).json();
    const link=message.Text.match(/http:\/\/localhost:5174\/plantilla\/\d\/preferencias-comerciales#accion=confirmar&token=[^\s]+/)[0];
    await unverified.goto(link);
    await unverified.getByRole('button',{name:'Confirmar autorización comercial',exact:true}).click();
    await unverified.getByRole('button',{name:'Guardar preferencia',exact:true}).waitFor();
    results.push({flujo:'confirmación real del enlace de Mailpit acredita correo propio y habilita preferencia directa',estado:'aprobado'});

    await page.goto(base+'/emprendedor/contactos');
    await page.getByRole('textbox',{name:'Buscar contacto',exact:true}).fill('qa-filter-');
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await page.getByText('24 registros · Página 1 de 2',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Siguiente',exact:true}).click();
    await page.getByText('24 registros · Página 2 de 2',{exact:true}).waitFor();
    assert.equal(await page.getByRole('rowheader',{name:'qa-filter-00@example.test',exact:true}).count(),0);
    await page.getByRole('button',{name:'Más filtros',exact:true}).click();
    await page.getByRole('textbox',{name:'Último pedido desde (DD/MM/AAAA)',exact:true}).fill('14/11/2026');
    await page.getByRole('textbox',{name:'Último pedido hasta (DD/MM/AAAA)',exact:true}).fill('14/11/2026');
    await page.getByRole('combobox',{name:'Consentimiento comercial',exact:true}).selectOption('pendiente');
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await page.getByText('12 registros · Página 1 de 1',{exact:true}).waitFor();
    for(const value of await page.getByRole('rowheader').allTextContents())assert.match(value,/qa-filter-(0\d|1[01])@example\.test/);
    await page.getByRole('button',{name:'Limpiar',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'Buscar contacto',exact:true}).inputValue(),'');
    await page.getByRole('rowheader',{name:'cliente-sintetico@example.test',exact:true}).waitFor();
    results.push({flujo:'Contactos: búsqueda, fecha del último pedido, consentimiento, paginación y limpieza',estado:'aprobado'});

    await page.goto(base + '/emprendedor/actividades');
    await page.getByRole('button', { name: 'Abrir consulta y responder', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Asunto de la respuesta', exact: true }).fill('SCRUM522 respuesta E2E ' + suffix);
    await page.getByRole('textbox', { name: 'Respuesta a la consulta', exact: true }).fill('Respuesta sintética: los materiales se confirmarán durante el taller.');
    await page.getByRole('button', { name: 'Revisar envío', exact: true }).click();
    await page.getByRole('dialog', { name: 'Revisar respuesta antes de enviar', exact: true }).getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Aceptada por el transporte' }).waitFor();
    results.push({ flujo: 'respuesta desde panel con historial', estado: 'aprobado' });
    await page.screenshot({ path: path.join(output, 'consulta-respondida-qa.jpg'), fullPage: false });
    await page.getByRole('dialog', { name: 'Detalle de la consulta', exact: true }).getByRole('button', { name: 'Cerrar', exact: true }).click();

    await page.goto(base + '/emprendedor/contactos');
    await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
    await page.getByRole('combobox', { name: 'Consentimiento comercial', exact: true }).selectOption({ label: 'Autorizado expresamente' });
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('button', { name: 'Exportar contactos ▾', exact: true }).click();
    const downloaded = page.waitForEvent('download', { timeout: 15000 });
    await page.getByRole('button', { name: 'CSV de marketing autorizado', exact: true }).click();
    const file = await downloaded;
    assert.match(file.suggestedFilename(), /^contactos-marketing-.*\.csv$/);
    const csv = fs.readFileSync(await file.path(), 'utf8');
    assert.match(csv, /cliente-sintetico@example\.test/);
    assert.doesNotMatch(csv, /cantidad_pedidos|ultimo_pedido|owner-browser@example\.test/i);
    results.push({ flujo: 'descarga CSV de contactos autorizados', estado: 'aprobado' });

    await page.getByRole('tab', { name: 'Campañas', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nombre del borrador', exact: true }).fill('E2E QA ' + suffix);
    await page.getByRole('textbox', { name: 'Asunto de la campaña', exact: true }).fill('SCRUM522 campaña E2E ' + suffix);
    await page.getByRole('textbox', { name: 'Contenido de la campaña', exact: true }).fill('Promoción sintética de QA. Este mensaje solo se captura en Mailpit.');
    await page.getByRole('checkbox', { name: 'cliente-sintetico@example.test', exact: true }).check();
    await page.getByRole('textbox', { name: 'Imagen de campaña (URL HTTP o HTTPS)', exact: true }).fill(api + '/media/landing/carrusel/qa-scrum522-0.png');
    await page.getByRole('textbox', { name: 'Texto del botón', exact: true }).fill('Explorar catálogo QA');
    await page.getByRole('textbox', { name: 'Enlace a una página de la tienda (opcional)', exact: true }).fill('/plantilla/1/catalogo');
    await page.getByRole('combobox', { name: 'Producto de la tienda (opcional)', exact: true }).selectOption({ label: 'Producto sintético QA 1 · $9.900' });
    const savedResponse=page.waitForResponse(response=>response.url()===api+'/api/tienda/campanas/'&&response.request().method()==='POST');
    await page.getByRole('button', { name: 'Guardar y previsualizar', exact: true }).click();
    const savedCampaign=(await (await savedResponse).json()).data;
    await page.frameLocator('iframe[title="Correo promocional generado por el servidor"]').getByRole('heading', { name: 'Producto sintético QA 1', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Confirmar envío promocional', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirmar envío de campaña', exact: true }).getByRole('button', { name: 'Sí, confirmar envío', exact: true }).click();
    await page.getByText('Aceptada por el proveedor: 1', { exact: true }).waitFor();
    results.push({ flujo: 'borrador, producto, vista previa, confirmación y envío real a Mailpit', estado: 'aprobado' });
    await page.getByRole('button', { name: 'Ver registro de intentos', exact: true }).click();
    await page.getByText('1 intentos registrados. No hay métricas de apertura o lectura.', { exact: true }).waitFor();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      assert(geometry.content <= geometry.width + 1, 'La campaña tiene desbordamiento horizontal.');
      await page.screenshot({ path: path.join(output, `campana-e2e-${width}.jpg`), fullPage: false });
      results.push({ flujo: 'campaña adaptable', width, estado: 'aprobado' });
    }
    await page.getByRole('dialog', { name: 'Registro de envíos de la campaña', exact: true }).getByRole('button', { name: 'Cerrar', exact: true }).click();
    assert.equal((await client.post('/api/tienda/campanas/'+savedCampaign.id+'/procesar/',{data:{}})).status(),200);
    const messages=await (await client.get('http://localhost:8025/api/v1/search?query='+encodeURIComponent('subject:"SCRUM522 campaña E2E '+suffix+'"'))).json();
    assert.equal(messages.messages.length,1,'Procesar de nuevo no duplica el correo');
    const delivered=await (await client.get('http://localhost:8025/api/v1/message/'+messages.messages[0].ID)).json();
    const unsubscribe=delivered.Text.match(/http:\/\/localhost:8001\/api\/tienda\/campanas\/baja\/\?token=[^\s]+/)[0];
    await visitor.goto(unsubscribe);
    await visitor.getByRole('button',{name:'Cancelar suscripción',exact:true}).click();
    await visitor.getByText('Suscripción cancelada. Ya no eres elegible para promociones de esta tienda.',{exact:true}).waitFor();
    const withdrawn=await (await client.get('/api/tienda/contactos/?q=cliente-sintetico&consentimiento=retirado')).json();
    assert.equal(withdrawn.data[0].consentimiento,'retirado');
    results.push({flujo:'envío único en Mailpit, repetición sin duplicado y baja firmada actualiza Contactos',estado:'aprobado'});
    await page.goto(base + '/emprendedor/contactos?vista=campanas');
    await page.getByRole('heading',{name:'Correo para campañas',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Conectar Gmail',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Enviar prueba controlada',exact:true}).count(),0);
    await page.getByRole('link',{name:'Conectar en Página principal → Negocio',exact:true}).click();
    await page.getByRole('heading', { name: 'Correo del emprendimiento', exact: true }).waitFor();
    const authorization=page.getByRole('checkbox',{name:'Autorizo el uso de esta cuenta para enviar campañas publicitarias a clientes autorizados y responder consultas de servicios y talleres',exact:true});
    assert.equal(await authorization.isChecked(),false);
    assert.equal(await page.getByRole('button',{name:'Conectar Gmail',exact:true}).isDisabled(),true);
    await page.getByRole('textbox',{name:'Correo del negocio',exact:true}).fill('owner-browser@example.test');
    const save=page.getByRole('button',{name:'Guardar cambios',exact:true});
    if(await save.isEnabled())await save.click();
    await authorization.check();
    await context.route(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth(?:\?|$)/, route=>route.fulfill({contentType:'text/html',body:'<h1>Proveedor simulado exclusivo de QA</h1>'}));
    const popupEvent=context.waitForEvent('page');
    await page.getByRole('button',{name:'Conectar Gmail',exact:true}).click();
    const popup=await popupEvent;await popup.waitForLoadState('domcontentloaded');
    const state=new URL(popup.url()).searchParams.get('state');assert(state);
    const simulated=spawnSync('docker',['exec','-e','SCRUM522_QA_OAUTH_STATE='+state,'scrum522_qa_final','python','manage.py','shell','-c',"exec(open('scripts/qa_scrum522_oauth.py').read())"],{encoding:'utf8',timeout:30000});
    assert.equal(simulated.status,0,simulated.stderr);await popup.close();
    await page.getByRole('button',{name:'Actualizar conexión',exact:true}).click();
    await page.getByRole('button',{name:'Reconectar Gmail',exact:true}).waitFor();
    await page.getByRole('button', { name: 'Enviar prueba controlada', exact: true }).click();
    await page.getByText('Prueba aceptada por el proveedor. Esto no acredita entrega al buzón.', { exact: true }).waitFor();
    await page.getByRole('button',{name:'Enviar prueba controlada',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'negocio-gmail-qa.jpg'),fullPage:false});
    results.push({ flujo: 'Negocio: autorización inicialmente desmarcada, inicio OAuth real, callback con proveedor simulado y prueba SMTP Mailpit', estado: 'aprobado' });
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Desconectar cuenta',exact:true}).click();
    await page.getByText('Cuenta desconectada de la tienda.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Conectar Gmail',exact:true}).waitFor();
    assert.equal(await authorization.isChecked(),false);
    results.push({flujo:'desconexión persistida y reconexión exige nueva autorización expresa',estado:'aprobado'});
    await page.goto(base + '/emprendedor/correos');
    await page.getByRole('button', { name: 'Guardar correos automáticos', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Correo del emprendimiento', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Enviar prueba controlada', exact: true }).count(), 0);
    results.push({ flujo: 'plantillas transaccionales conservadas sin panel Gmail en Correos', estado: 'aprobado' });
    await page.screenshot({ path: path.join(output, 'correos-qa.jpg'), fullPage: false });
    await page.goto(base + '/emprendedor/marketing');
    await page.getByRole('tab', { name: 'Difusión', exact: true }).click();
    await page.getByRole('heading', { name: 'Difusión manual', exact: true }).waitFor();
    results.push({ flujo: 'Marketing y difusión existentes conservados', estado: 'aprobado' });
    for (const template of [1, 2, 3, 4]) {
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(base + '/plantilla/' + template);
        await page.locator('main').waitFor();
        await page.screenshot({ path: path.join(output, `plantilla-${template}-${width}.jpg`), fullPage: false });
        const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
        assert(geometry.content <= geometry.width + 1, `Desbordamiento en plantilla ${template} a ${width}.`);
        results.push({ flujo: 'plantilla adaptable', template, width, estado: 'aprobado' });
      }
    }
    assert.deepEqual(errors, [], 'Se detectaron errores JavaScript visibles en el flujo.');
    console.log(`SCRUM-522 navegador: ${results.length} comprobaciones aprobadas.`);
  } finally {
    fs.writeFileSync(path.join(output, 'navegador-resultados.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
    for(const actorContext of extraContexts)await actorContext.close();
    await context.close(); await browser.close(); await client.dispose();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
