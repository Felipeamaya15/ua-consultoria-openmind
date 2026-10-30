/** SCRUM-497: el cliente no depende de que la API devuelva los secretos. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/features/admin/services/paymentConfigurationService.ts');
const transpiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;
function load(response) {
  const calls = [];
  const module = {exports: {}};
  vm.runInNewContext(transpiled, {
    module, exports: module.exports,
    JSON, Error,
    localStorage: {getItem: () => 'fake-local-token'},
    require: name => name.endsWith('/api') ? {API_BASE_URL: 'https://example.test'} : {},
    fetch: async (url, opts) => {calls.push({url, opts}); return response;},
  });
  return {service: module.exports, calls};
}

test('guarda sin requerir secretos en el cuerpo de respuesta', async () => {
  const response = {ok: true, json: async () => ({exito: true, data: {metodos: {transbank: {enabled: true, configured_fields: ['api_key']}}}})};
  const {service, calls} = load(response);
  const input = {transbank: {enabled: true, fields: {api_key: 'demo-secreto', commerce_id: 'demo-comercio'}}};
  const result = await service.savePaymentConfiguration(input);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].opts.body).metodos.transbank.fields.api_key, 'demo-secreto');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), input);
});

test('no informa éxito cuando la API rechaza guardar', async () => {
  const {service} = load({ok: false, json: async () => ({exito: false, mensaje: 'Error controlado'})});
  await assert.rejects(service.savePaymentConfiguration({}), /Error controlado/);
});
