const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/features/storefront/services/promotionService.ts'), 'utf8')
  .replaceAll('import.meta.env.VITE_API_URL', 'undefined');
function load(fetch) {
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS}}).outputText,
    {module, exports: module.exports, fetch, require: () => ({API_BASE_URL: 'http://localhost:8000'})});
  return module.exports;
}
(async () => {
  let request;
  const service = load(async (url, options) => {
    request = {url, options};
    return {ok: true, json: async () => ({exito: true, data: {
      code: 'ENVIO-GRATIS', type: 'free_shipping', discount: '0.00', shipping: '0.00',
      message: 'Codigo promocional aplicado correctamente.',
    }})};
  });
  const result = await service.validatePromotion(' envio-gratis ', 25000, 3990);
  assert.equal(request.url, 'http://localhost:8000/api/promociones/validar/');
  assert.deepEqual(JSON.parse(request.options.body), {code: 'envio-gratis', subtotal: 25000, shipping: 3990});
  assert.equal(result.shipping, 0);
  assert.equal(result.code, 'ENVIO-GRATIS');
  const invalid = load(async () => ({ok: false, json: async () => ({exito: false, mensaje: 'El codigo promocional expiro.'})}));
  await assert.rejects(invalid.validatePromotion('EXPIRADA', 10000, 0), /expiro/);
  console.log('OK: ingreso y validacion de promociones en checkout');
})().catch(error => {console.error(error); process.exitCode = 1;});
