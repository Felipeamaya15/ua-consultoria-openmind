// SCRUM-402: estructura e invariantes de versiones de contenido legal.
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

const versions = load('src/features/storefront/data/legalVersions.ts');
const firstDate = new Date('2026-10-15T10:00:00.000Z');
const secondDate = new Date('2026-10-16T11:30:00.000Z');

const first = versions.appendLegalContentVersion(
  { versions: [], currentVersionId: null },
  'terms',
  'Primera versión',
  firstDate,
);
assert.equal(first.versions.length, 1);
assert.equal(first.versions[0].number, 1);
assert.equal(first.currentVersionId, first.versions[0].id);
assert.equal(first.versions[0].publishedAt, firstDate.toISOString());

const second = versions.appendLegalContentVersion(first, 'terms', 'Segunda versión', secondDate);
assert.equal(second.versions.length, 2);
assert.equal(second.versions[1].number, 2);
assert.equal(second.currentVersionId, second.versions[1].id);
assert.equal(first.versions.length, 1, 'no modifica el historial recibido');

const damaged = [
  second.versions[1],
  second.versions[0],
  { ...second.versions[0], id: 'duplicado-numero' },
  { ...second.versions[0], id: second.versions[1].id, number: 3 },
  { ...second.versions[0], id: 'otra-pagina', pageType: 'privacy' },
  { id: '', pageType: 'terms', number: 3, content: 'inválido', createdAt: 'ayer', publishedAt: null },
];
const normalized = versions.normalizeLegalVersions(damaged, 'terms');
assert.deepEqual(
  JSON.parse(JSON.stringify(normalized)),
  JSON.parse(JSON.stringify(second.versions)),
);

assert.throws(() => versions.createLegalContentVersion('privacy', '   ', [], secondDate), /vacío/);
assert.throws(() => versions.createLegalContentVersion('privacy', 'texto', [], new Date('invalid')), /fecha/);
console.log('OK SCRUM-402 estructura de versiones de contenido legal');
