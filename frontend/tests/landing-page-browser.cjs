// Navegador real, aplicación real y respuestas HTTP de prueba interceptadas.
// No inicia sesión ni escribe en las bases comerciales.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evidenceDir = process.env.LANDING_EVIDENCE_DIR;
if (evidenceDir) fs.mkdirSync(evidenceDir, { recursive: true });
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LANDING_TEST_URL || 'http://127.0.0.1:5180';
const envelope = data => ({ exito: true, mensaje: '', data });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.DASHBOARD_BROWSER_CHANNEL || 'msedge' });
  try {
    for (const width of [375, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, acceptDownloads: true });
      let business = { nombre: 'Negocio de prueba', descripcion: 'Descripción del negocio' };
      let landing = { id: 1, tienda: 1, titulo: 'Portada de prueba', descripcion: 'Descripción de portada independiente', texto_boton: 'Ver productos',
        imagen_principal: `${base}/qa/portada.svg`, logo: `${base}/qa/logo.svg`, secciones: { 'Productos destacados': true, 'Categorías': true, 'Beneficios': true, 'Información de contacto': true, 'Mapa / ubicación': false },
        contenido: { productos_destacados: [], categorias: [], beneficios: [{ titulo: 'Beneficio conservado', descripcion: 'Descripción', icono: 'truck' }],
          contacto: { telefono: '+56 9 1111 2222', whatsapp: '', correo: 'servidor@example.test', instagram: '', facebook: '', sitio_web: '', horario: '' },
          ubicacion: { direccion: '', comuna: '', ciudad: '', region: '', enlace_maps: '' } } };
      let failBusinessLoad = false, failBusinessSave = false, failLandingLoad = false, landingPuts = 0;
      const requests = [], errors = [];
      await context.addInitScript(() => {
        localStorage.setItem('token', 'qa-test-token');
        for (const apiBaseUrl of ['http://localhost:8000', 'http://127.0.0.1:8000']) {
          const identity = { apiBaseUrl, storeId: '1' };
          localStorage.setItem(`ua-entrepreneur-demo-v1:store:${encodeURIComponent(apiBaseUrl)}:1`, JSON.stringify({ version: 1, identity, config: { name: 'Nombre anterior local', description: 'Descripción local', themeEditor: { editorial: { visualConfig: { hero: { gap: 17 } } } }, contactEmail: 'local@example.test', contactPhone: '+56 9 9999 9999' } }));
        }
      });
      await context.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url()), p = url.pathname;
        requests.push({ p, method: req.method(), auth: req.headers().authorization, query: url.search });
        let data = {};
        if (p === '/api/visual-config/plantilla-seleccionada/') data = { tienda_id: 1, plantilla_seleccionada: 'editorial' };
        else if (p === '/api/auth/emprendedor/perfil/') data = { email: 'owner@example.test', first_name: 'QA', last_name: 'Local', phone: '' };
        else if (p === '/api/auth/me/') data = { is_staff: false, is_store_owner: true };
        else if (p === '/api/tienda/configuracion/') {
          if (req.method() === 'GET' && failBusinessLoad) return route.fulfill({ status: 500, json: { exito: false } });
          if (req.method() === 'PUT') {
            if (failBusinessSave) return route.fulfill({ status: 500, json: { exito: false } });
            business = req.postDataJSON();
          }
          data = business;
        } else if (p === '/api/landing/configuracion/') {
          if (req.method() === 'GET' && failLandingLoad) return route.fulfill({ status: 500, json: { exito: false } });
          if (req.method() === 'PUT') {
            landingPuts++;
            const form = await new Response(req.postDataBuffer(), { headers: { 'Content-Type': req.headers()['content-type'] } }).formData();
            landing = { ...landing, titulo: form.get('titulo'), descripcion: form.get('descripcion'), texto_boton: form.get('texto_boton'),
              contenido: JSON.parse(form.get('contenido')), secciones: JSON.parse(form.get('secciones')) };
          }
          data = landing;
        } else if (p === '/api/catalog/productos/' || p === '/api/tienda/pedidos/ultimos/') data = [];

        return route.fulfill({ json: envelope(data) });
      });
      await context.route('**/qa/*.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180"><rect width="480" height="180" fill="#dce8f4"/><circle cx="240" cy="90" r="55" fill="#1a3a6b"/></svg>' }));
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const noOverflow = async label => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${label}: sin desbordamiento`);
      await page.goto(base + '/emprendedor/landing');
      assert.equal(new URL(page.url()).pathname, '/emprendedor/landing');
      for (const suffix of ['?origen=menu&texto=a%20b#informacion-negocio', '?origen=antiguo#pagina-principal', '?repetido=1&repetido=2#otro', '']) {
        await page.goto(base + '/emprendedor/configuracion' + suffix);
        await page.waitForURL(base + '/emprendedor/landing' + suffix);
      }
      await page.getByLabel('Nombre de la tienda (obligatorio)').waitFor();
      const nav = page.locator('nav[aria-label="Panel del emprendedor"]');
      assert.deepEqual((await nav.locator(':scope > a').allTextContents()).slice(0, 5), ['Resumen', 'Productos', 'Pedidos', 'Página principal', 'Diseño']);
      assert.equal(await nav.locator('a.active').getAttribute('href'), '/emprendedor/landing');
      assert(await nav.locator('a[href="/emprendedor/landing"] svg path').first().getAttribute('d').then(d => d.startsWith('m3 10')));
      assert.equal(await page.locator('form form').count(), 0);
      await page.getByLabel('Nombre de la tienda (obligatorio)').waitFor();
      assert.equal(await page.getByLabel('Nombre de la tienda (obligatorio)').inputValue(), business.nombre);
      assert.equal(await page.locator('nav[aria-label="Apartados de configuración"]').count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Página principal y contacto', exact: true }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Información del negocio', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /Recuperar.*(navegador|locales)/ }).count(), 0);
      // La eliminación es solo de la interfaz: la configuración local y sus estilos sobreviven.
      assert(await page.evaluate(() => Object.keys(localStorage).some(key => {
        const raw = localStorage.getItem(key);
        return key.startsWith('ua-entrepreneur-demo-v1:store:') && raw.includes('Nombre anterior local');
      })));
      const businessCard = page.locator('#informacion-negocio > section');
      const titleCard = page.getByLabel('Título principal', { exact: true }).locator('xpath=ancestor::section[1]');
      for (const card of [businessCard, titleCard]) {
        assert.equal(await card.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
        assert.equal(await card.evaluate(el => getComputedStyle(el).paddingTop), '20px');
      }
      const businessBox = await businessCard.boundingBox(), titleBox = await titleCard.boundingBox();
      assert(titleBox.y >= businessBox.y + businessBox.height + 19);
      assert.equal(await page.getByLabel('Descripción de portada', { exact: true }).inputValue(), landing.descripcion);
      const previews = page.locator('#pagina-principal img[alt="Imagen seleccionada"]');
      assert.equal(await previews.count(), 2);
      for (const preview of await previews.all()) assert(await preview.evaluate(img => img.complete && img.naturalWidth > 0));
      await noOverflow('tarjetas iniciales');
      if (evidenceDir) {
        await page.screenshot({ path: path.join(evidenceDir, `editor-${width}.png`), fullPage: true });
        await page.screenshot({ path: path.join(evidenceDir, `editor-inicio-${width}.png`) });
      }
      assert.equal(await page.getByLabel('Correo electrónico', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Teléfono (con código de país)').count(), 1);
      assert.equal(await page.getByRole('heading', { name: 'Logo', exact: true }).count(), 1);
      assert.equal(await page.locator('nav[aria-label="Panel del emprendedor"] a[href="/emprendedor/landing"]').count(), 1);
      assert.equal(await page.getByLabel('Nombre de la tienda (obligatorio)').inputValue(), business.nombre);
      assert.equal(await page.getByLabel('Correo electrónico', { exact: true }).inputValue(), 'servidor@example.test');
      assert.equal(await page.getByLabel('Teléfono (con código de país)').inputValue(), '+56 9 1111 2222');
      const putsBeforeValidation = requests.filter(r => r.method === 'PUT').length;
      await page.getByLabel('Nombre de la tienda (obligatorio)').fill('   ');
      await page.getByRole('button', { name: 'Guardar información del negocio' }).click();
      await page.getByText('Escribe un nombre para tu tienda.', { exact: true }).waitFor();
      assert.equal(requests.filter(r => r.method === 'PUT').length, putsBeforeValidation);
      await page.getByLabel('Nombre de la tienda (obligatorio)').fill('Nombre persistido de prueba');
      failBusinessSave = true; await page.getByRole('button', { name: 'Guardar información del negocio' }).click();
      await page.getByText('No se pudo guardar la información del negocio.', { exact: false }).waitFor();
      failBusinessSave = false; await page.getByRole('button', { name: 'Guardar información del negocio' }).click();
      await page.getByText('Información del negocio guardada en tu tienda.', { exact: true }).waitFor();
      await page.getByLabel('Título principal', { exact: true }).fill('Portada conservada tras guardar');
      await page.getByRole('button', { name: 'Guardar página principal' }).click();
      await page.getByText('Página principal guardada en tu tienda.', { exact: true }).waitFor();
      assert.equal(landing.contenido.beneficios[0].titulo, 'Beneficio conservado');
      assert.equal(landing.descripcion, 'Descripción de portada independiente');
      assert(landingPuts > 0);
      await page.reload();
      await page.getByLabel('Nombre de la tienda (obligatorio)').waitFor();
      assert.equal(await page.getByLabel('Nombre de la tienda (obligatorio)').inputValue(), 'Nombre persistido de prueba');
      await page.getByLabel('Título principal', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Título principal', { exact: true }).inputValue(), 'Portada conservada tras guardar');
      await noOverflow('configuración');
      assert(await page.evaluate(() => Object.keys(localStorage).some(key => {
        try { return JSON.parse(localStorage.getItem(key))?.config?.themeEditor?.editorial?.visualConfig?.hero?.gap === 17; } catch { return false; }
      })), 'Los estilos locales se conservan al guardar y recargar');
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width === 375) {
        await page.getByRole('button', { name: 'Abrir navegación' }).click();
        await page.getByRole('link', { name: 'Página principal', exact: true }).click();
      } else await page.getByRole('link', { name: 'Página principal', exact: true }).click();
      for (const template of [1, 2, 3, 4]) {
        await page.goto(`${base}/plantilla/${template}`);
        await page.getByText('Portada conservada tras guardar', { exact: true }).first().waitFor();
        await noOverflow(`plantilla ${template}`);
        await page.getByText('Nombre persistido de prueba', { exact: true }).and(page.locator(':visible')).first().waitFor();
        if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `plantilla-${template}-${width}.png`) });
      }
      failLandingLoad = true;
      await page.goto(base + '/emprendedor/configuracion');
      await page.getByText('No pudimos cargar el contenido de tu página principal.', { exact: false }).waitFor();
      assert(await page.getByRole('button', { name: 'Guardar página principal' }).isDisabled());
      assert.equal(errors.length, 0, errors.join('\n'));
      assert(await page.getByRole('button', { name: 'Guardar información del negocio' }).isEnabled());
      failLandingLoad = false; failBusinessLoad = true;
      await page.goto(base + '/emprendedor/landing');
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      assert(await page.getByLabel('Nombre de la tienda (obligatorio)').isDisabled());
      assert(await page.getByRole('button', { name: 'Guardar página principal' }).isEnabled());
      failBusinessLoad = false;
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByLabel('Nombre de la tienda (obligatorio)').waitFor();
      assert.equal(await page.getByLabel('Nombre de la tienda (obligatorio)').inputValue(), business.nombre);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`OK ${width}px: navegación, redirecciones con parámetros/hash, menú/casa, guardado, errores/reintento, tarjetas blancas, previews, estilos locales conservados, cuatro plantillas y formularios independientes`);
      await context.close();
      const guest = await browser.newContext();
      const guestPage = await guest.newPage();
      await guestPage.route('**/api/**', route => route.fulfill({ json: envelope({ tienda_id: 1, plantilla_seleccionada: 'editorial' }) }));
      await guestPage.goto(base + '/emprendedor/landing');
      await guestPage.waitForURL('**/plantilla/1/ingresar');
      assert.equal(await guestPage.getByRole('button', { name: 'Guardar información del negocio' }).count(), 0);
      await guest.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
