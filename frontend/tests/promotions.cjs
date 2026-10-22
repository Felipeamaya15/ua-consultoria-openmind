const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');

const storefrontSource = fs.readFileSync(path.resolve(__dirname, '../src/features/storefront/services/promotionService.ts'), 'utf8')
  .replaceAll('import.meta.env.VITE_API_URL', 'undefined');
const adminSource = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/services/promotionService.ts'), 'utf8')
  .replaceAll('import.meta.env.VITE_API_URL', 'undefined');

function loadStorefront(fetch) {
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(storefrontSource, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS}}).outputText,
    {module, exports: module.exports, fetch, require: () => ({API_BASE_URL: 'http://localhost:8000'})});
  return module.exports;
}

function loadAdmin(fetch) {
  return require('./source-loader.cjs').load('src/features/admin/services/promotionService.ts', {'../../../api': {API_BASE_URL:'http://localhost:8000'}}, {fetch,localStorage:{getItem:()=>'owner-fixture'},sessionStorage:{getItem:()=>null}});
}

(async () => {
  let adminReq;
  const adminService = loadAdmin(async (url, options) => {
    adminReq = {url, options};
    const body = JSON.parse(options.body);
    return {ok: true, json: async () => ({exito: true, data: {
      id: body.type === 'percentage' ? 7 : body.type === 'fixed' ? 8 : 9,
      name: body.name, code: body.code, type: body.type,
      value: String(body.value ?? 0), minAmount: String(body.minAmount ?? 0), maxUses: body.maxUses ?? null, usedCount: 0,
      startsAt: body.startsAt, endsAt: body.endsAt ?? null, active: true,
    }})};
  });

  const createdPct = await adminService.promotionService.create({
    name: ' Descuento Verano ', code: ' verano20 ', type: 'percentage',
    value: 20, minAmount: 10000, maxUses: 50, startsAt: '2026-10-16', endsAt: '2026-11-16', active: true,
  });
  assert.equal(adminReq.url, 'http://localhost:8000/api/promociones/');
  assert.equal(adminReq.options.method, 'POST');
  assert.equal(JSON.parse(adminReq.options.body).type, 'percentage');
  assert.equal(JSON.parse(adminReq.options.body).value, 20);
  assert.equal(createdPct.type, 'percentage');
  assert.equal(createdPct.value, 20);
  assert.equal(createdPct.code, 'VERANO20');

  const createdFixed = await adminService.promotionService.create({
    name: ' Bienvenida Fijo ', code: ' nuevo-5000 ', type: 'fixed',
    value: 5000, minAmount: 15000, maxUses: 20, startsAt: '2026-10-16', active: true,
  });
  assert.equal(JSON.parse(adminReq.options.body).type, 'fixed');
  assert.equal(JSON.parse(adminReq.options.body).value, 5000);
  assert.equal(createdFixed.type, 'fixed');
  assert.equal(createdFixed.value, 5000);
  assert.equal(createdFixed.code, 'NUEVO-5000');

  const createdFreeShipping = await adminService.promotionService.create({
    name: ' Envío Gratis Sobre 25000 ', code: ' envio-25k ', type: 'free_shipping',
    value: 0, minAmount: 25000, startsAt: '2026-10-16', active: true,
  });
  assert.equal(JSON.parse(adminReq.options.body).type, 'free_shipping');
  assert.equal(JSON.parse(adminReq.options.body).minAmount, 25000);
  assert.equal(createdFreeShipping.type, 'free_shipping');
  assert.equal(createdFreeShipping.minAmount, 25000);
  assert.equal(createdFreeShipping.code, 'ENVIO-25K');

  let request;
  const pctService = loadStorefront(async (url, options) => {
    request = {url, options};
    return {ok: true, json: async () => ({exito: true, data: {
      code: 'VERANO20', type: 'percentage', discount: '5000.00', shipping: '3990.00',
      message: 'Codigo promocional aplicado correctamente.',
    }})};
  });
  const pctResult = await pctService.validatePromotion(' verano20 ', 25000, 3990);
  assert.equal(request.url, 'http://localhost:8000/api/promociones/validar/');
  assert.equal(pctResult.type, 'percentage');
  assert.equal(pctResult.discount, 5000);
  assert.equal(pctResult.shipping, 3990);

  const fixedService = loadStorefront(async (url, options) => {
    request = {url, options};
    return {ok: true, json: async () => ({exito: true, data: {
      code: 'NUEVO-5000', type: 'fixed', discount: '5000.00', shipping: '3990.00',
      message: 'Codigo promocional aplicado correctamente.',
    }})};
  });
  const fixedResult = await fixedService.validatePromotion(' nuevo-5000 ', 25000, 3990);
  assert.deepEqual(JSON.parse(request.options.body), {code: 'nuevo-5000', subtotal: 25000, shipping: 3990});
  assert.equal(fixedResult.type, 'fixed');
  assert.equal(fixedResult.discount, 5000);
  assert.equal(fixedResult.shipping, 3990);

  const freeShipService = loadStorefront(async (url, options) => {
    request = {url, options};
    return {ok: true, json: async () => ({exito: true, data: {
      code: 'ENVIO-GRATIS', type: 'free_shipping', discount: '0.00', shipping: '0.00',
      message: 'Codigo promocional aplicado correctamente.',
    }})};
  });
  const result = await freeShipService.validatePromotion(' envio-gratis ', 25000, 3990);
  assert.deepEqual(JSON.parse(request.options.body), {code: 'envio-gratis', subtotal: 25000, shipping: 3990});
  assert.equal(result.shipping, 0);
  assert.equal(result.code, 'ENVIO-GRATIS');

  const belowMinimum = loadStorefront(async () => ({
    ok: false,
    json: async () => ({exito: false, mensaje: 'La compra minima para este codigo es $25000.'}),
  }));
  await assert.rejects(belowMinimum.validatePromotion('ENVIO-GRATIS', 15000, 3990), /compra minima para este codigo es \$25000/);

  const invalid = loadStorefront(async () => ({ok: false, json: async () => ({exito: false, mensaje: 'El codigo promocional expiro.'})}));
  await assert.rejects(invalid.validatePromotion('EXPIRADA', 10000, 0), /expiro/);
  console.log('OK: creacion y validacion de descuento porcentual, monto fijo y monto minimo de envio gratis en checkout');
})().catch(error => {console.error(error); process.exitCode = 1;});