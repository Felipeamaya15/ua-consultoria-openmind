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
const complete = Object.fromEntries(transferRequiredFields.map((field) => [field, 'dato']));

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

console.log('OK: la transferencia incompleta identifica campos obligatorios y no puede guardarse como válida.');
