const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/features/admin/services/transferValidation.ts'),
  'utf8',
);
const moduleRef = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module: moduleRef, exports: moduleRef.exports },
);

const { hasTransferConfigurationData, transferRequiredFields, validateTransferFields } = moduleRef.exports;
const complete = {
  bank_name: 'BancoEstado', account_type: 'Cuenta corriente', account_number: '00123456789',
  holder_rut: '12.345.678-5', holder_name: 'Titular QA', confirmation_email: 'pagos@example.test',
};

assert.deepEqual(Array.from(validateTransferFields(complete).missing), []);

const rejected = validateTransferFields({ ...complete, holder_rut: '   ' });
assert.deepEqual(Array.from(rejected.missing), ['holder_rut']);
assert.equal(rejected.errors.holder_rut, 'RUT del titular es obligatorio.');
assert.match(rejected.message, /RUT del titular/);

const empty = validateTransferFields({});
assert.equal(empty.missing.length, transferRequiredFields.length);
assert.match(empty.message, /Banco/);
assert.match(empty.message, /Correo para comprobantes/);
assert.equal(hasTransferConfigurationData({}), false);
assert.equal(hasTransferConfigurationData({ instructions: '   ' }), false);
assert.equal(hasTransferConfigurationData({ bank_name: 'Banco QA' }), true);

assert.equal(validateTransferFields(complete).invalidFields.length, 0);
for (const [field, value] of [
  ['bank_name', 'Banco inventado'], ['account_type', 'Tarjeta de crédito'],
  ['account_number', '12-345'], ['account_number', '000'], ['account_number', '1'.repeat(25)],
  ['holder_rut', '12.345.678-9'], ['holder_rut', '12x3456785'], ['holder_name', '123'],
  ['confirmation_email', 'sin-arroba'], ['instructions', 'x'.repeat(1001)],
]) {
  assert(validateTransferFields({ ...complete, [field]: value }).errors[field], `${field}: ${value}`);
}
for (const rut of ['123456785', '12345678-5', '12.345.678-5', '6.000.000-k']) {
  assert.equal(validateTransferFields({ ...complete, holder_rut: rut }).errors.holder_rut, undefined, rut);
}
assert.equal(validateTransferFields({ ...complete, bank_name: 'Banco Estado' }).errors.bank_name, undefined);
assert(validateTransferFields({ ...complete, bank_name: 'Banco de Chile', account_type: 'CuentaRUT' }).errors.account_type);
assert(validateTransferFields({ ...complete, account_type: 'CuentaRUT', account_number: '98765432' }).errors.account_number);
assert.equal(validateTransferFields({ ...complete, account_type: 'CuentaRUT', account_number: '12345678' }).invalidFields.length, 0);

console.log('OK: la transferencia incompleta identifica campos obligatorios y no puede guardarse como válida.');
