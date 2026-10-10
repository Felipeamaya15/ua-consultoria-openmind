const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadService(fetchMock) {
  const module = {exports: {}};
  const source = fs.readFileSync(
    path.join(root, 'src/features/storefront/services/shippingService.ts'),
    'utf8',
  ).replaceAll('import.meta.env.VITE_API_URL', 'undefined');
  const requireMock = name => {
    if (name.endsWith('/api')) return {API_BASE_URL: 'http://localhost:8000'};
    if (name.includes('initialLoad')) return {fetchInitialLoad: fetchMock};
    if (name.includes('authService')) return {authService: {getToken: () => null}};
    if (name.includes('comunasChile')) return {nombreOficialRegion: value => value};
    return {};
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS},
  }).outputText, {module, exports: module.exports, require: requireMock, fetch: fetchMock, Error});
  return module.exports.shippingService;
}

const detail = tracking => ({
  numero_seguimiento: tracking,
  proveedor: 'CHILEXPRESS',
  estado_actual: 'EN_DISTRIBUCION',
  descripcion_estado: 'Envio en camino para entrega final.',
  fecha_estimada_entrega: '2026-10-10T19:00:00Z',
  historial: [{
    fecha_hora: '2026-10-09T11:45:00Z',
    estado: 'EN_DISTRIBUCION',
    descripcion: 'Envio asignado a movil de reparto.',
    ubicacion: 'Ruta ultima milla',
  }],
});

(async () => {
  const calls = [];
  let responseBody = {exito: true, data: detail('CHILEX-DEMO123')};
  let responseOk = true;
  const fetchMock = async url => {
    calls.push(url);
    return {ok: responseOk, json: async () => responseBody};
  };
  const service = loadService(fetchMock);

  const result = await service.getTracking(' CHILEX-DEMO123 ');
  assert.equal(result.proveedor, 'CHILEXPRESS');
  assert.equal(calls[0], 'http://localhost:8000/api/logistica/seguimiento/chilexpress/CHILEX-DEMO123/');

  responseBody = {exito: true, data: detail('12345678')};
  await service.getChilexpressTracking('12345678');
  assert.equal(calls[1], 'http://localhost:8000/api/logistica/seguimiento/chilexpress/12345678/');

  responseBody = {exito: true, data: {...detail('CHILEX-DEMO123'), proveedor: 'STARKEN'}};
  await assert.rejects(service.getTracking('CHILEX-DEMO123'), /información de seguimiento recibida es inválida/);

  responseOk = false;
  responseBody = {exito: false, mensaje: 'Orden de transporte no encontrada'};
  await assert.rejects(service.getChilexpressTracking('CHILEX-NOTFOUND'), /Orden de transporte no encontrada/);
  await assert.rejects(service.getChilexpressTracking('  '), /Ingresa una orden de transporte de Chilexpress/);

  console.log('OK: consulta Chilexpress, ruta dedicada, orden numerica y validacion de respuesta.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
