// Ejecutar desde frontend: node tests/google-analytics-validation.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'src/features/storefront/services/googleAnalyticsService.ts'),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports });
const { validateGoogleAnalyticsId } = moduleRef.exports;

for (const value of ['', '   ', null, undefined]) {
  assert.equal(validateGoogleAnalyticsId(value).valid, true);
}

assert.deepEqual(
  JSON.parse(JSON.stringify(validateGoogleAnalyticsId('  g-abc123xyz0  '))),
  { valid: true, measurementId: 'G-ABC123XYZ0' },
);
assert.equal(validateGoogleAnalyticsId('UA-123456-1').valid, false);
assert.match(validateGoogleAnalyticsId('ABC123').error, /comenzar con G-/);
assert.equal(validateGoogleAnalyticsId('G-AB C123').valid, false);
assert.equal(validateGoogleAnalyticsId('G-ABC_123').valid, false);
assert.equal(validateGoogleAnalyticsId('G-A').valid, false);

console.log('OK: validación y normalización de identificadores de analítica');
