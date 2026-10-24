// Frontend completo en Vite, servicios reales contra la simulación local de Postman.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.FEEDBACK_URL || 'http://127.0.0.1:5195', api = process.env.FEEDBACK_API || 'http://127.0.0.1:4915/openmind';
const out = process.env.FEEDBACK_OUT || path.resolve(__dirname, '../../docs/scrum455456/evidence');
const id = '000000000000000000000001';
const results = [];
async function state(value) { const r = await fetch(api + '/__qa/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); assert(r.ok); }
async function readState() { return (await (await fetch(api + '/__qa/state')).json()).data; }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('token', 'qa-only'));
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.accept());
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const text = value => page.getByText(value, { exact: false }).first().waitFor();
  const check = async (name, expected, action) => {
    try { await action(); results.push({ action: name, expected, obtained: expected, status: 'APROBADO' }); console.log('APROBADO ' + name); }
    catch (error) { results.push({ action: name, expected, obtained: error.message.slice(0, 500), status: 'FALLIDO' }); await page.screenshot({ path: path.join(out, `fallo-${results.length}.png`), fullPage: true }); console.log('FALLIDO ' + name + ': ' + error.message.slice(0, 400)); }
  };
  try {
    await state({ reset: true });
    await check('Guardar negocio', 'Confirmación visible, hora y nombre persistido en el servidor simulado', async () => {
      await page.goto(base + '/emprendedor/landing'); await page.getByLabel('Nombre de la tienda (obligatorio)', { exact: true }).fill('Negocio guardado QA');
      await click('Guardar cambios'); await text('Información de tu tienda guardada correctamente.'); await text('Guardado a las');
      assert.equal((await readState()).business.nombre, 'Negocio guardado QA'); await page.screenshot({ path: path.join(out, 'negocio-1440.png'), fullPage: true });
    });
    await check('Fallo al guardar negocio', 'Error de validación sin confirmación falsa y edición conservada', async () => {
      await state({ failBusiness: true }); await page.getByLabel('Nombre de la tienda (obligatorio)', { exact: true }).fill('Pendiente QA'); await click('Guardar cambios'); await text('Revisa el nombre ingresado.');
      assert.equal(await page.getByText('Información de tu tienda guardada correctamente.', { exact: true }).count(), 0); assert.equal(await page.getByLabel('Nombre de la tienda (obligatorio)', { exact: true }).inputValue(), 'Pendiente QA');
      await state({ failBusiness: false }); await click('Guardar cambios'); await text('Información de tu tienda guardada correctamente.');
    });
    await check('Guardar portada y evitar duplicados', 'Una sola escritura y confirmación después de la respuesta', async () => {
      await page.getByRole('tab', { name: 'Portada', exact: true }).click(); await page.getByLabel('Título principal', { exact: true }).fill('Portada QA actualizada');
      const before = (await readState()).counts['PUT /api/landing/configuracion/'] || 0; await state({ delay: 250 });
      await click('Guardar cambios'); assert(await page.getByRole('button', { name: 'Guardando…', exact: true }).isDisabled());
      assert.equal(await page.getByText('Cambios de la página principal guardados correctamente.', { exact: true }).count(), 0);
      await text('Cambios de la página principal guardados correctamente.'); const after = await readState(); assert.equal(after.counts['PUT /api/landing/configuracion/'], before + 1); assert.equal(after.landing.titulo, 'Portada QA actualizada'); await state({ delay: 0 });
    });
    await check('Guardado parcial negocio/portada', 'Negocio confirmado; portada pendiente sin perder borrador', async () => {
      await page.getByLabel('Título principal', { exact: true }).fill('Portada pendiente QA'); await page.getByRole('tab', { name: 'Negocio', exact: true }).click(); await page.getByLabel('Nombre de la tienda (obligatorio)', { exact: true }).fill('Negocio parcial QA');
      await state({ failLanding: true }); await click('Guardar cambios'); await text('La información del negocio se guardó. El contenido sigue pendiente.');
      assert.equal((await readState()).business.nombre, 'Negocio parcial QA'); await page.getByRole('tab', { name: 'Portada', exact: true }).click(); assert.equal(await page.getByLabel('Título principal', { exact: true }).inputValue(), 'Portada pendiente QA');
      await state({ failLanding: false }); await click('Guardar cambios'); await text('Cambios de la página principal guardados correctamente.');
    });
    await check('Marketing escritorio', 'Una barra accesible y confirmación local sin publicar', async () => {
      await page.goto(base + '/emprendedor/marketing'); await page.getByLabel('Producto para publicar', { exact: true }).selectOption(id); await page.getByLabel('Nombre del borrador', { exact: true }).fill('Borrador QA'); await click('Guardar borrador');
      await text('Borrador guardado correctamente en este navegador. No está publicado.'); assert.equal(await page.getByRole('button', { name: 'Guardar borrador', exact: true }).count(), 1); assert(await page.getByRole('button', { name: 'Guardar borrador', exact: true }).isDisabled());
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('ua-marketing-drafts-v1:')))).drafts.length), 1);
      await page.screenshot({ path: path.join(out, 'marketing-1440.png'), fullPage: true });
    });
    await check('Marketing fallo de almacenamiento', 'Aviso de error, sin éxito anterior, edición y borrador conservados', async () => {
      await page.getByLabel('Nombre del borrador', { exact: true }).fill('Edición sin guardar QA');
      assert.equal(await page.getByText('Borrador guardado correctamente en este navegador. No está publicado.', { exact: true }).count(), 0);
      await page.evaluate(() => { window.qaSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('ua-marketing-drafts-v1:')) throw new DOMException('QA cuota', 'QuotaExceededError'); return window.qaSetItem.call(this, k, v); }; });
      await click('Guardar borrador'); await text('No se pudo guardar: el navegador no tiene espacio o bloquea el almacenamiento.'); assert.equal(await page.getByText('Borrador guardado correctamente en este navegador. No está publicado.', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Nombre del borrador', { exact: true }).inputValue(), 'Edición sin guardar QA'); await page.evaluate(() => { Storage.prototype.setItem = window.qaSetItem; });
      await click('Guardar borrador'); await text('Borrador guardado correctamente en este navegador. No está publicado.');
    });
    await check('Marketing móvil 375', 'Acciones visibles al personalizar, sin desbordamiento horizontal', async () => {
      await page.setViewportSize({ width: 375, height: 900 }); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const box = await page.getByRole('button', { name: 'Guardar borrador', exact: true }).boundingBox(); assert(box && box.y >= 0 && box.y + box.height <= 900);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(out, 'marketing-375.png'), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await check('Editar producto y precio por variante', 'Producto actualizado y precio de variante intacto', async () => {
      await page.goto(base + `/emprendedor/productos/${id}`); await page.getByLabel('Nombre del producto', { exact: true }).fill('Producto editado QA'); await click('Guardar producto'); await text('Producto actualizado correctamente.'); assert.equal((await readState()).product.variantes[0].precio, 10000);
    });
    await check('Desactivar producto', 'Confirmación y desactivación deshabilitada después de persistir', async () => {
      await state({ delay: 150 }); await click('Desactivar'); await text('Producto desactivado correctamente.'); assert(await page.getByRole('button', { name: 'Desactivado', exact: true }).isDisabled()); assert.equal((await readState()).product.activo, false); await state({ delay: 0 });
    });
    await check('Promociones crear, editar, activar y eliminar', 'Una confirmación por operación después de persistir', async () => {
      await page.goto(base + '/emprendedor/promociones'); await page.getByRole('button', { name: /Nueva promoción$/ }).click();
      await page.getByLabel('Nombre interno', { exact: true }).fill('Campaña QA'); await page.getByLabel('Código de descuento (obligatorio)', { exact: true }).fill('QA10'); await page.getByLabel('Valor (%)', { exact: true }).fill('10');
      await click('Guardar promoción'); await text('Promoción creada correctamente.');
      await click('Editar'); await page.getByLabel('Nombre interno', { exact: true }).fill('Campaña editada QA'); await click('Guardar promoción'); await text('Promoción actualizada correctamente.');
      await page.getByLabel('Activar Campaña editada QA', { exact: true }).locator('..').locator('..').click(); await text('desactivada.'); assert.equal((await readState()).promotions[0].active, false);
      await click('Eliminar'); await text('eliminada correctamente.'); assert.equal((await readState()).promotions.length, 0);
    });
    await check('Estado del pedido y correo fallido', 'Estado confirmado y fallo del aviso comunicados juntos', async () => {
      await state({ emailFailed: true }); await page.goto(base + '/emprendedor/pedidos?pedido=7'); await page.getByLabel('Estado del pedido', { exact: true }).selectOption('enviado'); await text('Estado del pedido actualizado a «Despachado».'); await text('No se pudo enviar el aviso de despacho al comprador.'); assert.equal((await readState()).orderStatus, 'enviado');
    });
    await check('Legales administración y error de servicio', 'Carga las cuatro páginas; error comprensible al no estar disponible', async () => {
      await page.goto(base + '/emprendedor/legal/terminos'); await page.getByRole('textbox').first().waitFor(); await text('Contenido legal QA');
      await state({ failLegal: true }); await page.reload(); await text('No pudimos cargar el contenido legal del servidor.'); await state({ failLegal: false });
    });
    await check('Correos guardados y fallo de guardado', 'Confirmación tras persistir; se limpia al fallar y no se envían correos', async () => {
      await page.goto(base + '/emprendedor/correos'); await page.getByLabel('Asunto', { exact: true }).fill('Asunto editado QA');
      await click('Guardar correos automáticos'); await text('Plantillas guardadas.'); assert.equal((await readState()).emailTemplates.order_received.subject, 'Asunto editado QA');
      await page.getByLabel('Asunto', { exact: true }).fill('Asunto pendiente QA'); await state({ failEmails: true }); await click('Guardar correos automáticos'); await text('El servicio no está disponible');
      assert.equal(await page.getByText('Plantillas guardadas.', { exact: false }).count(), 0); await state({ failEmails: false });
    });
    await check('Configuración de pagos', 'Guardado confirmado y fallo del servidor sin aviso de éxito ni transacción', async () => {
      await page.goto(base + '/emprendedor/pagos'); await click('Guardar credenciales Transbank'); await text('Configuración de Transbank guardada exitosamente.');
      await state({ failPayment: true }); await click('Guardar credenciales Transbank'); await text('El servicio no está disponible'); assert.equal(await page.getByText('Configuración de Transbank guardada exitosamente.', { exact: true }).count(), 0); await state({ failPayment: false });
    });
    await check('Sin fallos React en los flujos', 'Ninguna excepción de página', async () => assert.deepEqual(errors, []));
  } finally {
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(results, null, 2)); await browser.close();
  }
  if (results.some(result => result.status === 'FALLIDO')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
