// SCRUM-400: control explícito de la versión legal vigente.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function load(relative, cache = new Map()) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const req = (id) => {
    if (!id.startsWith('.')) return require(id);
    const target = path.resolve(path.dirname(file), id);
    return load(['.ts', '.tsx'].map((extension) => target + extension).find(fs.existsSync), cache);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: req });
  return module.exports;
}

const control = load('src/features/storefront/data/legalCurrentVersion.ts');
const publication = load('src/features/storefront/data/legalPublication.ts');
const publishedAt = '2026-10-16T12:00:00.000Z';
const versions = [
  { id: 'terms-v1', pageType: 'terms', number: 1, content: 'Versión vigente', publishedAt },
  { id: 'terms-v2', pageType: 'terms', number: 2, content: 'Versión nueva', publishedAt: '2026-10-16T13:00:00.000Z' },
];

const selected = control.resolveCurrentLegalVersion(versions, 'terms-v1', 'terms');
assert.equal(selected.content, 'Versión vigente');
assert.equal(control.selectCurrentLegalVersion(versions, 'terms-v2', 'terms'), 'terms-v2');
assert.throws(() => control.selectCurrentLegalVersion(versions, 'terms-v3', 'terms'), /no existe/);

const publicPage = publication.readPublishedLegalPage(
  {
    draft: 'BORRADOR SECRETO',
    published: 'Publicación anterior',
    versions,
    currentVersionId: 'terms-v1',
  },
  'terms',
);
assert.equal(publicPage.published, 'Versión vigente');
assert.equal(publicPage.draft, 'Versión vigente');
assert.equal(publicPage.lastPublished, publishedAt);
assert.ok(!JSON.stringify(publicPage).includes('SECRETO'));
assert.ok(!JSON.stringify(publicPage).includes('Versión nueva'));

const invalidPointer = publication.readPublishedLegalPage(
  { published: 'Publicación anterior', versions, currentVersionId: 'terms-v9' },
  'terms',
);
assert.equal(invalidPointer.published, 'Publicación anterior', 'mantiene compatibilidad con el formato anterior');

const unpublished = [{ ...versions[0], publishedAt: null }];
assert.equal(control.resolveCurrentLegalVersion(unpublished, 'terms-v1', 'terms'), null);
assert.equal(control.resolveCurrentLegalVersion(versions, 'terms-v1', 'privacy'), null);
console.log('OK SCRUM-400 control de versión legal vigente');
