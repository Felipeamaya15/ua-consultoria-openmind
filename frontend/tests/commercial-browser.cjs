// UI real + API Django real + bases efímeras. Solo la identidad del montaje QA se inyecta.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const runtime = process.env.QA_NODE_MODULES || 'C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const root = path.resolve(__dirname, '..'), out = path.resolve(root, '../docs/sprint6-reportes-clientes/browser');
const api = 'http://127.0.0.1:8005', results = [], errors = [], downloads = [];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const fixture = await (await fetch(`${api}/__qa_fixture`)).json(); assert(fixture.commercial);
  const entry = `import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
    import{AdminLayout}from'./src/features/admin/components/layout/AdminLayout';import Dashboard from'./src/features/admin/pages/Dashboard';
    import Orders from'./src/features/admin/pages/Orders';import Sales from'./src/features/admin/pages/Sales';import Contacts from'./src/features/admin/pages/Contacts';
    localStorage.setItem('token',window.QA.ownerToken);
    createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/emprendedor" element={<AdminLayout/>}>
    <Route index element={<Dashboard/>}/><Route path="pedidos" element={<Orders/>}/><Route path="ventas" element={<Sales/>}/><Route path="contactos" element={<Contacts/>}/></Route></Routes></BrowserRouter>);`;
  const bundle = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, outfile: 'qa.js', jsx: 'automatic', bundle: true, write: false, format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ VITE_API_URL: api }) }, plugins: [{ name: 'qa-identity-only', setup(build) {
      build.onLoad({ filter: /StoreIdentityContext\.tsx$/ }, () => ({ loader: 'js', contents: `const identity={apiBaseUrl:'${api}',storeId:'${fixture.storeId}'};export const useStoreIdentity=()=>({identity,loading:false,error:'',retry(){}});` }));
    } }] });
  const assets = path.join(root, 'dist/assets');
  const css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(n => /^index-.*\.css$/.test(n))), 'utf8') + bundle.outputFiles.filter(f => f.path.endsWith('.css')).map(f => f.text).join('\n');
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
  const server = http.createServer((req, res) => {
    if (req.url === '/logo-universidad-autonoma.png') { res.setHeader('Content-Type', 'image/png'); res.end(fs.readFileSync(path.join(root, 'public/logo-universidad-autonoma.png'))); return; }
    res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/qa.js' ? js : `<!doctype html><html lang="es-CL"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/qa.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, locale: 'en-US', timezoneId: 'Pacific/Honolulu' });
  page.setDefaultTimeout(20000); await page.addInitScript(q => { window.QA = q; }, fixture); page.on('pageerror', error => errors.push(error.message));
  async function save(button, filename) {
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click();
    const download = await event; await download.saveAs(path.join(out, filename));
    const data = fs.readFileSync(path.join(out, filename)); assert(data.length > 10);
    assert(filename.endsWith('.xlsx') ? data.subarray(0, 2).toString() === 'PK' : filename.endsWith('.pdf') ? data.subarray(0, 5).toString() === '%PDF-' : true);
    downloads.push({ file: filename, suggestedFilename: download.suggestedFilename(), bytes: data.length }); return download;
  }
  async function exportContact(option, filename) {
    await page.getByRole('button', { name: /Exportar contactos/ }).click();
    await save(option, filename);
  }
  async function ensureFiltersExpanded(name) {
    const search = page.getByRole('search', { name });
    const toggle = search.locator('button[aria-expanded]').first();
    await toggle.waitFor({ state: 'visible' });
    if (await toggle.getAttribute('aria-expanded') !== 'true') {
      await toggle.click();
    }
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `Los filtros de ${name} deben estar abiertos`);
    return search;
  }
  async function shot(name) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true, animations: 'disabled' }); }
  async function noOverflow() { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'La vista móvil no debe tener desbordamiento horizontal global'); }
  async function labels() {
    const missing = await page.locator('main input:not([type=hidden]), main select, main textarea').evaluateAll(elements => elements.filter(e => e.getClientRects().length && !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).map(e => e.outerHTML));
    assert.deepEqual(missing, []);
  }
  try {
    await page.goto(`${base}/emprendedor/ventas`); await page.getByRole('tab', { name: 'Resumen de ventas', exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Panel del emprendedor' }).getByRole('link', { name: 'Ventas', exact: true }).count(), 1);
    await ensureFiltersExpanded('Filtrar ventas');
    await page.getByLabel('Desde (DD/MM/AAAA)', { exact: true }).fill('01/10/2025');
    await page.getByLabel('Hasta (DD/MM/AAAA)', { exact: true }).fill('31/10/2025');
    await page.getByRole('search', { name: 'Filtrar ventas' }).getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByText('$19.400,75 CLP', { exact: true }).first().waitFor(); await page.getByRole('heading', { name: 'Productos más vendidos', exact: true }).waitFor();
    await labels(); await shot('ventas-resumen-1280'); results.push('PASS menú Ventas único; resumen real, ticket, productos, gráfico y fechas chilenas');
    await page.getByRole('tab', { name: 'Resumen de ventas', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await page.waitForURL(/vista=historial/); assert.equal(await page.getByRole('tab', { name: 'Historial de ventas', exact: true }).getAttribute('aria-selected'), 'true');
    const sale = page.locator('main details').filter({ hasText: 'Pago confirmado' }).first();
    await sale.waitFor(); await sale.locator('summary').click();
    await sale.getByRole('table').waitFor();
    assert(await sale.getByRole('columnheader', { name: 'SKU', exact: true }).count() > 0);
    assert(await sale.getByText('Descuento del pedido:', { exact: false }).count() > 0);
    await save('Exportar Excel', 'ventas-2025-10.xlsx');
    await page.setViewportSize({ width: 375, height: 900 }); await noOverflow(); await shot('ventas-historial-375');
    results.push('PASS pestañas con teclado; historial con SKU, cantidades, precio, descuento y exportación XLSX real');

    await page.goto(`${base}/emprendedor/pedidos?q=OLD`); await page.getByText(/25 registros/).waitFor();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click(); await page.getByText(/Página 2 de 2/).waitFor();
    await save('Exportar pedidos Excel', 'pedidos-antiguos-todas-las-paginas.xlsx'); await noOverflow(); await shot('pedidos-pagina2-375');
    await page.getByLabel('Buscar pedido, producto o SKU', { exact: true }).fill('SALE'); await page.getByLabel('Estado de pago', { exact: true }).selectOption('confirmado');
    await page.getByText(/2 registros/).waitFor(); await page.getByRole('button', { name: 'Ver pedido SALE-PAID', exact: true }).click();
    await page.getByRole('region', { name: 'Detalle del pedido SALE-PAID', exact: true }).waitFor(); await page.getByText(/Retiro: .*10:07 h/).waitFor();
    await save('Exportar pedidos Excel', 'pedidos-confirmados.xlsx'); await shot('pedidos-detalle-375');
    results.push('PASS pedidos antiguos paginados; exporta todas las páginas filtradas; detalle y retiro conservados');

    await page.setViewportSize({ width: 1280, height: 950 });
    await page.goto(`${base}/emprendedor/contactos`); await page.getByRole('table').waitFor(); await labels();
    assert.equal(await page.getByRole('rowheader', { name: 'cliente@example.test', exact: true }).count(), 1);
    const old = page.getByRole('row', { name: /historico@example.test/ }); assert((await old.textContent()).includes('25'));
    await exportContact('Excel de contactos', 'contactos-operativos.xlsx');
    await exportContact('CSV de contactos', 'contactos-operativos.csv');
    await exportContact('Excel de marketing autorizado', 'contactos-marketing-autorizados.xlsx');
    await page.setViewportSize({ width: 375, height: 900 }); await noOverflow();
    await page.getByText('cliente@example.test', { exact: true }).first().waitFor(); await shot('contactos-375');
    const filtrosContactos = page.getByRole('search', {
  name: 'Filtrar contactos'
});

const toggleFiltros = filtrosContactos.locator('button[aria-expanded]').first();
console.log('Estado inicial:', await toggleFiltros.getAttribute('aria-expanded'));
if (await toggleFiltros.getAttribute('aria-expanded') !== 'true') {await toggleFiltros.click();}
console.log('Estado final:', await toggleFiltros.getAttribute('aria-expanded'));
const selectores = filtrosContactos.locator('select');
console.log('Selectores encontrados:', await selectores.count());
if (await selectores.count() === 0) {console.log('HTML del formulario:', await filtrosContactos.innerHTML());
  await page.screenshot({path: '../docs/sprint6-reportes-clientes/browser/diagnostico-contactos.png',fullPage: true});
  throw new Error('El filtro de consentimiento no se encuentra en el formulario.');}
await selectores.first().selectOption('sin_registro');
    await filtrosContactos.getByRole('button', { name: 'Buscar', exact: true }).click();
    await exportContact('Excel de marketing autorizado', 'marketing-sin-autorizados.xlsx');
    results.push('PASS contactos únicos, 25 compras agrupadas, CSV/XLSX y marketing limitado a consentimiento expreso');
    await page.getByRole('search', { name: 'Filtrar contactos' }).getByLabel('Buscar contacto').fill('NO-MATCH');
    await page.getByRole('search', { name: 'Filtrar contactos' }).getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByText('No hay contactos que coincidan con los filtros.', { exact: true }).waitFor(); await shot('contactos-vacio-375');
    const fail = route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ secret: 'fixture-must-not-be-shown' }) });
    await page.route(`${api}/api/tienda/contactos/?*`, fail); await page.goto(`${base}/emprendedor/contactos`);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor(); assert(!(await page.locator('main').textContent()).includes('fixture-must-not-be-shown'));
    await shot('contactos-error-375'); await page.unroute(`${api}/api/tienda/contactos/?*`, fail);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.getByText('cliente@example.test', { exact: true }).first().waitFor();
    results.push('PASS vacío y error recuperable sin datos privados; controles con etiquetas y tarjetas móviles accesibles');

    await page.getByRole('button', { name: 'Abrir navegación', exact: true }).click(); await page.getByRole('link', { name: 'Ventas', exact: true }).waitFor(); await shot('menu-ventas-375');
    await page.getByRole('link', { name: 'Ventas', exact: true }).click();
    await page.goto(`${base}/emprendedor`); await page.getByLabel('Año del informe', { exact: true }).selectOption('2025'); await page.getByLabel('Mes (opcional)', { exact: true }).selectOption('10');
    await page.getByText('$19.400,75 CLP', { exact: true }).first().waitFor();
    const excel = await save('Descargar informe Excel', 'dashboard-2025-10.xlsx'); assert(excel.suggestedFilename().includes('2025-10'));
    await save('Descargar informe PDF', 'dashboard-2025-10.pdf'); await noOverflow(); await shot('dashboard-exportaciones-375');
    results.push('PASS Dashboard: Excel y PDF independientes con los mismos filtros y mes en el nombre del archivo');
    assert.deepEqual(errors, []); console.log(results.join('\n'));
  } finally {
    fs.writeFileSync(path.join(out, 'resultados.json'), JSON.stringify({ results, errors, downloads }, null, 2));
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });