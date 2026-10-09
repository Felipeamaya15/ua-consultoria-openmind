// Ejecutar desde frontend: node tests/product-creation.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const product = {
  id: 'local', name: 'Polera', description: 'Algodón', category: 'Ropa', status: 'active',
  images: [], basePrice: 80, attributes: { Talla: ['M'] }, tags: [],
  variants: [{ id: 'v', sku: ' pol-m ', price: 80, comparePrice: 100, stock: 3, attributes: { Talla: 'M' } }],
};
function load(file, globals) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('(import.meta as any).env.VITE_API_URL', '"http://test"');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, sessionStorage: {getItem: () => null}, ...globals });
  return module.exports;
}
async function main() {
  let token = 'owner-token', sessionToken = null, request, reply;
  const service = load('src/features/admin/services/productService.ts', {
    localStorage: { getItem: () => token },
    sessionStorage: { getItem: () => sessionToken },
    fetch: async (url, options) => { request = { url, options }; return reply; },
  });
  reply = { ok: true, json: async () => ({ exito: true, data: { id: 'mongo-id' } }) };
  assert.equal(await service.createPublicProduct(product), 'mongo-id');
  assert.equal(request.url, 'http://test/api/catalog/productos/crear/');
  assert.equal(request.options.headers.Authorization, 'Token owner-token');
  const body = JSON.parse(request.options.body);
  assert.equal(body.activo, true);
  assert.equal(body.variantes[0].sku, 'POL-M');
  assert.equal(body.variantes[0].precio, 100);
  assert.equal(body.variantes[0].precio_oferta, 80);
  assert.equal(body.variantes[0].stock, 3);
  assert.equal(body.tienda_id, undefined);
  for (const failure of [
    { ok: false, json: async () => ({ mensaje: 'Rechazado' }) },
    { ok: true, json: async () => ({ exito: true, data: {} }) },
    { ok: false, json: async () => { throw new Error('HTML'); } },
  ]) {
    reply = failure;
    await assert.rejects(() => service.createPublicProduct(product));
  }
  token = null;
  await assert.rejects(() => service.createPublicProduct(product), /Inicia sesión/);
  sessionToken = 'session-owner';
  reply = {ok: true, json: async () => ({exito: true, data: {id: 'mongo-id'}})};
  await service.createPublicProduct(product);
  assert.equal(request.options.headers.Authorization, 'Token session-owner');

  // Creación y edición solo marcan Guardado tras éxito backend, sin AdminContext.
  for (const editing of [false, true]) for (const fails of [true, false]) {
    const state = [], changes = [];
    let calls = 0;
    const jsx = (type, props) => ({ type, props });
    const form = load('src/features/admin/pages/Products.tsx', {
      setTimeout: () => {},
      require: id => {
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (id === 'react') return {
          useEffect: () => {}, useMemo: f => f(), useRef: () => ({ current: null }),
          useState: initial => {
            const index = state.length;
            state.push(initial);
            return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; changes.push([index, value]); }];
          },
        };
        if (id === 'react-router-dom') return { Link: 'Link', useNavigate: () => () => {}, useParams: () => ({ id: 'nuevo' }) };
        if (id.includes('mockAdminData')) return { mockProducts: [], formatPrice: String };
        if (id.includes('productService')) return {
          createPublicProduct: async () => { assert.equal(editing, false); calls++; if (fails) throw new Error('Servidor caído'); return 'mongo-id'; },
          updateCatalogProduct: async p => { assert.equal(editing, true); calls++; if (fails) throw new Error('Servidor caído'); return { ...p, revision: 'new-revision' }; },
        };
        if (id.includes('components/ui')) return Object.fromEntries(['Alert','Badge','Button','Input','Select','Tabs','Textarea','Toggle'].map(x => [x, x]));
        throw new Error(id);
      },
    });
    const tree = form.ProductEditor({ initial: structuredClone(product), editing });
    function find(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Button' && node.props.children === 'Guardar producto') return node;
      const children = node.props?.children;
      for (const child of (Array.isArray(children) ? children.flat(Infinity) : [children])) {
        const result = find(child); if (result) return result;
      }
    }
    await find(tree).props.onClick();
    assert.equal(calls, 1);
    assert.equal(state[1], !fails);
    assert.equal(state[2], false);
    if (fails) assert.equal(state[4], 'Servidor caído');
  }
  console.log('OK: contrato Token, errores backend y Guardado independiente de caché');
}
main().catch(error => { console.error(error); process.exit(1); });
