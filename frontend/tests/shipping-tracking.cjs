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
  proveedor: 'STARKEN',
  estado_actual: 'EN_REPARTO_DOMICILIO',
  descripcion_estado: 'Carga en ruta de entrega.',
  fecha_estimada_entrega: '2026-10-10T18:00:00Z',
  historial: [{
    fecha_hora: '2026-10-09T10:20:00Z',
    estado: 'EN_REPARTO_DOMICILIO',
    descripcion: 'Carga a bordo de vehiculo de reparto.',
    ubicacion: 'Destino final',
  }],
});

(async () => {
  const calls = [];
  let responseBody = {exito: true, data: detail('STK-DEMO123')};
  let responseOk = true;
  const fetchMock = async (url, options = {}) => {
    calls.push({url, options});
    return {ok: responseOk, json: async () => responseBody};
  };
  const service = loadService(fetchMock);
  const controller = new AbortController();

  const result = await service.getTracking(' STK-DEMO123 ', controller.signal);
  assert.equal(result.proveedor, 'STARKEN');
  assert.equal(calls[0].url, 'http://localhost:8000/api/logistica/seguimiento/starken/STK-DEMO123/');
  assert.equal(calls[0].options.signal, controller.signal);

  responseBody = {exito: true, data: detail('12345678')};
  await service.getStarkenTracking('12345678');
  assert.equal(calls[1].url, 'http://localhost:8000/api/logistica/seguimiento/starken/12345678/');

  responseBody = {exito: true, data: {...detail('STK-OTHER'), historial: null}};
  await assert.rejects(service.getTracking('STK-DEMO123'), /información de seguimiento recibida es inválida/);

  responseOk = false;
  responseBody = {exito: false, mensaje: 'Orden de flete no encontrada'};
  await assert.rejects(service.getStarkenTracking('STK-NOTFOUND'), /Orden de flete no encontrada/);
  await assert.rejects(service.getStarkenTracking('   '), /Ingresa una orden de flete de Starken/);

  console.log('OK: consulta de seguimiento Starken, ruta dedicada, cancelación y contrato de respuesta.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
