const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadService(globals) {
  const { require: legacyRequire, ...context } = globals;
  return require('./source-loader.cjs').load('src/features/admin/services/pendingTransfersService.ts', { '../../../api': { API_BASE_URL: 'https://api.example.test' }, '../../auth/services/authService': { authService: { getToken: () => 'owner-token' } } }, context);
}

(async () => {
  const calls = [];
  let response = {
    ok: true,
    json: async () => ({
      exito: true,
      mensaje: 'Transferencia rechazada y pedido cancelado.',
      data: { id_pedido: 42, estado: 'cancelado' },
    }),
  };
  const service = loadService({
    require: (name) => name.includes('authService')
      ? { authService: { getToken: () => 'owner-token' } }
      : { API_BASE_URL: 'https://api.example.test' },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return response;
    },
  });

  const result = await service.rejectManualTransfer(42);
  assert.equal(result.estado, 'cancelado');
  assert.equal(calls[0].url, 'https://api.example.test/api/pagos/transferencias/42/rechazar/');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Token owner-token');

  response = { ok: false, json: async () => ({ mensaje: 'Solo se pueden rechazar transferencias pendientes.' }) };
  await assert.rejects(service.rejectManualTransfer(42), /transferencias pendientes/);

  response = {
    ok: true,
    json: async () => ({ exito: true, mensaje: 'Respuesta inválida', data: { id_pedido: 42, estado: 'pagado' } }),
  };
  await assert.rejects(service.rejectManualTransfer(42), /confirmación del rechazo/);

  console.log('OK: rechazo manual usa el endpoint protegido y valida su respuesta.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
