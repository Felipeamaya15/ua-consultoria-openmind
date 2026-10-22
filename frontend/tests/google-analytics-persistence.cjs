// Ejecutar desde frontend: node tests/google-analytics-persistence.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function load(file, globals = {}) {
  const moduleRef = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module: moduleRef,
    exports: moduleRef.exports,
    require,
    Error,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    ...globals,
  });
  return moduleRef.exports;
}

const storage = new Map();
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
const storageModule = load('src/features/storefront/visual/storage.ts', {
  localStorage,
  window: { dispatchEvent: () => {} },
  require: (id) => id === './resolveVisualConfig'
    ? { isRecord: (value) => typeof value === 'object' && value !== null && !Array.isArray(value) }
    : require(id),
});

const identity = { apiBaseUrl: 'https://api.example.test', storeId: 'tienda-447' };
storageModule.saveStoredStoreConfig({ gaId: 'G-ABC123XYZ0' }, identity);
const loaded = storageModule.readStoredStoreConfig(identity);

assert.equal(loaded.gaId, 'G-ABC123XYZ0');
assert.equal(storage.size, 1);

const page = fs.readFileSync(path.join(root, 'src/features/admin/pages/SeoAnalytics.tsx'), 'utf8');
assert.match(page, /analyticsValidation\.measurementId/);
assert.match(page, /Google Analytics activo/);

console.log('OK: el identificador GA4 normalizado se guarda y recupera por tienda');
