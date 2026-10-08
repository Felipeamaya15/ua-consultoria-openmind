// Ejecutar desde frontend: node tests/product-editing.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('(import.meta as any).env.VITE_API_URL', '"http://test"');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, sessionStorage: {getItem: () => null}, ...globals });
  return module.exports;
}
const id = '0123456789abcdef01234567';
const raw = {
  id, nombre: 'QA Creación Mongo', descripcion: 'Algodón', categoria: 'Vestuario', activo: false,
  imagenes: ['https://example.com/image.png'], revision: 'revision-original',
  atributos_generales: [{ clave: 'marca', etiqueta: 'Marca', valor: 'QA' }],
  variantes: [{ sku: 'QA-PANT-M', stock: 5, precio: 100, precio_oferta: 80,
    atributos_variante: [{ clave: 'talla', etiqueta: 'Talla', valor: 'M' }] }],
  seo: { meta_titulo: 'SEO', meta_descripcion: 'Meta' },
};
async function main() {
  let reply, request, calls = 0;
  const service = load('src/features/admin/services/productService.ts', {
    localStorage: { getItem: key => { assert.equal(key, 'token'); return 'owner'; } },
    fetch: async (url, options) => { calls++; request = { url, options }; return reply; },
  });
  const ok = data => ({ ok: true, json: async () => ({ exito: true, data }) });
  reply = ok([raw]);
  const list = await service.fetchAdminProducts();
  assert.equal(request.url, 'http://test/api/catalog/productos/admin/listado/');
  assert.equal(request.options.headers.Authorization, 'Token owner');
  assert.equal(list[0].id, id);
  assert.equal(list[0].status, 'archived');
  assert.equal(list[0].variants[0].stock, 5);
  reply = ok(raw);
  const product = await service.fetchAdminProduct(id);
  assert.equal(request.url, `http://test/api/catalog/productos/${id}/admin/`);
  assert.equal(product.generalAttributes[0].valor, 'QA');
  assert.equal(product.attributes.talla[0], 'M');
  assert.equal(product.seoTitle, 'SEO');
  product.name = 'Editado'; product.variants[0].stock = 7;
  reply = ok({ ...raw, nombre: 'Editado', revision: 'revision-nueva' });
  const saved = await service.updateCatalogProduct(product);
  assert.equal(saved.revision, 'revision-nueva');
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.url, `http://test/api/catalog/productos/${id}/actualizar/`);
  const body = JSON.parse(request.options.body);
  assert.equal(body.revision, 'revision-original');
  assert.equal(body.nombre, 'Editado');
  assert.equal(body.variantes[0].stock, 7);
  assert.equal(body.variantes[0].precio, 100);
  assert.equal(body.variantes[0].precio_oferta, 80);
  assert.equal(body.variantes[0].atributos_variante[0].etiqueta, 'Talla');
  assert.equal(body.atributos_generales[0].valor, 'QA');
  assert.equal(body.tienda_id, undefined);
  const before = calls;
  await assert.rejects(() => service.fetchAdminProduct('p-123'), /ID local o SQL/);
  assert.equal(calls, before);
  reply = { ok: false, json: async () => ({ exito: false, mensaje: 'El stock cambió' }) };
  await assert.rejects(() => service.updateCatalogProduct(product), /stock cambió/);
  reply = ok({ ...raw, id: 'abcdefabcdefabcdefabcdef' });
  await assert.rejects(() => service.updateCatalogProduct(product), /no confirmó/);

  // Carga del formulario/listado mediante efectos, sin consultar mocks o almacenamiento local.
  for (const mode of ['detail', 'list', 'failure']) {
    const state = [], effects = [];
    let cursor = 0, queried = 0;
    const jsx = (type, props) => ({ type, props });
    const components = load('src/features/admin/pages/Products.tsx', {
      require: name => {
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (name === 'react') return {
          useMemo: f => f(), useRef: () => ({ current: null }),
          useEffect: f => { effects.push(f); },
          useState: initial => {
            const index = cursor++;
            if (!(index in state)) state[index] = initial;
            return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
          },
        };
        if (name === 'react-router-dom') return { Link: 'Link', useParams: () => ({ id }), useNavigate: () => () => {} };
        if (name.includes('mockAdminData')) return { formatPrice: String };
        if (name.includes('productService')) return {
          fetchAdminProduct: async key => { queried++; assert.equal(key, id); if (mode === 'failure') throw new Error('No autorizado'); return saved; },
          fetchAdminProducts: async () => { queried++; return [saved]; },
        };
        if (name.includes('components/ui')) return Object.fromEntries(['Alert','Badge','Button','Input','Select','Tabs','Textarea','Toggle'].map(x => [x, x]));
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    const render = mode === 'list' ? components.ProductList : components.ProductForm;
    render(); effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    cursor = 0;
    const tree = render();
    assert.equal(queried, 1);
    if (mode === 'detail') assert.equal(tree.props.initial.id, id);
    if (mode === 'list') assert.equal(state[1][0].id, id);
    if (mode === 'failure') {
      assert.equal(tree.type, 'Alert');
      assert.equal(state[0], null);
      assert.equal(state[1], 'No autorizado');
    }
  }
  console.log('OK: listado/detalle Mongo, edición con revisión, errores y sin fallback local');
}
main().catch(error => { console.error(error); process.exit(1); });
