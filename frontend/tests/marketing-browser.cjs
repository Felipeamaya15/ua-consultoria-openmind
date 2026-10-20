// Aplicación real en Edge con API interceptada y fixture gráfica de QA. No escribe datos comerciales.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MARKETING_TEST_URL || 'http://127.0.0.1:5173';
const fixtures = path.resolve(__dirname, '../../docs/marketing-parte1/evidencias');
const reportFixtures = process.env.REPORTS_FIXTURE_DIR ? path.resolve(process.env.REPORTS_FIXTURE_DIR) : path.resolve(fixtures, '../../mejoras-informes-configuracion/evidencias');
const out = process.env.MARKETING_EVIDENCE_DIR ? path.resolve(process.env.MARKETING_EVIDENCE_DIR) : fixtures;
fs.mkdirSync(out, { recursive: true });
const image = 'data:image/png;base64,' + fs.readFileSync(path.join(fixtures, 'producto-qa.png')).toString('base64');
const pid = n => n.toString(16).padStart(24, '0');
const variant = (sku, price, stock = 3, offer = null) => ({ sku, precio: price, stock, precio_oferta: offer, atributos_variante: [{ etiqueta: 'Color', clave: 'color', valor: sku }] });
const productsFixture = () => [
  { id: pid(1), nombre: 'Mochila de prueba para todos los días', descripcion: 'Material resistente para acompañarte cada día.', categoria: 'Accesorios', activo: true, imagenes: [image, 'http://127.0.0.1:8000/media/logo-qa.png'], variantes: [variant('AZUL', 30000, 3, 24000), variant('ROJO', 32000), variant('AGOTADA', 500, 0, 1), { ...variant('INACTIVA', 500, 3, 1), es_activa: false }] },
  { id: pid(2), nombre: 'Producto de prueba sin descuento', categoria: 'Accesorios', activo: true, imagenes: [image], variantes: [variant('NORMAL', 15000)] },
  { id: pid(3), nombre: 'Producto inactivo', categoria: 'Accesorios', activo: false, imagenes: [image], variantes: [variant('INACTIVO', 100)] },
  { id: pid(4), nombre: 'Producto agotado', categoria: 'Accesorios', activo: true, imagenes: [image], variantes: [variant('AGOTADO', 100, 0)] },
  { id: pid(5), nombre: 'Producto de prueba sin imagen', categoria: 'Accesorios', activo: true, imagenes: [], variantes: [variant('TEXTO', 25000)] },
  { id: pid(6), nombre: 'Producto con precio inválido', categoria: 'Accesorios', activo: true, imagenes: [], variantes: [variant('INVALIDO', null)] },
  { id: pid(7), nombre: 'Producto con imagen inaccesible', categoria: 'Accesorios', activo: true, imagenes: ['http://127.0.0.1:8000/media/no-existe-qa.png'], variantes: [variant('IMAGEN', 11000)] },
  { id: pid(8), nombre: 'Nombre extenso de producto de prueba con materiales y características especiales para verificar el ajuste del texto sin deformar las imágenes ni desbordar la composición visual seleccionada', categoria: 'Colección de prueba con categoría extensa', activo: true, imagenes: [image], variantes: [variant('PRUEBA-LARGA', 12345678.5, 3, 9876543.25)] },
  ...(process.env.MARKETING_EDITOR_TESTS === '1' ? [{ id: pid(9), nombre: 'Producto con documento excepcionalmente extenso '.repeat(100), categoria: '', activo: true, imagenes: [image], variantes: [variant('EXTREMO', 15000)] }] : []),
];
const envelope = data => ({ exito: true, mensaje: '', data });
const settle = async page => page.locator('.marketing-preview-empty, .marketing-art').first().waitFor();

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.DASHBOARD_BROWSER_CHANNEL || 'msedge' });
  try {
    for (const width of [375, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      let products = productsFixture(), catalogFail = false, brandFail = false, logo = null, failLogo = false;
      let storeName = 'Tienda QA OpenMind';
      let delayCatalog = true, releaseCatalog;
      const gate = new Promise(resolve => { releaseCatalog = resolve; });
      const requests = [], errors = [], serverPromotions = [];
      await context.addInitScript(() => {
        localStorage.setItem('token', 'marketing-qa-owner');
        for (const apiBaseUrl of ['http://localhost:8000', 'http://127.0.0.1:8000']) {
          const identity = { apiBaseUrl, storeId: '1' };
          const config = { name: 'NO USAR NOMBRE LOCAL', logo: '/NO-USAR-LOGO-LOCAL.png', template: 'minimal',
            promotions: [{ id: 'demo', name: 'NO PUBLICAR DEMOSTRACION', active: true, code: 'CODIGOLOCAL', type: 'percentage', value: 99 }],
            themeEditor: { minimal: { visualConfig: { global: { colors: { primary: '#184b45', secondary: '#f4f0e6' } } } } } };
          const storageKey = `ua-entrepreneur-demo-v1:store:${encodeURIComponent(apiBaseUrl)}:1`;
          if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify({ version: 1, identity, config }));
        }
      });
      await context.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), p = url.pathname;
        requests.push({ method: request.method(), p, headers: request.headers(), query: url.search });
        let data = {};
        if (p === '/api/visual-config/plantilla-seleccionada/') data = { tienda_id: 1, plantilla_seleccionada: 'minimal' };
        else if (p === '/api/auth/me/') data = { id: 7, is_store_owner: true, is_staff: false };
        else if (p === '/api/auth/emprendedor/perfil/') data = { email: 'qa@example.test', first_name: 'QA', last_name: 'Marketing' };
        else if (p === '/api/tienda/configuracion/') {
          if (brandFail) return route.fulfill({ status: 500, json: { exito: false } });
          data = { nombre: storeName, descripcion: 'Tienda de prueba, sin información comercial real' };
        } else if (p === '/api/landing/configuracion/') data = { id: 1, tienda: 1, titulo: 'Portada QA', descripcion: '', texto_boton: 'Ver productos', logo, imagen_principal: null, contenido: {}, secciones: {} };
        else if (p === '/api/catalog/productos/admin/listado/') {
          if (delayCatalog) await gate;
          if (catalogFail) return route.fulfill({ status: 503, json: { exito: false } });
          data = products;
        } else if (p === '/api/tienda/dashboard/') data = { fecha_desde: '2026-10-09', fecha_hasta: '2026-10-15', moneda: 'CLP', zona_horaria: 'America/Santiago', total_ventas: '0.00', total_pedidos: 0, por_despachar: 0, historico: [] };
        else if (p === '/api/tienda/pedidos/ultimos/' || p === '/api/catalog/productos/') data = [];
        else if (p === '/api/tienda/informes/') data = JSON.parse(fs.readFileSync(path.join(reportFixtures, 'informe-ventas-pedidos-2025.json'), 'utf8'));
        else if (p === '/api/tienda/informes/pdf/') return route.fulfill({ contentType: 'application/pdf', body: fs.readFileSync(path.join(reportFixtures, 'informe-ventas-pedidos-2025.pdf')) });
        else if (p === '/api/promociones/') {
          // Contrato persistido de develop, únicamente en el transporte simulado de QA.
          if (request.method() === 'POST') {
            assert.equal(request.headers().authorization, 'Token marketing-qa-owner');
            const draft = request.postDataJSON();
            assert.equal(draft.code, 'QA-CAMPANIA');
            const row = { ...draft, id: 1, usedCount: 0 };
            serverPromotions.push(row);
            return route.fulfill({ status: 201, json: envelope(row) });
          }
          data = serverPromotions;
        }
        return route.fulfill({ json: envelope(data) });
      });
      await context.route('**/media/no-existe-qa.png', route => route.fulfill({ status: 404, body: '' }));
      await context.route('**/media/logo-qa.png', route => route.fulfill(failLogo ? { status: 404 } : { contentType: 'image/png', body: fs.readFileSync(path.join(fixtures, 'producto-qa.png')) }));
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.accept());
      await page.goto(base + '/emprendedor/marketing', { waitUntil: 'domcontentloaded' });
      await page.getByText('Cargando productos e identidad de tu tienda...', { exact: true }).waitFor();
      assert.equal(await page.getByText('Tu catálogo está vacío.', { exact: false }).count(), 0);
      releaseCatalog(); delayCatalog = false;
      await page.getByLabel('Producto para publicar', { exact: true }).waitFor();
      assert.equal(await page.getByText('NO PUBLICAR DEMOSTRACION', { exact: true }).count(), 0);
      const noOverflow = async label => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${label}: sin scroll horizontal global`);
      const choose = async id => { await page.getByLabel('Producto para publicar', { exact: true }).selectOption(pid(id)); await settle(page); };
      await choose(1);
      const art = page.locator('.marketing-art');
      assert(await art.getByText('Desde', { exact: false }).count());
      assert((await art.innerText()).includes('$24.000'));
      assert(!(await art.innerText()).includes('NO USAR NOMBRE LOCAL'));
      assert((await art.innerText()).includes('Tienda QA OpenMind'));
      assert.equal(await art.locator('.marketing-art-brand img').count(), 0);
      assert.equal(await art.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(24, 75, 69)');
      assert.equal(await art.locator('.marketing-art-media img').evaluate(el => getComputedStyle(el).objectFit), 'contain');
      const formats = [ ['square', 'Publicación cuadrada', 1], ['story', 'Historia vertical', 9 / 16], ['banner', 'Banner horizontal', 16 / 9] ];
      const assertFormat = async (format, ratio, suffix = '') => {
        const box = await art.boundingBox(); assert(Math.abs(box.width / box.height - ratio) < .02, `${width}px ${format}: proporción correcta, ${JSON.stringify(box)}`);
        const cta = await art.locator('.marketing-art-cta').boundingBox();
        assert(cta.y + cta.height <= box.y + box.height - 2, `${width}px ${format}: CTA dentro de la pieza`);
        const price = await art.locator('.marketing-art-price').boundingBox();
        assert(price.x + price.width <= box.x + box.width, `${width}px ${format}: precio dentro de la pieza`);
        await noOverflow(format);
        await page.locator('.marketing-preview').screenshot({ path: path.join(out, `${format}-${width}${suffix}.png`) });
      };
      const countBeforeFormat = requests.filter(r => r.p === '/api/catalog/productos/admin/listado/').length;
      const storageBeforeFormat = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([key]) => key.includes('ua-entrepreneur-demo-v1'))));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `marketing-${width}.png`), fullPage: true });
      for (const [format, label, ratio] of formats) {
        await page.getByRole('radio', { name: new RegExp(label) }).check();
        await assertFormat(format, ratio);
      }
      assert.equal(requests.filter(r => r.p === '/api/catalog/productos/admin/listado/').length, countBeforeFormat, 'formato no guarda ni consulta de nuevo');
      assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([key]) => key.includes('ua-entrepreneur-demo-v1')))), storageBeforeFormat, 'los cambios de formato no persisten publicaciones');
      if (process.env.MARKETING_EDITOR_TESTS === '1') await require('./marketing-editor-browser.cjs')(page, { width, out, pid, choose, formats });
      if (process.env.MARKETING_CUSTOMIZATION_TESTS === '1') await require('./marketing-customization-browser.cjs')(page, { width, choose, formats, out });
      await page.getByLabel('Variante de la publicación').selectOption('ROJO');
      assert.equal(await art.locator('.marketing-art-offer').count(), 0);
      assert((await art.innerText()).includes('$32.000')); assert(!(await art.innerText()).includes('Desde'));
      products[0].variantes = products[0].variantes.filter(v => v.sku !== 'ROJO');
      await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
      await art.waitFor();
      assert((await art.innerText()).includes('$24.000'), 'actualizar no deja una selección de variante eliminada');
      await page.getByRole('radio', { name: /Crear publicación de promoción/ }).check();
      const offers = page.getByLabel('Producto con oferta');
      const offeredIds = await offers.locator('option').evaluateAll(options => options.map(o => o.value).filter(Boolean));
      assert.deepEqual(offeredIds.sort(), [pid(1), pid(8)].sort());
      await offers.selectOption(pid(1));
      assert((await art.innerText()).includes('20% menos'));
      assert((await art.innerText()).includes('en esta variante')); assert(!(await art.innerText()).includes('Desde'));
      await page.getByRole('radio', { name: /Crear publicación de producto/ }).check();
      for (const [id, message] of [[3, 'Este producto está inactivo.'], [4, 'Este producto no tiene variantes activas con stock.'], [6, 'No encontramos un precio válido']]) {
        await choose(id); await page.getByText(message, { exact: false }).waitFor(); assert.equal(await art.count(), 0);
      }
      await choose(5); await page.getByText('Este producto no tiene imagen.', { exact: false }).waitFor();
      for (const [format, label, ratio] of formats) { await page.getByRole('radio', { name: new RegExp(label) }).check(); await assertFormat(format, ratio, '-sin-imagen'); }
      await choose(7); await page.getByText('No pudimos cargar la imagen.', { exact: false }).waitFor();
      assert.equal(await art.getAttribute('data-image'), 'none');
      await choose(8);
      for (const [format, label, ratio] of formats) { await page.getByRole('radio', { name: new RegExp(label) }).check(); await assertFormat(format, ratio, '-nombre-largo'); }
      await page.getByRole('radio', { name: /Publicación cuadrada/ }).focus(); await page.keyboard.press('ArrowRight');
      assert(await page.getByRole('radio', { name: /Historia vertical/ }).isChecked());
      await page.getByLabel('Buscar producto').fill('mochila');
      assert.equal(await page.getByLabel('Producto para publicar').locator('option').count(), 2);
      assert.equal(await art.count(), 0, 'la búsqueda no mantiene una publicación de otro producto');
      await page.getByLabel('Buscar producto').fill('');
      logo = '/media/logo-qa.png';
      await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
      await choose(1); await art.getByAltText('Logo de Tienda QA OpenMind').waitFor();
      if (process.env.MARKETING_EDITOR_TESTS === '1') {
        await page.getByRole('button', { name: 'Imagen y logo', exact: true }).click();
        await page.getByLabel('Mostrar logo de la tienda').uncheck();
        assert.equal(await art.locator('.marketing-art-brand img').count(), 0);
        assert((await art.innerText()).includes('Tienda QA OpenMind'));
        await page.getByLabel('Mostrar logo de la tienda').check();
        await art.getByAltText('Logo de Tienda QA OpenMind').waitFor();
      }
      failLogo = true;
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByLabel('Producto para publicar').waitFor(); await choose(1);
      await page.getByText('No pudimos cargar el logo.', { exact: false }).waitFor();
      catalogFail = true; await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
      await page.getByRole('button', { name: 'Reintentar carga' }).waitFor(); assert.equal(await art.count(), 0);
      catalogFail = false; await page.getByRole('button', { name: 'Reintentar carga' }).click(); await page.getByLabel('Producto para publicar').waitFor();
      brandFail = true; await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
      await page.getByText('No pudimos cargar el nombre de tu tienda.', { exact: false }).waitFor(); assert.equal(await art.count(), 0);
      brandFail = false; products = [productsFixture()[1]];
      await page.getByRole('button', { name: 'Reintentar carga' }).click(); await page.getByLabel('Producto para publicar').waitFor();
      await page.getByRole('radio', { name: /Crear publicación de promoción/ }).check();
      await page.getByText('No hay ofertas de productos disponibles', { exact: false }).waitFor();
      products = []; await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
      await page.getByText('Tu catálogo está vacío.', { exact: false }).waitFor();
      products = productsFixture(); logo = null; storeName = 'Tienda QA OpenMind';
      await page.goto(base + '/emprendedor/productos', { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Crear publicación', exact: true }).first().click();
      await art.waitFor(); assert.equal(await page.getByLabel('Producto para publicar').inputValue(), pid(1));
      await page.goto(base + `/emprendedor/marketing?producto=${pid(999)}`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Este producto ya no está disponible en tu catálogo.', { exact: false }).waitFor(); assert.equal(await art.count(), 0);
      // Regresiones de navegación de los módulos anteriores; API simulada, sin guardar cambios.
      await page.goto(base + '/emprendedor', { waitUntil: 'domcontentloaded' });
      const reports = page.getByRole('region', { name: 'Historial e informes', exact: true });
      await reports.getByRole('button', { name: 'Descargar informe PDF' }).waitFor();
      const downloadEvent = page.waitForEvent('download'); await reports.getByRole('button', { name: 'Descargar informe PDF' }).click();
      assert.equal((await downloadEvent).suggestedFilename(), 'informe-ventas-pedidos-2025.pdf');
      await page.goto(base + '/emprendedor/landing', { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/emprendedor/landing');
      await page.getByLabel('Nombre de la tienda (obligatorio)').waitFor();
      await page.getByRole('button', { name: 'Guardar página principal' }).waitFor();
      assert.equal(requests.filter(r => !['GET', 'OPTIONS'].includes(r.method)).length, 0, 'Marketing, formatos y preview no guardan datos');
      await page.goto(base + '/emprendedor/promociones', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Nueva promoción' }).click();
      await page.getByLabel('Nombre interno').fill('Campaña QA independiente');
      await page.getByLabel('Valor (%)', { exact: true }).fill('10');
      const codeInput = page.getByLabel('Código de descuento (obligatorio)', { exact: true });
      assert.equal(await codeInput.getAttribute('maxlength'), '40');
      assert.notEqual(await codeInput.getAttribute('required'), null);
      await page.getByText('Usa letras, números y guiones (ej: BIENVENIDA-10)', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Guardar promoción', exact: true }).click();
      assert(await codeInput.evaluate(input => input.validity.valueMissing), 'el formulario identifica el código obligatorio');
      assert.equal(requests.filter(r => r.method === 'POST').length, 0, 'código vacío no llega a la API');
      await codeInput.fill('   ');
      await page.getByRole('button', { name: 'Guardar promoción', exact: true }).click();
      await page.getByText('Ingresa un código promocional (ej: VERANO20).', { exact: true }).waitFor();
      assert.equal(requests.filter(r => r.method === 'POST').length, 0, 'solo espacios no llega a la API');
      await codeInput.fill(' qa-campania ');
      await page.getByRole('button', { name: 'Guardar promoción', exact: true }).click();
      await page.getByRole('heading', { name: 'Campaña QA independiente', exact: true }).waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Campaña QA independiente', exact: true }).waitFor();
      await page.goto(base + '/emprendedor/marketing', { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Producto para publicar').waitFor();
      await page.getByRole('radio', { name: /Crear publicación de promoción/ }).check();
      assert.equal(await page.getByText('Campaña QA independiente', { exact: true }).count(), 0, 'Marketing sigue limitado a ofertas de variantes, sin convertir campañas generales');
      const mutations = requests.filter(r => !['GET', 'OPTIONS'].includes(r.method));
      assert.equal(mutations.length, 1);
      assert.equal(mutations[0].p, '/api/promociones/');
      assert.equal(mutations[0].method, 'POST', 'solo el guardado explícito en Promociones usa POST, interceptado por QA');
      assert(requests.filter(r => r.p === '/api/catalog/productos/admin/listado/').every(r => r.headers.authorization === 'Token marketing-qa-owner' && !r.query));
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`OK ${width}px: tres formatos, variantes/ofertas de fixture, vacíos/errores/carga, logo/imagen ausentes, teclado, acceso contextual, formato sin persistencia, PDF/configuración/promociones conservados`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
