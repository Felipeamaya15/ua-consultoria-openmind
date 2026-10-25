// QA adicional sobre el frontend completo. Escrituras exclusivas al mock Postman local.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.FEEDBACK_URL || 'http://127.0.0.1:5196', api = process.env.FEEDBACK_API || 'http://127.0.0.1:4916/openmind';
const out = process.env.FEEDBACK_OUT || path.resolve(__dirname, '../../docs/qa-final-scrum455456');
const state = async data => { const r = await fetch(api + '/__qa/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); assert(r.ok); };
const read = async () => (await (await fetch(api + '/__qa/state')).json()).data;
(async () => {
  fs.mkdirSync(out, { recursive: true }); const results = [], errors = [];
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem('token', 'qa-final-only'));
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('dialog', d => d.accept()); page.on('pageerror', e => errors.push(e.message));
  // No solicitud de escritura puede alcanzar un destino ajeno al servidor de pruebas.
  await context.route('**/*', route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !request.url().startsWith(api + '/')) return route.abort();
    return route.continue();
  });
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const visible = text => page.getByText(text, { exact: false }).first().waitFor();
  const go = route => page.goto(base + route);
  const check = async (action, expected, run) => {
    try { await run(); results.push({ action, type: 'AUTOMATIZADA_NAVEGADOR', expected, obtained: expected, status: 'APROBADO', evidence: 'frontend/tests/qa-final-browser.cjs' }); console.log('APROBADO ' + action); }
    catch (error) { results.push({ action, type: 'AUTOMATIZADA_NAVEGADOR', expected, obtained: error.message.slice(0, 700), status: 'FALLIDO' }); await page.screenshot({ path: path.join(out, `fallo-${results.length}.png`), fullPage: true }); console.log('FALLIDO ' + action + ': ' + error.message.slice(0, 450)); }
  };
  try {
    await state({ reset: true });
    await check('Producto: crear, validar, recargar y editar precios', 'Sin solicitud inválida; creación persistida y precios administrados en variantes', async () => {
      await go('/emprendedor/productos/nuevo'); await click('Guardar producto'); await visible('Ingresa el nombre del producto.');
      assert.equal((await read()).counts['POST /api/catalog/productos/crear/'] || 0, 0);
      await page.getByLabel('Nombre del producto', { exact: true }).fill('Producto nuevo QA final'); await page.getByLabel('Precio inicial (CLP)', { exact: true }).fill('9000');
      await page.getByLabel('Activo', { exact: true }).check(); await page.getByText('Variantes (0)', { exact: true }).click(); await page.getByRole('button', { name: /Agregar variante/ }).click();
      await click('Guardar producto'); await visible('Producto creado correctamente.'); assert.equal((await read()).product.variantes[0].precio, 9000);
      await page.reload(); await visible('Producto nuevo QA final'); await go('/emprendedor/productos/000000000000000000000001');
      await page.getByRole('button', {name:/^Editar precios/}).click(); await page.getByLabel('Precio de venta de variante', { exact: true }).fill('8500'); await click('Guardar producto'); await visible('Producto actualizado correctamente.'); assert.equal((await read()).product.variantes[0].precio, 8500);
    });
    await check('Marketing: personalizar, guardar, recargar y recuperar', 'Borrador y personalización conservados después de recargar', async () => {
      await state({ reset: true }); await go('/emprendedor/marketing'); await page.getByLabel('Producto para publicar', { exact: true }).selectOption('000000000000000000000001');
      await click('Textos'); await page.getByLabel('Bloque de texto', { exact: true }).selectOption('heading'); await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).fill('Texto personal QA');
      await page.getByLabel('Nombre del borrador', { exact: true }).fill('Recuperar QA'); await click('Guardar borrador'); await visible('Borrador guardado correctamente');
      await page.reload(); await click('Mis borradores'); await click('Abrir Recuperar QA'); await click('Textos'); await page.getByLabel('Bloque de texto', { exact: true }).selectOption('heading');
      assert.equal(await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).inputValue(), 'Texto personal QA'); assert.equal(await page.getByLabel('Nombre del borrador', { exact: true }).inputValue(), 'Recuperar QA');
    });
    await check('Pedidos: preparar, entregar, cancelar y recargar', 'Los mensajes y el selector coinciden con el estado persistido', async () => {
      await state({ reset: true }); await go('/emprendedor/pedidos?pedido=7');
      for (const status of ['preparando', 'enviado', 'entregado']) {
        await page.getByLabel('Estado del pedido', { exact: true }).selectOption(status); await visible('Estado del pedido actualizado'); assert.equal((await read()).orderStatus, status);
        await page.reload(); await page.getByLabel('Estado del pedido', { exact: true }).waitFor(); assert.equal(await page.getByLabel('Estado del pedido', { exact: true }).inputValue(), status);
      }
      await state({ orderStatus: 'pendiente' }); await page.reload(); await page.getByLabel('Estado del pedido', { exact: true }).selectOption('cancelado'); await visible('Pedido cancelado correctamente.'); await page.reload(); assert.equal(await page.getByLabel('Estado del pedido', { exact: true }).inputValue(), 'cancelado');
    });
    await check('Transferencias: aprobar y rechazar', 'Cada respuesta confirma el pedido correspondiente y actualiza la lista', async () => {
      const transfer = id => ({ id_pedido: id, identificador: 'QA-' + id, fecha_creacion: '2026-10-20T12:00:00Z', nombre_contacto: 'QA', correo_contacto: 'qa@example.test', monto_total: '10000.00', medio_pago: 'Transferencia', estado: 'pendiente' });
      await state({ reset: true }); await state({ transfers: [transfer(41), transfer(42)] }); await go('/emprendedor/pagos');
      await page.getByRole('row').filter({ hasText: 'QA-41' }).getByRole('button', { name: 'Aprobar pago', exact: true }).click(); await visible('Transferencia aprobada correctamente.');
      await page.getByRole('row').filter({ hasText: 'QA-42' }).getByRole('button', { name: 'Rechazar', exact: true }).click(); await visible('Transferencia rechazada correctamente.'); assert.equal((await read()).transfers.length, 0);
      await page.reload(); await visible('No hay transferencias pendientes');
    });
    await check('Entregas: guardar, recargar y recuperar de error', 'Éxito solo al persistir; fallo sin éxito anterior y reintento correcto', async () => {
      await state({ reset: true }); await go('/emprendedor/entregas'); await click('Guardar entregas'); await visible('Configuración de entregas guardada.'); await page.reload();
      await state({ writeStatus: 503 }); await click('Guardar entregas'); await visible('No se pudo guardar.'); assert.equal(await page.getByText('Configuración de entregas guardada.', { exact: true }).count(), 0);
      await state({ writeStatus: 0 }); await click('Guardar entregas'); await visible('Configuración de entregas guardada.');
    });
    await check('Contactos y exportación CSV', 'Descarga de prueba válida; un error no anuncia generación exitosa', async () => {
      await go('/emprendedor/contactos'); await page.locator('table:visible').getByText('cliente@example.test', {exact:true}).waitFor(); await page.getByRole('button', {name:/^Exportar contactos/}).click(); const pending = page.waitForEvent('download'); await click('CSV de contactos'); const download = await pending; assert.equal(await download.failure(), null);
      const file = path.join(out, 'contactos-qa.csv'); await download.saveAs(file); assert(fs.readFileSync(file, 'utf8').includes('cliente@example.test')); await visible('Archivo CSV generado');
      await state({ failExport: true }); await page.getByRole('button', {name:/^Exportar contactos/}).click(); await click('CSV de contactos'); await visible('No se pudo completar la consulta.'); assert.equal(await page.getByText('Archivo CSV generado', { exact: false }).count(), 0); await state({ failExport: false });
    });
    await check('SEO y analítica: persistencia local y fallo de cuota', 'Mensaje local veraz; datos conservados después de recargar; error sin éxito falso', async () => {
      await go('/emprendedor/seo'); await page.getByLabel('Título de la tienda en buscadores', { exact: true }).fill('SEO QA final'); await click('Guardar buscadores y medición'); await visible('guardados correctamente en este navegador.'); await page.reload(); assert.equal(await page.getByLabel('Título de la tienda en buscadores', { exact: true }).inputValue(), 'SEO QA final');
      await page.getByLabel('Título de la tienda en buscadores', { exact: true }).fill('SEO pendiente'); await page.evaluate(() => { window.qaOriginalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('ua-entrepreneur-demo-v1:')) throw new DOMException('QA', 'QuotaExceededError'); return window.qaOriginalSet.call(this, k, v); }; });
      await click('Guardar buscadores y medición'); await visible('No se pudo guardar'); assert.equal(await page.getByText('Datos para buscadores y medición guardados correctamente en este navegador.', { exact: true }).count(), 0); await page.evaluate(() => { Storage.prototype.setItem = window.qaOriginalSet; });
    });
    await check('Acceso de clientes', 'La confirmación explicita el almacenamiento local', async () => {
      await go('/emprendedor/autenticacion'); await click('Guardar opciones de acceso'); await visible('Opciones de acceso guardadas en este navegador.'); await page.reload(); await page.getByRole('heading', { name: 'Métodos de acceso', exact: true }).waitFor();
    });
    await check('Diseño: aplicar plantilla', 'Selección persistida en navegador sin cambiar contenido ni catálogo', async () => {
      await go('/emprendedor/diseno'); const before = (await read()).product; await page.getByRole('button', { name: 'Usar esta', exact: true }).first().click(); await click('Aplicar plantilla'); await visible('Plantilla seleccionada y guardada en este navegador.'); assert.deepEqual((await read()).product, before);
    });
    await check('Perfil: guardar correo y recuperar de error', 'Éxito después de confirmación; recarga persistente; error mantiene edición', async () => {
      await go('/emprendedor/perfil'); await page.getByLabel('Correo electronico', { exact: true }).fill('nuevo@example.test'); await page.getByRole('button', { name: /Guardar correo/ }).click(); await visible('Correo actualizado.'); await page.reload(); assert.equal(await page.getByLabel('Correo electronico', { exact: true }).inputValue(), 'nuevo@example.test');
      await state({ writeStatus: 409 }); await page.getByLabel('Correo electronico', { exact: true }).fill('pendiente@example.test'); await page.getByRole('button', { name: /Guardar correo/ }).click(); await visible('Revisa el nombre ingresado.'); assert.equal(await page.getByText('Correo actualizado.', { exact: true }).count(), 0); await state({ writeStatus: 0 });
    });
    await check('Pagos: respuestas mal formadas y recuperación', 'Tres pasarelas rechazan configuración vacía o tipos inválidos sin anunciar éxito', async () => {
      await state({ reset: true });
      for (const [provider, name] of [['transbank', 'Transbank'], ['paypal', 'PayPal'], ['mercadopago', 'Mercado Pago']]) {
        await go('/emprendedor/pagos'); const pattern = `**/api/catalog/tiendas/1/configuracion/${provider}/`;
        for (const data of [{}, [], { activo: false, configurado: 'incorrecto', ambiente: 'QA' }]) {
          const handler = route => route.request().method() === 'POST' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exito: true, data }) }) : route.continue();
          await page.route(pattern, handler); await click('Guardar credenciales ' + name); await visible('No pudimos confirmar la configuración guardada.');
          assert.equal(await page.getByText(`Configuración de ${name} guardada exitosamente.`, { exact: true }).count(), 0); await page.unroute(pattern, handler);
        }
        await click('Guardar credenciales ' + name); await visible(`Configuración de ${name} guardada exitosamente.`);
      }
    });
    await check('Pagos: prevención de escrituras duplicadas', 'Dos activaciones inmediatas producen una sola solicitud de guardado', async () => {
      await state({ reset: true, delay: 300 }); await go('/emprendedor/pagos');
      const button = page.getByRole('button', { name: 'Guardar credenciales Transbank', exact: true }); await button.waitFor();
      const before = (await read()).counts['POST /api/catalog/tiendas/1/configuracion/transbank/'] || 0;
      await button.evaluate(element => { element.click(); element.click(); }); await visible('Configuración de Transbank guardada exitosamente.');
      assert.equal((await read()).counts['POST /api/catalog/tiendas/1/configuracion/transbank/'], before + 1); await state({ delay: 0 });
    });
    const types = [['terms', 'terminos'], ['privacy', 'privacidad'], ['refund', 'reembolso'], ['cookies', 'cookies']];
    await state({ reset: true });
    for (const [type, slug] of types) await check('Legal ' + type + ': borrador, publicación y tienda', 'El borrador no se publica; versión confirmada tras publicar; Strict Mode sin error falso', async () => {
      await go('/emprendedor/legal/' + slug); const field = page.getByRole('textbox').first(); await field.fill('Publicación QA ' + type); await click('Guardar borrador'); await visible('Borrador guardado. Todavía no es visible');
      assert.equal((await read()).legalPages[type].published, 'Contenido legal QA'); await click('Publicar'); await visible('Página publicada. Tus clientes ya ven esta versión'); assert.equal((await read()).legalPages[type].version, 2);
      await go('/plantilla/1/legal/' + type); await visible('Publicación QA ' + type); assert.equal(await page.getByText('No pudimos cargar el contenido legal del servidor.', { exact: false }).count(), 0);
    });
    await check('Legal: historial, recuperación y restauración', 'Recuperar cambia solo el borrador; publicación y versión vigente se conservan', async () => {
      await go('/emprendedor/legal/terminos'); await page.getByRole('textbox').first().fill('Versión legal QA posterior'); await click('Publicar'); await visible('Página publicada.');
      await page.getByText('Historial publicado', { exact: true }).click(); await page.getByRole('button', { name: 'Recuperar como borrador', exact: true }).first().click(); await visible('Se recuperó la versión elegida como borrador.');
      let item = (await read()).legalPages.terms; assert.equal(item.draft, 'Publicación QA terms'); assert.equal(item.published, 'Versión legal QA posterior'); assert.equal(item.version, 3);
      await click('Restaurar plantilla'); await visible('Se restauró la plantilla base en el borrador.'); item = (await read()).legalPages.terms; assert.equal(item.published, 'Versión legal QA posterior'); assert.equal(item.version, 3);
    });
    await check('Sin excepciones React', 'Ninguna excepción no capturada durante los flujos', async () => assert.deepEqual(errors, []));
  } finally {
    fs.writeFileSync(path.join(out, 'extended-browser-results.json'), JSON.stringify(results, null, 2)); await browser.close();
  }
  if (results.some(result => result.status === 'FALLIDO')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
