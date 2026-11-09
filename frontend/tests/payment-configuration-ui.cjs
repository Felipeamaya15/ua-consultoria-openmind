/** SCRUM-510: UI real + endpoints existentes de Django en una BD efímera.
 * Requiere payment-configuration-api.py y Vite con VITE_API_URL apuntando a esa API.
 * Playwright se instala aparte; no agrega dependencias al producto.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.PAYMENTS_UI_URL || 'http://127.0.0.1:5176';
const api = process.env.PAYMENTS_API_URL || 'http://127.0.0.1:8006';
const output = path.resolve(__dirname, '../../docs/sprint7/SCRUM-510-evidencia');
const checks = [];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const fixture = await (await fetch(`${api}/__qa_fixture/`)).json();
  const headers = { Authorization: `Token ${fixture.token}`, 'Content-Type': 'application/json' };
  await fetch(`${api}/__qa_transfer/`, { method: 'POST', headers, body: '{}' });
  await fetch(`${api}/api/catalog/tiendas/${fixture.storeId}/configuracion/paypal/`, {
    method: 'POST', headers, body: JSON.stringify({ client_id: '', client_secret: '', ambiente: 'SANDBOX', activo: false }),
  });
  const read = async () => (await (await fetch(`${api}/api/pagos/configuracion/`, { headers })).json()).data;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(token => localStorage.setItem('token', token), fixture.token);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let writes = 0;
  page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/api/pagos/configuracion/')) writes++; });
  const card = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  // Se captura cada tarjeta completa, sin que la cabecera sticky la tape durante la captura.
  const capture = (target, name) => target.screenshot({ path: path.join(output, name), style: '.admin-header { visibility: hidden !important; }' });
  const transfer = card('Transferencia bancaria');
  const bank = page.locator('#transfer-bank_name');
  const type = page.locator('#transfer-account_type');
  const input = key => page.locator(`#transfer-${key}`);
  const save = page.getByRole('button', { name: 'Guardar transferencia bancaria', exact: true });
  const open = async () => {
    await page.goto(`${base}/emprendedor/pagos`);
    await save.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-transfer-config]')?.disabled === false);
  };
  const saveTransfer = async () => {
    const response = page.waitForResponse(r => r.url().endsWith('/api/pagos/configuracion/') && r.request().method() === 'PUT');
    await save.click();
    assert.equal((await response).status(), 200);
    await transfer.getByText('Datos bancarios guardados para esta tienda.', { exact: true }).waitFor();
  };
  try {
    await open();
    assert.equal(await page.getByRole('link', { name: /Cómo obtener las credenciales de Transbank/ }).count(), 1);
    assert.equal(await page.getByRole('link', { name: /Obtener credenciales en PayPal Developer/ }).count(), 1);
    await capture(card('Webpay / Transbank'), '01-transbank-desktop.png');
    await capture(card('PayPal'), '02-paypal-desktop.png');
    checks.push('Ayudas de Transbank y PayPal visibles, con enlaces oficiales.');

    const before = writes;
    await save.click();
    await transfer.getByText('RUT del titular es obligatorio.', { exact: true }).waitFor();
    assert.equal(writes, before, 'El formulario vacío no debe enviarse a la API.');
    await capture(transfer, '03-validaciones-obligatorios.png');
    checks.push('El guardado individual vacío muestra errores por campo y no envía PUT.');

    await bank.selectOption('BancoEstado');
    await type.selectOption('CuentaRUT');
    await input('account_number').fill('12345678');
    await input('holder_name').fill('María González QA');
    await input('holder_rut').fill('12.345.678-9');
    await input('confirmation_email').fill('correo-invalido');
    await save.click();
    assert.equal(writes, before);
    await transfer.getByText(/Ingresa un RUT válido con su dígito verificador/).waitFor();
    await transfer.getByText('Ingresa un correo válido para recibir comprobantes.', { exact: true }).waitFor();
    await input('holder_rut').fill('12.345.678-5');
    await input('confirmation_email').fill('pagos@example.test');
    await input('instructions').fill('Indica el número de pedido al transferir.');
    const toggle = page.getByRole('checkbox', { name: 'Activar Transferencia bancaria', exact: true });
    await toggle.locator('..').locator('..').click();
    assert.equal(await toggle.isChecked(), true, await transfer.innerText());
    await saveTransfer();
    assert.equal((await read()).transfer.enabled, true);
    await capture(transfer, '04-transferencia-guardada.png');
    await open();
    assert.equal(await bank.inputValue(), 'BancoEstado');
    assert.equal(await type.inputValue(), 'CuentaRUT');
    assert.equal(await input('holder_rut').inputValue(), '12.345.678-5');
    checks.push('RUT y correo inválidos bloqueados; CuentaRUT guardada en la API real y recuperada al recargar.');

    await bank.selectOption('BCI');
    assert.equal(await type.inputValue(), '', 'Cambiar a BCI debe limpiar CuentaRUT.');
    assert.equal(await type.locator('option[value="CuentaRUT"]').count(), 0);
    await type.selectOption('Cuenta corriente');
    await input('account_number').fill('00123456789');
    await input('holder_name').fill('Comercial QA SpA');
    await saveTransfer();
    await open();
    assert.equal(await bank.inputValue(), 'BCI');
    assert.equal(await input('account_number').inputValue(), '00123456789');
    assert.equal(await input('holder_name').inputValue(), 'Comercial QA SpA');
    await capture(transfer, '05-transferencia-editada.png');
    checks.push('Edición persistida: banco, tipo, titular y número con ceros iniciales. CuentaRUT restringida a BancoEstado.');

    await input('account_number').fill('12-345');
    const beforeAll = writes;
    await page.getByRole('button', { name: 'Guardar todos los métodos de pago', exact: true }).click();
    await page.getByText(/Revisa los siguientes datos de transferencia:/).first().waitFor();
    assert.equal(writes, beforeAll);
    await input('account_number').fill('00123456789');
    checks.push('Guardar todos también bloquea datos bancarios inválidos antes de enviar cambios.');

    const paypal = card('PayPal');
    await paypal.getByLabel('Identificador de PayPal', { exact: true }).fill('paypal-client-qa');
    await paypal.getByRole('button', { name: 'Guardar credenciales PayPal', exact: true }).click();
    await paypal.getByText('Completa el identificador y la clave de PayPal antes de guardar.', { exact: true }).waitFor();
    await paypal.getByLabel('Clave secreta de PayPal', { exact: true }).fill('paypal-secret-qa');
    await paypal.getByRole('button', { name: 'Guardar credenciales PayPal', exact: true }).click();
    await paypal.getByText('Configuración de PayPal guardada exitosamente.', { exact: true }).waitFor();
    await open();
    assert.equal(await paypal.getByLabel('Identificador de PayPal', { exact: true }).inputValue(), 'paypal-client-qa');
    assert.equal(await paypal.getByLabel('Clave secreta de PayPal', { exact: true }).inputValue(), '');
    const tb = card('Webpay / Transbank');
    await tb.getByRole('button', { name: 'Guardar credenciales Transbank', exact: true }).click();
    await tb.getByText('Configuración de Transbank guardada exitosamente.', { exact: true }).waitFor();
    checks.push('PayPal rechaza credenciales parciales; guarda las completas y conserva el secreto al recargar. Transbank conserva su clave guardada.');

    await context.route('**/api/pagos/configuracion/', async route => {
      if (route.request().method() === 'PUT') return route.fulfill({ status: 400, json: { exito: false, mensaje: 'No se pudo guardar la cuenta.' } });
      return route.continue();
    });
    await input('holder_name').fill('Edición rechazada QA');
    await save.click();
    await transfer.getByText('No se pudo guardar la cuenta.', { exact: true }).waitFor();
    assert.equal((await read()).transfer.fields.holder_name, 'Comercial QA SpA');
    await context.unroute('**/api/pagos/configuracion/');
    checks.push('Un rechazo de la API no muestra éxito ni cambia la información guardada.');
    await open();

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await transfer.scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Sin desbordamiento a ${width}px`);
      assert.equal(await input('holder_name').inputValue(), 'Comercial QA SpA');
      if (width === 390) {
        await capture(transfer, '06-transferencia-movil.png');
        await capture(tb, '07-transbank-movil.png');
        await capture(paypal, '08-paypal-movil.png');
      }
    }
    checks.push('Panel y formularios sin desbordamiento horizontal a 1440, 390 y 320 px.');

    // Una configuración histórica desconocida sigue siendo visible y no se borra.
    const historical = { transfer: { enabled: true, fields: {
      bank_name: 'Banco histórico QA', account_type: 'Tipo histórico QA', account_number: '12345678',
      holder_rut: '12.345.678-9', holder_name: 'Titular anterior QA', confirmation_email: 'pagos@example.test',
    } } };
    await fetch(`${api}/__qa_transfer/`, { method: 'POST', headers, body: JSON.stringify(historical) });
    await open();
    assert.equal(await bank.inputValue(), 'Banco histórico QA');
    await transfer.getByText(/Conservamos tu configuración anterior/).waitFor();
    await page.getByRole('button', { name: 'Guardar todos los métodos de pago', exact: true }).click();
    await page.getByText('Métodos de pago guardados correctamente.', { exact: true }).waitFor();
    assert.deepEqual((await read()).transfer, historical.transfer);
    checks.push('Configuración histórica conservada al guardar otros métodos; se muestra sin reemplazar datos antiguos.');
    assert.deepEqual(errors, [], 'Sin errores de JavaScript.');
    fs.writeFileSync(path.join(output, 'resultados.json'), JSON.stringify({ status: 'PASS', environment: 'Chrome headless; API Django existente; SQLite en memoria; identidad visual simulada', checks, javascriptErrors: errors }, null, 2) + '\n');
    console.log(`PASS: ${checks.length} comprobaciones UI/integración; capturas en ${output}`);
  } catch (error) {
    fs.mkdirSync(path.resolve(__dirname, '../../tmp'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/scrum510-ui-failure.png'), fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
