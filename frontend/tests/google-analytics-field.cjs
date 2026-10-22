// Ejecutar desde frontend: node tests/google-analytics-field.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const field = fs.readFileSync(
  path.join(root, 'src/features/admin/components/GoogleAnalyticsField.tsx'),
  'utf8',
);
const page = fs.readFileSync(
  path.join(root, 'src/features/admin/pages/SeoAnalytics.tsx'),
  'utf8',
);

assert.match(field, /Identificador de Google Analytics/);
assert.match(field, /placeholder="G-XXXXXXXXXX"/);
assert.match(field, /persistentHint/);
assert.match(field, /onChange\(event\.target\.value\)/);
assert.match(page, /<GoogleAnalyticsField/);

console.log('OK: el panel incorpora el campo específico de Google Analytics');
