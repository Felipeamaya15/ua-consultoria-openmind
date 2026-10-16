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
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(adminSource, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS}}).outputText,
    {
      module,
      exports: module.exports,
      fetch,
      localStorage: {getItem: () => 'owner-token'},
      sessionStorage: {getItem: () => null},
      require: () => ({API_BASE_URL: 'http://localhost:8000'}),
    });
  return module.exports;
}

(async () => {
  // 1. Creación de descuento porcentual en el panel de administración
  let adminReq;
  const adminService = loadAdmin(async (url, options) => {
    adminReq = {url, options};
    return {ok: true, json: async () => ({exito: true, data: {
      id: 7, name: 'Descuento Verano', code: 'VERANO20', type: 'percentage',
      value: '20.00', minAmount: '10000.00', maxUses: 50, usedCount: 0,
      startsAt: '2026-10-16', endsAt: '2026-11-16', active: true,
    }})};
  });
  const created = await adminService.promotionService.create({
    name: ' Descuento Verano ', code: ' verano20 ', type: 'percentage',
    value: 20, minAmount: 10000, maxUses: 50, startsAt: '2026-10-16', endsAt: '2026-11-16', active: true,
  });
  assert.equal(adminReq.url, 'http://localhost:8000/api/promociones/');
  assert.equal(adminReq.options.method, 'POST');
  assert.equal(JSON.parse(adminReq.options.body).type, 'percentage');
  assert.equal(JSON.parse(adminReq.options.body).value, 20);
  assert.equal(created.type, 'percentage');
  assert.equal(created.value, 20);
  assert.equal(created.code, 'VERANO20');

  // 2. Validación de descuento porcentual y envío gratis en checkout
  let request;
  const service = loadStorefront(async (url, options) => {
    request = {url, options};
    return {ok: true, json: async () => ({exito: true, data: {
      code: 'VERANO20', type: 'percentage', discount: '5000.00', shipping: '3990.00',
      message: 'Codigo promocional aplicado correctamente.',
    }})};
  });
  const pctResult = await service.validatePromotion(' verano20 ', 25000, 3990);
  assert.equal(request.url, 'http://localhost:8000/api/promociones/validar/');
  assert.equal(pctResult.type, 'percentage');
  assert.equal(pctResult.discount, 5000);
  assert.equal(pctResult.shipping, 3990);

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

  const invalid = loadStorefront(async () => ({ok: false, json: async () => ({exito: false, mensaje: 'El codigo promocional expiro.'})}));
  await assert.rejects(invalid.validatePromotion('EXPIRADA', 10000, 0), /expiro/);
  console.log('OK: creacion de descuento porcentual y validacion de promociones en checkout');
})().catch(error => {console.error(error); process.exitCode = 1;});