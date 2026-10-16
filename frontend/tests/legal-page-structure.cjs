// SCRUM-401: estructura canónica de páginas legales.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function load(relative) {
  const file = path.resolve(root, relative);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require });
  return module.exports;
}

const legal = load('src/features/storefront/data/legalContent.ts');
const definitions = JSON.parse(JSON.stringify(legal.LEGAL_PAGE_DEFINITIONS));

assert.deepEqual(
  definitions.map(({ type }) => type),
  ['terms', 'privacy', 'refund', 'cookies'],
  'el catálogo conserva el orden público de las páginas',
);
assert.equal(new Set(definitions.map(({ type }) => type)).size, definitions.length);
assert.equal(new Set(definitions.map(({ slug }) => slug)).size, definitions.length);

for (const definition of definitions) {
  assert.ok(definition.slug.length > 2);
  assert.ok(definition.label.length > 3);
  assert.ok(definition.short.length > 2);
  assert.ok(definition.description.length > 10);
  assert.equal(legal.LEGAL_SLUGS[definition.type], definition.slug);
  assert.equal(legal.LEGAL_META[definition.type].label, definition.label);
}

assert.deepEqual(JSON.parse(JSON.stringify(legal.LEGAL_ORDER)), definitions.map(({ type }) => type));
console.log('OK SCRUM-401 estructura de páginas legales');
