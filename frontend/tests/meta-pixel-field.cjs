// Ejecutar desde frontend: node tests/meta-pixel-field.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const field = fs.readFileSync(
  path.join(root, 'src/features/admin/components/MetaPixelField.tsx'),
  'utf8',
);
const page = fs.readFileSync(
  path.join(root, 'src/features/admin/pages/SeoAnalytics.tsx'),
  'utf8',
);

assert.match(field, /validatePixelId\(value\)/);
assert.match(field, /Identificador de medición de Meta\/Facebook/);
assert.match(field, /inputMode="numeric"/);
assert.match(field, /maxLength=\{16\}/);
assert.match(field, /persistentHint/);
assert.match(field, /error=\{value\.trim\(\) && !validation\.valid/);
assert.match(page, /<MetaPixelField/);

console.log('OK: el panel incorpora el campo validado de Meta/Facebook Pixel');
