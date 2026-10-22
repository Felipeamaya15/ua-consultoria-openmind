// E2E con componentes, servicios, PostgreSQL y MongoDB reales en el servidor QA temporal.
// Antes: backend/venv/Scripts/python.exe backend/scripts/serve_sprint6_qa.py --from-docker
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const runtime = process.env.QA_NODE_MODULES || 'C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const root = path.resolve(__dirname, '..'), out = process.env.SPRINT6_QA_OUT || path.resolve(root, '../docs/sprint6-qa/browser');
const api = 'http://127.0.0.1:8005';
const results = [], errors = [];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const fixture = await (await fetch(`${api}/__qa_fixture`)).json();
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
  import{CartProvider,useCart}from'./src/features/storefront/context/CartContext';
  import Checkout from './src/features/storefront/pages/Checkout';import OrderConfirmation from './src/features/storefront/pages/OrderConfirmation';
  import Orders from './src/features/admin/pages/Orders';import Dashboard from './src/features/admin/pages/Dashboard';import Shipping from './src/features/admin/pages/Shipping';import Promotions from './src/features/admin/pages/Promotions';
  import{AdminProvider}from'./src/features/admin/context/AdminContext';import{AdminHelpProvider}from'./src/features/admin/context/AdminHelpContext';
  import{resolveVisualConfig}from'./src/features/storefront/visual/resolveVisualConfig';import{visualConfigToCssVariables}from'./src/features/storefront/visual/cssVariables';
  import{guestCartKey}from'./src/features/storefront/services/guestCartStorage';
  const q=window.QA,identity={apiBaseUrl:q.api,storeId:q.storeId};
  if(location.pathname.startsWith('/emprendedor'))localStorage.setItem('token',q.ownerToken);else localStorage.removeItem('token');
  const item={productId:q.productId,variantId:'QA-E2E',sku:'QA-E2E',name:'Producto QA',image:'',attributes:{},quantity:2,price:10000,maxStock:200};
  if(!location.pathname.startsWith('/emprendedor'))localStorage.setItem(guestCartKey(identity),JSON.stringify([item]));
  const template=['editorial','minimal','visual','catalog'][Number(location.pathname.split('/')[2])-1]||'editorial';
  function Controls(){const cart=useCart();return <div className="flex gap-3 p-2"><button id="qa-qty1" onClick={()=>cart.updateQuantity(q.productId,'QA-E2E',1)}>QA cantidad 1</button><button id="qa-qty2" onClick={()=>cart.updateQuantity(q.productId,'QA-E2E',2)}>QA cantidad 2</button></div>}
  function Shop(){return <CartProvider><Controls/><Checkout/></CartProvider>}
  function Admin({children}){return <AdminHelpProvider><AdminProvider>{children}</AdminProvider></AdminHelpProvider>}
  createRoot(document.getElementById('root')).render(<BrowserRouter><div data-storefront-visual={template} className="min-h-screen p-3" style={visualConfigToCssVariables(resolveVisualConfig({template}))}>
  <Routes><Route path="/plantilla/:id/checkout" element={<Shop/>}/><Route path="/plantilla/:id/pedido-confirmado" element={<OrderConfirmation/>}/>
  <Route path="/emprendedor" element={<Dashboard/>}/><Route path="/emprendedor/pedidos" element={<Orders/>}/>
  <Route path="/emprendedor/entregas" element={<Admin><Shipping/></Admin>}/><Route path="/emprendedor/promociones" element={<Admin><Promotions/></Admin>}/></Routes></div></BrowserRouter>);`;
  const bundle = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, jsx: 'automatic', bundle: true, write: false, format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ VITE_API_URL: api }) }, plugins: [{ name: 'qa-identity-only', setup(build) {
      build.onLoad({ filter: /StoreIdentityContext\.tsx$/ }, () => ({ loader: 'js', contents: `export const useStoreIdentity=()=>({identity:{apiBaseUrl:'${api}',storeId:'${fixture.storeId}'},loading:false,error:'',retry(){}});` }));
    } }] });
  const assets = path.join(root, 'dist/assets'), css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(n => /^index-.*\.css$/.test(n))), 'utf8');
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/qa.js' ? bundle.outputFiles[0].text : `<html lang="es-CL"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script></html>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true, channel: 'msedge' });
  async function page(width = 1280) {
    const p = await browser.newPage({ viewport: { width, height: 950 }, locale: 'en-US', timezoneId: 'Pacific/Honolulu' });
    await p.addInitScript(q => { window.QA = q; }, fixture);
    p.on('pageerror', e => errors.push(e.message));
    return p;
  }
  async function start(p, template = 1) {
    await p.goto(`${base}/plantilla/${template}/checkout`);
    await p.getByLabel('Nombre completo', { exact: true }).fill('Comprador QA');
    await p.getByLabel('Correo electrónico', { exact: true }).fill('buyer@example.test');
    await p.getByRole('button', { name: /Continuar/ }).click();
    await p.getByRole('radio', { name: 'Retiro en tienda', exact: true }).check({ force: true });
  }
  async function pickup(p) {
    // La elección de retiro no exige reservar fecha/hora. Sí muestra la información del local.
    const option = p.getByRole('radio', { name: 'Retiro en tienda', exact: true });
    assert.equal(await option.isChecked(), true);
    await p.getByText('La tienda te informará cuando tu pedido esté listo para retirar.', { exact: false }).waitFor();
    assert.equal(await p.locator('#pickup-date').count(), 0);
    assert.equal(await p.locator('#pickup-time').count(), 0);
    assert.ok((await p.locator('body').textContent()).includes('Gratis ($0)'));
  }
  async function apply(p, code) {
    await p.locator('#checkout-promo-code').fill(code);
    await p.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await p.getByText('Codigo promocional aplicado correctamente.', { exact: true }).waitFor();
  }
  async function payment(p) {
    await p.getByRole('button', { name: /Continuar/ }).click();
    await p.getByRole('radio', { name: /Transferencia/ }).check({ force: true });
    await p.getByRole('button', { name: /Revisar pedido|Continuar/ }).click();
  }
  try {
    let pickupOrderId;
    for (const [template, width] of [[1, 375], [2, 768], [3, 1280], [4, 375]]) {
      const p = await page(width); await start(p, template); await pickup(p);
      await p.getByRole('button', { name: /Continuar/ }).click();
      await p.getByRole('button', { name: /Volver/ }).click();
      await pickup(p);
      if (template === 1) {
        await apply(p, 'QA20');
        assert.ok((await p.locator('aside').textContent()).includes('4.000'));
        await payment(p);
        await p.locator('#qa-qty1').click();
        await p.getByText('Vuelve a aplicar el codigo porque cambio el pedido o el envio.').waitFor();
        assert.equal(await p.getByRole('button', { name: /Confirmar y pagar/ }).isDisabled(), true);
        await apply(p, 'QA20');
        assert.ok((await p.locator('aside').textContent()).includes('2.000'));
        await p.getByRole('button', { name: 'Quitar', exact: true }).click();
        await p.getByText('Promoción eliminada.').waitFor();
        await p.locator('#qa-qty2').click(); await apply(p, 'QA300');
      }
      if (template !== 1) await payment(p);
      assert.ok(!(await p.locator('body').textContent()).includes('10:07 h · Hora de Chile'));
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin desbordamiento');
      await p.screenshot({ path: path.join(out, `retiro-${template}-${width}.png`), fullPage: true });
      const reply = p.waitForResponse(r => r.url() === `${api}/api/checkout/pedidos/` && r.request().method() === 'POST');
      await p.getByRole('button', { name: /Confirmar y pagar/ }).click();
      const response = await reply, data = (await response.json()).data;
      assert.equal(response.status(), 201); assert.equal(data.costo_envio, '0.00');
      assert.equal(data.monto_total, template === 1 ? '19700.00' : '20000.00');
      const payload = response.request().postDataJSON();
      assert.equal(Object.hasOwn(payload, 'retiro_seleccion'), false);
      const detail = await (await fetch(`${api}/api/tienda/pedidos/`, { headers: { Authorization: `Token ${fixture.ownerToken}` } })).json();
      const order = detail.find(row => row.id_pedido === data.id_pedido);
      assert.ok(order, 'el pedido aparece en la tienda');
      assert.ok(!order.entrega?.retiro?.seleccion?.hora, 'sin reserva de hora');
      pickupOrderId = data.id_pedido;
      results.push(`PASS checkout real retiro plantilla ${template}, ${width}px; pedido ${data.id_pedido}`);
      await p.close();
    }
    const p = await page(); await start(p); await p.getByRole('radio', { name: 'Chilexpress', exact: true }).check({ force: true });
    await p.getByLabel('Calle', { exact: true }).fill('Calle QA'); await p.getByLabel('Número', { exact: true }).fill('123');
    await p.getByLabel('Comuna', { exact: true }).selectOption('Providencia');
    await p.getByText(/Tarifa de la tienda/).first().waitFor();
    await apply(p, 'QAFREE'); await payment(p);
    const shippingReply = p.waitForResponse(r => r.url() === `${api}/api/checkout/pedidos/` && r.request().method() === 'POST');
    await p.getByRole('button', { name: /Confirmar y pagar/ }).click();
    const shipped = await shippingReply, body = (await shipped.json()).data;
    assert.equal(shipped.status(), 201); assert.equal(body.monto_total, '20000.00'); assert.equal(body.costo_envio, '0.00');
    assert.ok(shipped.request().postDataJSON().cotizacion); results.push('PASS despacho real + envío gratis con cotización y persistencia');
    await p.close();
    const admin = await page(375); await admin.goto(`${base}/emprendedor/entregas`);
     // Editor compacto: el reloj circular solo cambia el formulario;
     // Guardar entregas es la operación que persiste en el backend.
     await admin.locator('summary').filter({ hasText: 'Lunes' }).click();
     const startClock = admin.locator('#pickup-mon-start');
     await startClock.click();
     await admin.getByRole('dialog', { name: /Seleccionar inicio lunes/i }).waitFor();
     await admin.getByRole('button', { name: '9 horas', exact: true }).click();
     await admin.getByRole('button', { name: '15 minutos', exact: true }).click();
     await admin.getByRole('dialog').getByRole('button', { name: 'Aceptar' }).click();
     assert.equal((await startClock.textContent()).trim(), '09:15');
     await admin.getByRole('button', { name: 'Guardar entregas', exact: true }).click();
     await admin.getByText('Configuración de entregas guardada.', { exact: true }).waitFor();
     await admin.reload();
     assert.equal((await admin.locator('#pickup-mon-start').textContent()).trim(), '09:15');
    await admin.screenshot({ path: path.join(out, 'configuracion-retiro-375.png'), fullPage: true });
    results.push('PASS horarios emprendedor guardados y recargados desde API real');
    await admin.goto(`${base}/emprendedor/pedidos?pedido=${pickupOrderId}`);
    await admin.waitForURL(url =>
  url.searchParams.get('pedido') === String(pickupOrderId)
);
const ordersResponse = await fetch(`${api}/api/tienda/pedidos/`, {
  headers: { Authorization: `Token ${fixture.ownerToken}` }
});

assert.equal(ordersResponse.status, 200);

const orders = await ordersResponse.json();
const registeredOrder = orders.find(
  order => String(order.id_pedido) === String(pickupOrderId)
);

assert.ok(
  registeredOrder,
  `El pedido ${pickupOrderId} debe existir en el backend`
);

assert.ok(
  registeredOrder.entrega?.retiro,
  'El pedido debe conservar su modalidad de retiro'
);
    await admin.getByText(`Retiro`, { exact: false }).first().waitFor({state: 'visible',});
    await admin.waitForURL(/fecha_desde=2026-01-01/);
    assert.ok(admin.url().includes('2026-01-01'));
    await admin.screenshot({ path: path.join(out, 'pedidos-375.png'), fullPage: true });
    await admin.goto(`${base}/emprendedor`); await admin.getByText('Historial e informes', { exact: true }).waitFor();
    await admin.getByText('$12.500,50 CLP', { exact: true }).first().waitFor();
    await admin.screenshot({ path: path.join(out, 'dashboard-375.png'), fullPage: true });
    const downloadPromise = admin.waitForEvent('download'); await admin.getByRole('button', { name: 'Descargar informe PDF', exact: true }).click();
    await (await downloadPromise).saveAs(path.join(out, 'informe-qa.pdf'));
    results.push('PASS dashboard, históricos, filtros DD/MM/AAAA, CLP y descarga PDF reales');
    await admin.goto(`${base}/emprendedor/promociones`);
    await admin.getByRole('button', { name: /Nueva promoción/ }).click();
    await admin.getByLabel('Nombre interno', { exact: true }).fill('Promoción QA recuperable');
    await admin.getByLabel('Código de descuento (obligatorio)', { exact: true }).fill(`QANEW${Date.now()}`);
    await admin.getByLabel('Valor (%)', { exact: true }).fill('15');
    let blockedPosts = 0;
    const failSave = async route => {
      if (route.request().method() === 'POST') { blockedPosts++; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'client_secret=fixture-private' }) }); }
      else await route.continue();
    };
    await admin.route(`${api}/api/promociones/`, failSave);
    const savePromotion = admin.getByRole('button', { name: /Crear promoción|Guardar promoción|Guardar cambios/ });
    await savePromotion.evaluate(button => { button.click(); button.click(); });
    await admin.getByText('El servicio no está disponible en este momento. Intenta nuevamente más tarde.', { exact: true }).waitFor();
    assert.equal(blockedPosts, 1); assert.equal(await admin.getByLabel('Nombre interno', { exact: true }).inputValue(), 'Promoción QA recuperable');
    assert.ok(!(await admin.locator('body').textContent()).includes('fixture-private'));
    await admin.screenshot({ path: path.join(out, 'error-formulario-375.png'), fullPage: true });
    await admin.unroute(`${api}/api/promociones/`, failSave); await savePromotion.click();
    await admin.getByText('Promoción creada correctamente.', { exact: true }).waitFor();
    await admin.screenshot({ path: path.join(out, 'exito-promocion-375.png'), fullPage: true });
    results.push('PASS 500 simulado conserva formulario, oculta secretos y bloquea doble envío; reintento guarda promoción en API real');
    await admin.close();
    assert.deepEqual(errors, []); console.log(results.join('\n'));
  } finally {
    fs.writeFileSync(path.join(out, 'resultados.json'), JSON.stringify({ results, errors }, null, 2));
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
