// Real browser -> isolated Django -> dedicated PostgreSQL/MongoDB. No external publishing.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium, request } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.SCRUM521_QA_OUTPUT;
if (!out || path.resolve(out).startsWith(path.resolve(__dirname, '../..') + path.sep)) throw new Error('SCRUM521_QA_OUTPUT debe apuntar fuera del repositorio.');
const base = 'http://127.0.0.1:5211', api = 'http://127.0.0.1:8002';
const session = JSON.parse(fs.readFileSync(path.join(out, 'qa-session.json'), 'utf8'));
const results = [], external = [], mutations = [];
async function main() {
  const client = await request.newContext({ baseURL: api, extraHTTPHeaders: { Authorization: `Token ${session.token}` } });
  const store = (await (await client.get('/api/tienda/configuracion/')).json()).data;
  assert.equal(store.nombre, 'Marketing QA SCRUM-521', 'Solo se permite la tienda sintética.');
  assert.equal((await client.delete(`/api/landing/biblioteca/${session.lockedId}/`)).status(), 400);
  assert.equal((await client.get(`/api/landing/biblioteca/${session.libraryId}/?tienda_id=999`)).status(), 400);
  const anonymous = await request.newContext({ baseURL: api });
  assert.equal((await anonymous.get(`/api/landing/biblioteca/${session.libraryId}/`)).status(), 401);
  assert.equal((await anonymous.get(`/api/landing/biblioteca/${session.libraryId}/imagen/`)).status(), 401);
  results.push({ check: 'API real: borrado en uso, tenant y privacidad', status: 'passed' });
  const browser = await chromium.launch({ headless: true, channel: process.env.DASHBOARD_BROWSER_CHANNEL || 'msedge' });
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
      await context.addInitScript(token => localStorage.setItem('token', token), session.token);
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (!['127.0.0.1', 'localhost'].includes(url.hostname) && /^https?:/.test(url.protocol)) { external.push(url.origin); return route.abort(); }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) mutations.push({ path: url.pathname, method: route.request().method() });
        return route.continue();
      });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      const tab = name => page.getByRole('tab', { name: new RegExp(name) }).click();
      const capture = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(out, name), fullPage: true }); };
      const noOverflow = async name => {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: ${name} sin desplazamiento horizontal`);
        assert(await page.locator('.marketing-section-navigation [role=tablist]').evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${width}px: apartados visibles sin scroll horizontal`);
      };
      await page.goto(base + '/emprendedor/marketing');
      await page.getByLabel('Producto para publicar', { exact: true }).waitFor();
      await tab('Biblioteca multimedia');
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await page.getByText(/Página 2/).waitFor();
      const search = page.getByLabel('Buscar recurso multimedia', { exact: true });
      await search.fill('Imagen privada QA');
      const resource = page.locator('.media-resource-card').filter({ has: page.getByRole('heading', { name: 'Imagen privada QA', exact: true }) });
      await resource.getByRole('img', { name: 'Imagen privada QA', exact: true }).waitFor();
      await page.getByLabel('Filtrar tipo de recurso').selectOption('imagen');
      await page.getByLabel('Estado del recurso').selectOption('activo');
      await page.getByLabel('Ordenar recursos').selectOption('nombre');
      await resource.waitFor();
      await resource.getByRole('img', { name: 'Imagen privada QA', exact: true }).waitFor();
      await resource.getByRole('img', { name: 'Imagen privada QA', exact: true }).evaluate(image => image.decode());
      await noOverflow('biblioteca');
      await capture(`biblioteca-${width}.png`);
      await search.fill('no existe QA');
      await page.getByText('No hay recursos para estos filtros', { exact: true }).waitFor();
      await search.fill('Imagen privada QA');
      await resource.getByRole('button', { name: 'Usar imagen en publicación' }).click();
      const art = page.locator('.marketing-art');
      await art.waitFor().catch(async error => { await page.screenshot({ path: path.join(out, 'browser-failure.png'), fullPage: true }); fs.writeFileSync(path.join(out, 'browser-failure-state.txt'), await page.locator('body').innerText()); throw error; });
      assert((await art.innerText()).includes('Imagen privada QA'));
      const privateDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar PNG', exact: true }).click();
      await (await privateDownload).saveAs(path.join(out, `imagen-privada-${width}.png`));
      await page.getByLabel('Nombre del borrador').fill(`Privada QA ${width}`);
      await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
      await page.getByText('Borrador guardado correctamente en este navegador. No está publicado.', { exact: true }).waitFor();
      const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('ua-marketing-drafts')).map(([, value]) => value).join(''));
      assert(!stored.includes('data:image') && !stored.includes(session.token));
      await page.getByRole('button', { name: 'Mis borradores', exact: true }).click();
      await page.getByRole('button', { name: `Abrir Privada QA ${width}`, exact: true }).click();
      await art.waitFor();
      await tab('Biblioteca multimedia');
      await page.getByRole('button', { name: 'Imágenes del catálogo', exact: true }).click();
      await page.getByLabel('Buscar imágenes del catálogo').fill('QA-ROJO');
      await page.getByLabel('Variante de Bolso QA SCRUM-521').selectOption('QA-ROJO');
      await page.getByRole('button', { name: 'Usar imagen 2 de Bolso QA SCRUM-521', exact: true }).click();
      await noOverflow('catálogo');
      const catalogImage = await page.locator('.media-catalog-preview img').getAttribute('src');
      await capture(`catalogo-${width}.png`);
      await page.getByRole('button', { name: 'Preparar publicación de Bolso QA SCRUM-521', exact: true }).click();
      await art.waitFor();
      assert.equal(await page.getByLabel('Variante de la publicación').inputValue(), 'QA-ROJO');
      assert((await art.innerText()).includes('$27.000'));
      assert.equal(await art.locator('.marketing-art-media img').getAttribute('src'), catalogImage);
      await page.getByRole('button', { name: 'Textos', exact: true }).click();
      await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).fill('Descubre nuestra colección');
      for (const [format, name] of [['square', 'Publicación cuadrada'], ['story', 'Historia vertical'], ['banner', 'Banner horizontal']]) {
        await page.getByRole('radio', { name: new RegExp(name) }).check();
        await page.waitForFunction(() => document.querySelector('.marketing-art')?.dataset.blocked === 'false');
        await noOverflow(format);
        await capture(`publicacion-${format}-${width}.png`);
      }
      for (const type of ['PNG', 'JPG']) {
        const pending = page.waitForEvent('download');
        await page.getByRole('button', { name: `Descargar ${type}`, exact: true }).click();
        const download = await pending;
        const filename = path.join(out, `publicacion-${width}.${type.toLowerCase()}`);
        await download.saveAs(filename);
        assert(fs.statSync(filename).size > 1000);
      }
      await tab('Redes sociales');
      await page.getByText('Sin perfil configurado', { exact: false }).first().waitFor();
      assert.equal(await page.getByRole('button', { name: /Publicar ahora/ }).count(), 0);
      await noOverflow('redes');
      await tab('Difusión');
      await page.getByLabel('Tipo de contenido', { exact: true }).selectOption('Talleres');
      await page.getByRole('button', { name: /Taller QA publicado/ }).click();
      await page.getByRole('button', { name: 'Preparar imagen 1:1', exact: true }).click();
      await art.waitFor();
      assert((await art.innerText()).includes('Taller QA publicado'));
      await noOverflow('taller');
      await capture(`taller-${width}.png`);
      await tab('Difusión');
      await page.getByLabel('Tipo de contenido', { exact: true }).selectOption('Servicios');
      await page.getByRole('button', { name: /Servicio QA publicado/ }).click();
      await page.getByRole('button', { name: 'Preparar imagen 9:16', exact: true }).click();
      await art.waitFor();
      assert((await art.innerText()).includes('Servicio QA publicado'));
      await noOverflow('servicio');
      if (width === 1440) {
        await tab('Biblioteca multimedia');
        const pattern = '**/api/landing/biblioteca/?*';
        const unavailable = route => route.fulfill({ status: 503, json: { exito: false, mensaje: 'Biblioteca QA temporalmente no disponible' } });
        await context.route(pattern, unavailable);
        await page.getByRole('button', { name: 'Recursos guardados', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'El servicio no está disponible en este momento.' }).waitFor();
        await context.unroute(pattern, unavailable);
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await resource.waitFor();
        results.push({ check: 'Biblioteca: error 503 inyectado en transporte local y recuperación contra API real', status: 'passed' });
      }
      assert.deepEqual(errors, []);
      results.push({ width, check: 'biblioteca, filtros, vacíos, imagen privada, borrador, catálogo, variante, imagen, edición, 3 formatos, PNG/JPG, redes, taller y servicio', status: 'passed' });
      await context.close();
    }
    assert(mutations.every(entry => entry.path === '/api/auth/logout/'), JSON.stringify(mutations));
    results.push({ check: 'sin escrituras de catálogo, correo, campañas ni publicaciones externas desde el navegador', status: 'passed' });
  } finally { await browser.close(); await client.dispose(); await anonymous.dispose(); }
}
main().then(() => { fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ results, externalRequestsBlocked: [...new Set(external)], mutations }, null, 2)); console.log(JSON.stringify(results, null, 2)); }).catch(error => { fs.writeFileSync(path.join(out, 'browser-failure.txt'), error.stack); console.error(error); process.exitCode = 1; });
