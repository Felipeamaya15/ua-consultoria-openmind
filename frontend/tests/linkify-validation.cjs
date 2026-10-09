const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/features/admin/services/linkifyValidation.ts'),
  'utf8',
);
const moduleRef = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module: moduleRef, exports: moduleRef.exports, URL },
);

const { hasLinkifyCredentialData, validateLinkifyFields } = moduleRef.exports;
const valid = {
  idCuenta: 'CUENTA-QA', clavePrivada: 'clave-privada-qa', environment: 'sandbox',
  expirationHours: '48', returnUrl: 'https://tienda.example/confirmacion',
  notificationEmail: 'pagos@example.test', syncApprovedPayments: 'true',
};

assert.deepEqual(Object.keys(validateLinkifyFields(valid).errors), []);

const missingSecret = validateLinkifyFields({ ...valid, clavePrivada: '   ' });
assert.equal(missingSecret.errors.clavePrivada, 'Clave privada es obligatoria.');
assert.match(missingSecret.message, /Clave privada/);

const invalidFormats = validateLinkifyFields({
  ...valid,
  expirationHours: 'tres',
  returnUrl: 'texto',
  notificationEmail: 'correo-invalido',
});
assert.ok(invalidFormats.errors.expirationHours);
assert.ok(invalidFormats.errors.returnUrl);
assert.ok(invalidFormats.errors.notificationEmail);
assert.equal(hasLinkifyCredentialData({ idCuenta: 'CUENTA-QA', clavePrivada: '' }), true);

console.log('OK: Linkify identifica campos obligatorios y rechaza formatos inválidos.');
