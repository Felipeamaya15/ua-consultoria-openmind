// Navegación real con BrowserRouter, Dashboard y Orders; API aislada por Playwright.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const assert = require('node:assert/strict'), esbuild = require('esbuild');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const states = ['pendiente', 'pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado', 'cancelado'];
const order = (id, estado, fecha_creacion) => ({ id_pedido: id, identificador: `ORD-${id}`, nombre_contacto: `Cliente ${id}`, correo_contacto: `buyer${id}@example.test`,
  monto_total: '1000.00', estado, fecha_creacion, metodo_pago: 'Transferencia', costo_envio: '0.00', descuento: '0.00',
  items: [{ nombre_producto: `Producto ${id}`, cantidad: 1, precio_unitario: '1000.00' }] });
const orders = [ ...states.map((s, i) => order(i + 1, s, i === 1 ? '2026-10-10T12:00:00Z' : '2026-10-14T12:00:00Z')),
  order(9, 'pagado', '2026-10-08T02:59:59Z'), order(10, 'pagado', '2025-01-01T12:00:00Z'), order(11, 'pagado', '2026-10-08T03:00:00Z') ];
const chileDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
const paid = states.slice(1, 7), dispatch = states.slice(0, 4);
function metrics(period) {
  const from = period === '7' ? '2026-10-08' : period === 'year' ? '2026-01-01' : '2026-09-15', to = '2026-10-14';
  const selected = orders.filter(o => chileDay(o.fecha_creacion) >= from && chileDay(o.fecha_creacion) <= to);
  const daysCount = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  const previousFrom = new Date(new Date(from).getTime() - daysCount * 86400000).toISOString().slice(0,10);
  const previousTo = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0,10);
  const previous = orders.filter(o => chileDay(o.fecha_creacion) >= previousFrom && chileDay(o.fecha_creacion) <= previousTo);
  const sales = list => list.filter(o=>paid.includes(o.estado)).length * 1000;
  const variation = (current, prior) => prior ? ((current-prior)*100/prior).toFixed(2) : null;
  const days = []; for (let day = new Date(from+'T12:00:00Z'); day.toISOString().slice(0,10) <= to; day.setUTCDate(day.getUTCDate()+1)) days.push(day.toISOString().slice(0,10));
  return { fecha_desde: from, fecha_hasta: to, zona_horaria: 'America/Santiago', moneda: 'CLP',
    total_ventas: `${selected.filter(o => paid.includes(o.estado)).length * 1000}.00`, total_pedidos: selected.length,
    por_despachar: selected.filter(o => dispatch.includes(o.estado)).length,
    pedidos_pagados: selected.filter(o=>paid.includes(o.estado)).length, ticket_promedio: '1000.00',
    distribucion_estados: states.map(estado=>({estado,etiqueta:estado,pedidos:selected.filter(o=>o.estado===estado).length})),
    comparacion:{fecha_desde:previousFrom,fecha_hasta:previousTo,total_ventas:sales(previous).toFixed(2),total_pedidos:previous.length,variacion_ventas:variation(sales(selected),sales(previous)),variacion_pedidos:variation(selected.length,previous.length)},
    historico: days.map(fecha => ({ fecha, ventas: `${selected.filter(o => chileDay(o.fecha_creacion) === fecha && paid.includes(o.estado)).length * 1000}.00`, pedidos: selected.filter(o => chileDay(o.fecha_creacion) === fecha).length })) };
}
(async () => {
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
    import Dashboard from './src/features/admin/pages/Dashboard';import Orders from './src/features/admin/pages/Orders';
    createRoot(document.getElementById('root')).render(<main className="admin-shell" style={{padding:24,maxWidth:1200,margin:'auto'}}>
    <BrowserRouter><Routes><Route path="/emprendedor" element={<Dashboard/>}/><Route path="/emprendedor/pedidos" element={<Orders/>}/></Routes></BrowserRouter></main>);`;
  const bundle = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, jsx: 'automatic', bundle: true, write: false, format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, plugins: [{ name: 'fixture-session', setup(build) {
      build.onLoad({ filter: /authService\.ts$/ }, () => ({ loader: 'js', contents: `export const authService={getToken:()=> 'fixture-owner'};` }));
      build.onLoad({ filter: /[\\/]api\.ts$/ }, () => ({ loader: 'js', contents: `export const API_BASE_URL='https://dashboard-api.test';` }));
    }}] });
  const assets = path.join(root, 'dist/assets'), css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(n => /^index-.*\.css$/.test(n))), 'utf8');
  const adminCss = fs.readFileSync(path.join(root, 'src/features/admin/admin.css'), 'utf8');
  const html = `<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${adminCss}</style><body><div id="root"></div><script src="/test-bundle.js"></script></body></html>`;
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/test-bundle.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/test-bundle.js' ? bundle.outputFiles[0].text : html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const output = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-navigation-')); fs.mkdirSync(output, { recursive: true });
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const width of [375, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'Asia/Tokyo' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let updatedState = null, rejectNextUpdate = true;
      await page.route('https://dashboard-api.test/**', async route => {
        const url = new URL(route.request().url());
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        assert.equal(route.request().headers().authorization, 'Token fixture-owner');
        let body;
        if (url.pathname === '/api/tienda/dashboard/') body = { exito: true, data: metrics(url.searchParams.get('periodo')) };
        else if (url.pathname === '/api/tienda/pedidos/ultimos/') body = { exito: true, data: orders.slice(0, 5).map(o => ({ ...o, estado_etiqueta: o.estado })) };
        else if (url.pathname === '/api/tienda/pedidos/') body = orders.map(order => order.id_pedido === 3 && updatedState ? {...order,estado:updatedState} : order);
        else if (url.pathname === '/api/tienda/pedidos/3/estado/') {
          assert.equal(route.request().method(), 'PATCH');
          if (rejectNextUpdate) {
            rejectNextUpdate = false;
            return route.fulfill({status:409,headers,json:{exito:false,mensaje:'Transición rechazada por servidor'}});
          }
          updatedState = route.request().postDataJSON().estado;
          body = {exito:true,data:{id_pedido:3,estado:updatedState,estado_etiqueta:'En origen'}};
        }
        else throw Error(`Endpoint inesperado: ${url.pathname}`);
        await route.fulfill({ status: 200, headers, json: body });
      });
      const rows = () => page.getByRole('button', { name: /^Ver pedido / });
      const expectIds = async expected => {
        await page.getByText(/pedidos coinciden con los filtros/).waitFor();
        const ids = (await rows().all()).length ? await rows().evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('aria-label').replace('Ver pedido ORD-', '')))) : [];
        assert.deepEqual(ids, expected);
      };
      await page.goto(`${base}/emprendedor`);
      await page.getByLabel('Período', { exact: true }).selectOption('7');
      const sales = page.getByRole('link', { name: 'Ventas Totales: ver pedidos del período seleccionado' });
      await sales.waitFor(); await sales.focus(); await sales.press('Enter');
      await page.waitForURL('**/emprendedor/pedidos?*');
      assert.equal(new URL(page.url()).searchParams.get('estado'), 'confirmed');
      assert.equal(new URL(page.url()).searchParams.get('fecha_desde'), '2026-10-08');
      assert.equal(new URL(page.url()).searchParams.get('fecha_hasta'), '2026-10-14');
      assert.equal(new URL(page.url()).searchParams.get('periodo'), '7');
      await expectIds([2, 3, 4, 5, 6, 7, 11]);
      await page.goBack(); await page.getByRole('link', { name: 'Órdenes Totales: ver pedidos del período seleccionado' }).waitFor();
      assert.equal(await page.getByLabel('Período', { exact: true }).inputValue(), '7');
      await page.goForward(); await expectIds([2, 3, 4, 5, 6, 7, 11]);
      await page.getByRole('button', { name: 'Pendientes', exact: true }).click(); await expectIds([1]);
      await page.goBack(); await expectIds([2, 3, 4, 5, 6, 7, 11]);
      await page.reload(); await expectIds([2, 3, 4, 5, 6, 7, 11]);
      await page.getByRole('link', { name: 'Volver al dashboard', exact: false }).click();
      await page.getByRole('link', { name: 'Órdenes Totales: ver pedidos del período seleccionado' }).click(); await expectIds([1, 2, 3, 4, 5, 6, 7, 8, 11]);
      await page.getByRole('link', {name:'Volver al dashboard',exact:false}).click();
      await page.getByRole('link', {name:'Ticket promedio: ver pedidos del período seleccionado',exact:true}).click();await expectIds([2,3,4,5,6,7,11]);
      await page.getByRole('link', { name: 'Volver al dashboard', exact: false }).click();
      await page.getByRole('link', { name: 'Por Despachar: ver pedidos del período seleccionado' }).click(); await expectIds([1, 2, 3, 4, 11]);
      await page.getByRole('link', { name: 'Volver al dashboard', exact: false }).click();
      const graph = page.getByRole('link', {name: /^Ventas del 10\/10\/2026:/});
      await graph.focus(); await graph.press('Enter'); await expectIds([2]);
      assert.equal(new URL(page.url()).searchParams.get('estado'), 'confirmed');
      await page.getByRole('link', {name: 'Volver al dashboard', exact:false}).click();
      await page.getByRole('link', {name: /^Pedidos del 14\/10\/2026:/}).click(); await expectIds([1,3,4,5,6,7,8]);
      await page.getByRole('link', {name: 'Volver al dashboard', exact:false}).click();
      await page.getByRole('link', {name: 'cancelado: 1 pedidos. Ver pedidos de este estado', exact:true}).click(); await expectIds([8]);
      await page.getByRole('link', {name: 'Volver al dashboard', exact:false}).click();
      await page.getByText('Ver tabla diaria de ventas y pedidos', {exact:true}).click();
      const day = page.getByRole('link', { name: 'Ver pedidos del 10/10/2026', exact: true });
      await day.focus(); await day.press('Enter'); await expectIds([2]);
      assert.equal(new URL(page.url()).searchParams.get('fecha_desde'), new URL(page.url()).searchParams.get('fecha_hasta'));
      await page.getByRole('link', { name: 'Volver al dashboard', exact: false }).click();
      await page.getByRole('link', { name: 'Ver detalle del pedido ORD-3', exact: true }).click();
      await page.getByRole('region', { name: 'Detalle del pedido ORD-3', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('pedido'), '3');
      await page.reload(); await page.getByRole('region', { name: 'Detalle del pedido ORD-3', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Detalle del pedido ORD-3');
      const beforeUpdate = page.url();
      await page.getByRole('combobox', {name:'Estado del pedido',exact:true}).selectOption('enviado');
      await page.getByRole('alert').filter({hasText:'Transición rechazada por servidor'}).waitFor();
      assert.equal(await page.getByRole('combobox', {name:'Estado del pedido',exact:true}).inputValue(),'preparando');
      await page.getByRole('combobox', {name:'Estado del pedido',exact:true}).selectOption('en_origen');
      await page.getByRole('status').filter({hasText:'Estado logístico actualizado a: En origen'}).waitFor();
      assert.equal(await page.getByRole('combobox', {name:'Estado del pedido',exact:true}).inputValue(),'en_origen');
      assert.equal(page.url(),beforeUpdate);
      await page.reload();await page.getByRole('combobox', {name:'Estado del pedido',exact:true}).waitFor();
      assert.equal(await page.getByRole('combobox', {name:'Estado del pedido',exact:true}).inputValue(),'en_origen');
      await page.getByRole('button', { name: 'Cerrar detalle del pedido' }).click();
      assert.equal(new URL(page.url()).searchParams.has('pedido'), false);
      await page.goBack(); await page.getByRole('region', { name: 'Detalle del pedido ORD-3', exact: true }).waitFor();
      await page.goto(`${base}/emprendedor/pedidos?fecha_desde=2026-02-30`);
      await page.getByRole('alert').waitFor(); await expectIds([]);
      await page.goto(`${base}/emprendedor?periodo=year`);
      await page.getByRole('link', { name: 'Ventas Totales: ver pedidos del período seleccionado' }).waitFor();
      assert.equal(await page.getByLabel('Período', { exact: true }).inputValue(), 'year');
      await page.getByRole('link', {name:/^Pedidos del 01\/10\/2026 al 14\/10\/2026:/}).click();await expectIds([1,2,3,4,5,6,7,8,9,11]);
      assert.equal(new URL(page.url()).searchParams.get('fecha_desde'),'2026-10-01');
      assert.equal(new URL(page.url()).searchParams.get('periodo'),'year');
      await page.getByRole('link', {name:'Volver al dashboard',exact:false}).click();
      await page.getByRole('link', { name: 'Órdenes Totales: ver pedidos del período seleccionado' }).click();
      assert.equal(new URL(page.url()).searchParams.get('fecha_desde'), '2026-01-01'); await expectIds([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
      await page.getByLabel('Desde', { exact: true }).fill('2026-10-14'); await expectIds([1, 3, 4, 5, 6, 7, 8]);
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click(); await expectIds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      await page.getByRole('button', { name: 'Ver pedido ORD-1', exact: true }).focus();
      await page.getByRole('button', { name: 'Ver pedido ORD-1', exact: true }).press('Space');
      await page.getByRole('region', { name: 'Detalle del pedido ORD-1', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Aprobar pago', exact: true }).isEnabled(), true);
      await page.screenshot({ path: path.join(output, `orders-navigation-${width}.png`), fullPage: true });
      await page.goto(`${base}/emprendedor?periodo=7`); await sales.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.animate-fade-in')].every(node => getComputedStyle(node).opacity === '1'));
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
      assert.ok(dimensions.scroll <= dimensions.width, `sin desbordamiento a ${width}px`);
      await page.screenshot({ path: path.join(output, `dashboard-navigation-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`OK ${width}px: tarjetas, filtros reales, teclado, períodos, histórico, detalle, recarga, atrás/adelante y fechas Chile con navegador en Tokio`);
      await page.close();
    }
    console.log(`Capturas: ${output}`);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
