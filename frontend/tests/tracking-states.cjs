const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), {test} = require('node:test'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const module = {exports: {}};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS}}).outputText,
    {module, exports: module.exports});
  return module.exports;
}
const {describeTrackingState, normalizeTrackingCode, trackingStageOf, trackingProgressIndex, TRACKING_PROGRESS} =
  load('src/features/storefront/data/trackingStates.ts');

test('Todos los códigos reales de los transportistas se traducen a la etapa correcta', () => {
  const esperado = {
    en_origen: ['EMITIDO', 'CREADO', 'RECEPCIONADO', 'RECEPCION_EN_SUCURSAL', 'INGRESO_EN_AGENCIA'],
    en_transito: ['EN_TRANSITO', 'EN_TRANSITO_REGIONAL', 'EN_TRANSITO_INTERURBANO', 'EN_CENTRO_DISTRIBUCION', 'CLASIFICACION_HUB_CENTRAL'],
    en_reparto: ['EN_REPARTO', 'EN_REPARTO_DOMICILIO', 'EN_DISTRIBUCION'],
  };
  const etiquetas = {en_origen: 'En origen', en_transito: 'En tránsito', en_reparto: 'En reparto'};
  for (const [etapa, codigos] of Object.entries(esperado)) {
    for (const codigo of codigos) {
      const info = describeTrackingState(codigo);
      assert.equal(info.stage, etapa, codigo);
      assert.equal(info.label, etiquetas[etapa], codigo);
    }
  }
});

test('Un centro de distribución es tránsito; solo la distribución final es reparto', () => {
  assert.equal(trackingStageOf('EN_CENTRO_DISTRIBUCION'), 'en_transito');
  assert.equal(trackingStageOf('CLASIFICACION_HUB_CENTRAL'), 'en_transito');
  assert.equal(trackingStageOf('EN_DISTRIBUCION'), 'en_reparto');
  assert.equal(trackingStageOf('SALIO_A_REPARTO'), 'en_reparto');
});

test('Acepta mayúsculas, tildes, espacios y guiones', () => {
  for (const texto of ['en tránsito', 'En-Tránsito', ' EN_TRANSITO ', 'en_transito_regional', 'En Tránsito Interurbano']) {
    assert.equal(trackingStageOf(texto), 'en_transito', texto);
  }
  for (const texto of ['en reparto', 'En-Reparto', ' EN_REPARTO ', 'en reparto a domicilio']) {
    assert.equal(trackingStageOf(texto), 'en_reparto', texto);
  }
  assert.equal(normalizeTrackingCode('En tránsito'), 'EN_TRANSITO');
});

test('Entregado y los problemas no se confunden', () => {
  assert.equal(trackingStageOf('ENTREGADO'), 'entregado');
  assert.equal(trackingStageOf('Entregada'), 'entregado');
  for (const codigo of ['NO_ENTREGADO', 'DEVUELTO', 'EXTRAVIADO', 'ENTREGA_RECHAZADA']) {
    assert.equal(trackingStageOf(codigo), 'incidencia', codigo);
  }
  assert.equal(describeTrackingState('DEVUELTO').variant, 'warning');
});

test('Un estado desconocido o vacío nunca se muestra como código crudo', () => {
  assert.deepEqual([describeTrackingState('ESTADO_RARO_XYZ').stage, describeTrackingState('ESTADO_RARO_XYZ').label], ['desconocido', 'Estado raro xyz']);
  for (const vacio of ['', '   ', undefined, null, 42, {}]) {
    const info = describeTrackingState(vacio);
    assert.equal(info.stage, 'desconocido');
    assert.equal(info.label, 'Estado no disponible');
  }
  for (const codigo of ['EN_TRANSITO_INTERURBANO', 'EN_REPARTO_DOMICILIO', 'EMITIDO', 'QUIEN_SABE']) {
    const {label} = describeTrackingState(codigo);
    assert.ok(!label.includes('_') && label !== label.toUpperCase(), label);
  }
});

test('El avance normal va de En origen a Entregado', () => {
  assert.deepEqual([...TRACKING_PROGRESS], ['en_origen', 'en_transito', 'en_reparto', 'entregado']);
  const orden = ['EMITIDO', 'EN_TRANSITO_REGIONAL', 'EN_REPARTO_DOMICILIO', 'ENTREGADO'].map(trackingProgressIndex);
  assert.deepEqual(orden, [0, 1, 2, 3]);
  assert.equal(trackingProgressIndex('DEVUELTO'), -1);
  assert.equal(trackingProgressIndex('QUIEN_SABE'), -1);
});

test('Los estados del pedido también se reconocen', () => {
  assert.equal(trackingStageOf('en_origen'), 'en_origen');
  assert.equal(trackingStageOf('enviado'), 'en_transito');
  assert.equal(trackingStageOf('en_reparto'), 'en_reparto');
  assert.equal(trackingStageOf('entregado'), 'entregado');
});
