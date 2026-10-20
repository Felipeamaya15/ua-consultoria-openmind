// Navegador real, aplicación real y respuestas HTTP de prueba interceptadas.
// No inicia sesión ni escribe en las bases comerciales.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REPORTS_TEST_URL || 'http://127.0.0.1:5180';
const out = process.env.REPORTS_EVIDENCE_DIR ? path.resolve(process.env.REPORTS_EVIDENCE_DIR) : path.resolve(__dirname, '../../docs/mejoras-informes-configuracion/evidencias');
const fixtures = process.env.REPORTS_FIXTURE_DIR ? path.resolve(process.env.REPORTS_FIXTURE_DIR) : out;
const fixture = name => JSON.parse(fs.readFileSync(path.join(fixtures, `informe-ventas-pedidos-${name}.json`), 'utf8'));
const annual = fixture('2025'), monthly = fixture('2025-10'), empty = fixture('2024');
const envelope = data => ({ exito: true, mensaje: '', data });
const zeroCurrent = { ...empty, anio: 2026, fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31', anios_disponibles: [2026, 2025] };
const currentDashboard = { fecha_desde: '2026-10-09', fecha_hasta: '2026-10-15', zona_horaria: 'America/Santiago', moneda: 'CLP',
  total_ventas: '1000.00', total_pedidos: 2, pedidos_pagados: 1, ticket_promedio: '1000.00', por_despachar: 2,
  historico: [{ fecha: '2026-10-15', ventas: '1000.00', pedidos: 2 }], distribucion_estados: [{ estado: 'pagado', etiqueta: 'Pagado', pedidos: 1 }, { estado: 'pendiente', etiqueta: 'Pendiente', pedidos: 1 }] };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.DASHBOARD_BROWSER_CHANNEL || 'msedge' });
  try {
    for (const width of [375, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, acceptDownloads: true });
      let business = { nombre: 'Negocio de prueba', descripcion: 'Descripción del negocio' };
      let landing = { id: 1, tienda: 1, titulo: 'Portada de prueba', descripcion: 'Descripción de portada independiente', texto_boton: 'Ver productos',
        imagen_principal: null, logo: null, secciones: { 'Productos destacados': true, 'Categorías': true, 'Beneficios': true, 'Información de contacto': true, 'Mapa / ubicación': false },
        contenido: { productos_destacados: [], categorias: [], beneficios: [{ titulo: 'Beneficio conservado', descripcion: 'Descripción', icono: 'truck' }],
          contacto: { telefono: '+56 9 1111 2222', whatsapp: '', correo: 'servidor@example.test', instagram: '', facebook: '', sitio_web: '', horario: '' },
          ubicacion: { direccion: '', comuna: '', ciudad: '', region: '', enlace_maps: '' } } };
      let failReport = false, failDownload = false, failBusinessSave = false, failLandingLoad = false, landingPuts = 0;
      const requests = [], errors = [];
      await context.addInitScript(() => {
        localStorage.setItem('token', 'qa-test-token');
        for (const apiBaseUrl of ['http://localhost:8000', 'http://127.0.0.1:8000']) {
          const identity = { apiBaseUrl, storeId: '1' };
          localStorage.setItem(`ua-entrepreneur-demo-v1:store:${encodeURIComponent(apiBaseUrl)}:1`, JSON.stringify({ version: 1, identity, config: { name: 'Nombre anterior local', description: 'Descripción local', contactEmail: 'local@example.test', contactPhone: '+56 9 9999 9999' } }));
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
        else if (p === '/api/tienda/dashboard/') data = currentDashboard;
        else if (p === '/api/tienda/informes/pdf/') {
          if (failDownload) return route.fulfill({ status: 500, json: { exito: false } });
          const suffix = url.searchParams.get('anio') + (url.searchParams.has('mes') ? '-' + url.searchParams.get('mes').padStart(2, '0') : '');
          return route.fulfill({ contentType: 'application/pdf', body: fs.readFileSync(path.join(fixtures, `informe-ventas-pedidos-${suffix}.pdf`)) });
        } else if (p === '/api/tienda/informes/') {
          if (failReport) return route.fulfill({ status: 500, json: { exito: false } });
          data = url.searchParams.get('anio') === '2025' ? (url.searchParams.get('mes') === '10' ? monthly : annual) : zeroCurrent;
        }
        return route.fulfill({ json: envelope(data) });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const noOverflow = async label => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${label}: sin desbordamiento`);
      await page.goto(base + '/emprendedor');
      const history = page.getByRole('region', { name: 'Historial e informes', exact: true });
      await history.getByText('No hay pedidos en este período.', { exact: false }).waitFor();
      assert.equal(await page.getByLabel('Período', { exact: true }).inputValue(), '30');
      await history.getByLabel('Año del informe').selectOption('2025');
      await history.getByText('49.396.714', { exact: false }).first().waitFor();
      assert.equal(await history.locator('tbody tr').count(), 12);
      const chartGap = await history.locator('figure').first().evaluate(element => parseFloat(getComputedStyle(element.parentElement).gap));
      assert(chartGap >= 24, 'gráficos separados para evitar que se junten etiquetas y cifras');
      await noOverflow('historial anual');
      await history.scrollIntoViewIfNeeded();
      await page.evaluate(() => { const title = document.getElementById('reports-title'); window.scrollTo(0, scrollY + title.getBoundingClientRect().top - 96); });
      await page.screenshot({ path: path.join(out, `historial-${width}-vista.png`) });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `historial-${width}.png`), fullPage: true });
      const annualDownloadEvent = page.waitForEvent('download');
      await history.getByRole('button', { name: 'Descargar informe PDF' }).click();
      assert.equal((await annualDownloadEvent).suggestedFilename(), 'informe-ventas-pedidos-2025.pdf');
      await history.getByLabel('Mes (opcional)').selectOption('10');
      await page.waitForFunction(() => document.querySelector('[aria-labelledby="reports-title"] tbody')?.children.length === 1);
      const monthlyDownloadEvent = page.waitForEvent('download');
      await history.getByRole('button', { name: 'Descargar informe PDF' }).click();
      assert.equal((await monthlyDownloadEvent).suggestedFilename(), 'informe-ventas-pedidos-2025-10.pdf');
      assert.equal(await page.getByLabel('Período', { exact: true }).inputValue(), '30');
      await noOverflow('historial mensual');
      failDownload = true;
      await history.getByRole('button', { name: 'Descargar informe PDF' }).click();
      await history.getByText('No se pudo descargar el PDF.', { exact: false }).waitFor(); failDownload = false;
      failReport = true;
      await history.getByLabel('Mes (opcional)').selectOption('');
      await history.getByRole('button', { name: 'Reintentar historial' }).waitFor();
      assert(await history.getByRole('button', { name: 'Descargar informe PDF' }).isDisabled());
      failReport = false; await history.getByRole('button', { name: 'Reintentar historial' }).click();
      await page.waitForFunction(() => document.querySelector('[aria-labelledby="reports-title"] tbody')?.children.length === 12);
      await page.goto(base + '/emprendedor/landing');
      await page.waitForURL('**/emprendedor/landing');
      await page.getByLabel('Nombre de la tienda (obligatorio)').waitFor();
      assert.equal(await page.getByLabel('Nombre de la tienda (obligatorio)').inputValue(), business.nombre);
      await page.goto(base + '/emprendedor/landing#informacion-negocio');
      assert.equal(new URL(page.url()).hash, '#informacion-negocio');
      await page.getByLabel('Nombre de la tienda (obligatorio)').focus();
      await page.keyboard.press('Tab');
      assert(await page.getByLabel('Descripción del negocio', { exact: true }).evaluate(node => node === document.activeElement));
      await page.goto(base + '/emprendedor/landing#pagina-principal');
      assert.equal(new URL(page.url()).hash, '#pagina-principal');
      assert.equal(await page.getByLabel('Correo electrónico', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Teléfono (con código de país)').count(), 1);
      assert.equal(await page.getByRole('heading', { name: 'Logo', exact: true }).count(), 1);
      assert.equal(await page.locator('nav[aria-label="Panel del emprendedor"] a[href="/emprendedor/landing"]').count(), 1);
      assert.equal(await page.getByRole('button', { name: /Recuperar .*local|Recuperar nombre/ }).count(), 0);
      assert.equal(await page.getByLabel('Nombre de la tienda (obligatorio)').inputValue(), business.nombre);
      assert.equal(await page.getByLabel('Correo electrónico', { exact: true }).inputValue(), 'servidor@example.test');
      assert.equal(await page.getByLabel('Teléfono (con código de país)').inputValue(), '+56 9 1111 2222');
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
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `configuracion-${width}-vista.png`) });
      await page.screenshot({ path: path.join(out, `configuracion-${width}.png`), fullPage: true });
      if (width === 375) {
        await page.getByRole('button', { name: 'Abrir navegación' }).click();
        await page.getByRole('link', { name: 'Página principal', exact: true }).click();
      } else await page.getByRole('link', { name: 'Página principal', exact: true }).click();
      for (const template of [1, 2, 3, 4]) {
        await page.goto(`${base}/plantilla/${template}`);
        await page.getByText('Portada conservada tras guardar', { exact: true }).first().waitFor();
        await noOverflow(`plantilla ${template}`);
        await page.screenshot({ path: path.join(out, `plantilla-${template}-${width}.png`), fullPage: true });
      }
      failLandingLoad = true;
      await page.goto(base + '/emprendedor/configuracion');
      await page.getByText('No pudimos cargar el contenido de tu página principal.', { exact: false }).waitFor();
      assert(await page.getByRole('button', { name: 'Guardar página principal' }).isDisabled());
      assert(requests.filter(r => r.p.startsWith('/api/tienda/informes/')).every(r => r.auth === 'Token qa-test-token'));
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`OK ${width}px: anual/mensual/PDF, filtros independientes, errores/reintento, configuración/persistencia/redirección/hash, aislamiento de datos locales y teclado, cuatro plantillas, sin desbordamiento`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
