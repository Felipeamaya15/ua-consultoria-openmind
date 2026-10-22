// Ejecutar desde frontend: node tests/store-seo-metadata.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'src/features/storefront/services/seoService.ts'),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const elements = [];
const document = {
  title: 'OpenMind',
  head: { appendChild: (element) => elements.push(element) },
  querySelector: (selector) => elements.find((element) => element.selector === selector) || null,
  createElement: () => {
    const attributes = {};
    const element = {
      selector: '',
      parentNode: { removeChild: (target) => elements.splice(elements.indexOf(target), 1) },
      setAttribute(name, value) {
        attributes[name] = value;
        if (name === 'name') this.selector = `meta[name="${value}"]`;
        if (name === 'property') this.selector = `meta[property="${value}"]`;
      },
      getAttribute: (name) => attributes[name] ?? null,
      removeAttribute: (name) => delete attributes[name],
    };
    return element;
  },
};
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, document });

const seo = moduleRef.exports;
const resolved = seo.resolveStoreSeoMetadata({
  name: 'Tienda base',
  description: 'Descripción base',
  metaTitle: '  Tienda optimizada  ',
  metaDescription: '  Compra productos seleccionados.  ',
});
assert.deepEqual(JSON.parse(JSON.stringify(resolved)), {
  title: 'Tienda optimizada',
  description: 'Compra productos seleccionados.',
});

const cleanup = seo.updateStoreSeo({
  name: 'Tienda base',
  metaTitle: 'Tienda optimizada',
  metaDescription: 'Compra productos seleccionados.',
});
assert.equal(document.title, 'Tienda optimizada');
assert.equal(document.querySelector('meta[name="description"]').getAttribute('content'), 'Compra productos seleccionados.');
assert.equal(document.querySelector('meta[property="og:title"]').getAttribute('content'), 'Tienda optimizada');

cleanup();
assert.equal(document.title, 'OpenMind');
assert.equal(elements.length, 0);

console.log('OK: consulta y aplicación de metadatos SEO en la tienda pública');
