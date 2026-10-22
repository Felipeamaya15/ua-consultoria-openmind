// Ejecutar desde frontend: node tests/google-analytics-public-store.cjs
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

const scripts = [];
const document = {
  getElementById: (id) => scripts.find((script) => script.id === id) || null,
  createElement: () => ({ id: '', async: false, src: '' }),
  head: { appendChild: (script) => scripts.push(script) },
};
const window = {};
const moduleRef = { exports: {} };
vm.runInNewContext(code, {
  module: moduleRef,
  exports: moduleRef.exports,
  window,
  document,
  Date,
  encodeURIComponent,
});

const analytics = moduleRef.exports;
assert.equal(analytics.initGoogleAnalytics('G-ABC123XYZ0'), true);
assert.equal(scripts.length, 1);
assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ0');
assert.equal(window.__googleAnalyticsId, 'G-ABC123XYZ0');
assert.equal(window.dataLayer.some((args) => args[0] === 'config' && args[1] === 'G-ABC123XYZ0'), true);

assert.equal(analytics.initGoogleAnalytics('G-ABC123XYZ0'), true);
assert.equal(scripts.length, 1, 'no debe duplicar el script ni la inicialización');

analytics.disableGoogleAnalytics();
const last = window.dataLayer.at(-1);
assert.equal(last[0], 'consent');
assert.equal(last[2].analytics_storage, 'denied');

assert.equal(analytics.initGoogleAnalytics('UA-1234-1'), false);
assert.equal(scripts.length, 1);

console.log('OK: Google Analytics se incorpora una sola vez y respeta el consentimiento');
