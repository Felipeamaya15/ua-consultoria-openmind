// Ejecutar desde frontend: node tests/product-seo.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loadModule(file, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace('(import.meta as any).env.VITE_API_URL', '"http://test"');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const defaultRequire = (id) => {
    if (id === '../../../shared/services/apiRequest') {
      // El test ejecuta TypeScript transpiliado en VM: simular la frontera HTTP.
      return {
        requestJson: async (url, options) => {
          const response = await globals.fetch(url, options);
          const body = await response.json();
          if (!response.ok || body.exito === false) throw new Error(body.mensaje || 'Error de API');
          return body.data;
        },
      };
    }
    if (id === './resolveVisualConfig') {
      return { isRecord: (v) => typeof v === 'object' && v !== null && !Array.isArray(v) };
    }
    return require(id);
  };

  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Error,
    require: defaultRequire,
    ...globals,
  });
  return module.exports;
}

function testSeoService() {
  const metaElements = [];
  const mockDocument = {
    title: 'Tienda Original',
    head: {
      appendChild: (el) => metaElements.push(el),
    },
    querySelector: (selector) => {
      if (selector === 'meta[name="description"]') {
        return metaElements.find(m => m.name === 'description') || null;
      }
      if (selector === 'meta[property="og:title"]') {
        return metaElements.find(m => m.property === 'og:title') || null;
      }
      if (selector === 'meta[property="og:description"]') {
        return metaElements.find(m => m.property === 'og:description') || null;
      }
      return null;
    },
    createElement: (tag) => {
      const elem = {
        tagName: tag,
        attributes: {},
        parentNode: {
          removeChild: (target) => {
            const idx = metaElements.indexOf(target);
            if (idx >= 0) metaElements.splice(idx, 1);
          },
        },
        setAttribute: (k, v) => {
          elem[k] = v;
          elem.attributes[k] = v;
        },
        getAttribute: (k) => elem.attributes[k] ?? null,
      };
      return elem;
    },
  };

  const seoService = loadModule('src/features/storefront/services/seoService.ts', {
    document: mockDocument,
  });

  const productWithSeo = {
    name: 'Polera Clásica',
    description: 'Descripción básica',
    seoTitle: 'Polera de Algodón Orgánico Exclusiva',
    seoDescription: 'Compra la mejor polera de algodón orgánico con envío a todo Chile.',
  };

  // 1. Aplicar SEO personalizado
  const cleanup = seoService.updateProductSeo(productWithSeo, 'Tienda Demo');
  assert.equal(mockDocument.title, 'Polera de Algodón Orgánico Exclusiva · Tienda Demo');

  const descMeta = mockDocument.querySelector('meta[name="description"]');
  assert.notEqual(descMeta, null);
  assert.equal(descMeta.getAttribute('content'), 'Compra la mejor polera de algodón orgánico con envío a todo Chile.');

  const ogTitle = mockDocument.querySelector('meta[property="og:title"]');
  assert.notEqual(ogTitle, null);
  assert.equal(ogTitle.getAttribute('content'), 'Polera de Algodón Orgánico Exclusiva');

  // 2. Limpieza al desmontar
  cleanup();
  assert.equal(mockDocument.title, 'Tienda Original');

  // 3. Fallback a nombre y descripción estándar cuando seoTitle y seoDescription están vacíos
  const productWithoutSeo = {
    name: 'Taza Cerámica',
    description: 'Taza artesanal hecha a mano.',
    seoTitle: '',
    seoDescription: '',
  };

  const cleanupFallback = seoService.updateProductSeo(productWithoutSeo, 'Mi Tienda');
  assert.equal(mockDocument.title, 'Taza Cerámica · Mi Tienda');
  const descFallback = mockDocument.querySelector('meta[name="description"]');
  assert.equal(descFallback.getAttribute('content'), 'Taza artesanal hecha a mano.');
  cleanupFallback();

  // Una página de producto sin descripción no debe conservar la de otra página.
  const restoreStore = seoService.updateStoreSeo({
    name: 'Mi Tienda',
    metaTitle: 'Portada',
    metaDescription: 'Descripción de portada',
  });
  const restoreEmptyProduct = seoService.updateProductSeo({
    name: 'Producto sin descripción',
    seoTitle: '',
    seoDescription: '',
  }, 'Mi Tienda');
  assert.equal(mockDocument.querySelector('meta[name="description"]').getAttribute('content'), '');
  assert.equal(mockDocument.querySelector('meta[property="og:description"]').getAttribute('content'), '');
  assert.equal(mockDocument.title, 'Producto sin descripción · Mi Tienda');
  restoreEmptyProduct();
  assert.equal(mockDocument.querySelector('meta[name="description"]').getAttribute('content'), 'Descripción de portada');
  restoreStore();
  assert.equal(mockDocument.title, 'Tienda Original');

  console.log('OK: updateProductSeo aplica meta-título, meta-descripción y restaura al desmontar');
}

async function testProductServiceSeoPayload() {
  let request = null;
  const reply = { ok: true, json: async () => ({ exito: true, data: { id: '0123456789abcdef01234567' } }) };
  const service = loadModule('src/features/admin/services/productService.ts', {
    localStorage: { getItem: () => 'token-test' },
    sessionStorage: { getItem: () => null },
    fetch: async (url, options) => {
      request = { url, options };
      return reply;
    },
  });

  const product = {
    id: 'local',
    name: 'Polera SEO',
    description: 'Algodón',
    category: 'Ropa',
    status: 'active',
    images: [],
    basePrice: 100,
    attributes: { Talla: ['M'] },
    tags: [],
    variants: [{ id: 'v1', sku: 'POL-SEO-M', price: 100, stock: 5, attributes: { Talla: 'M' } }],
    seoTitle: '  Meta Título Personalizado  ',
    seoDescription: '  Meta Descripción Personalizada para Google  ',
  };

  // Crear producto con SEO
  await service.createPublicProduct(product);
  const sentPayload = JSON.parse(request.options.body);

  assert.equal(sentPayload.seo.meta_titulo, 'Meta Título Personalizado');
  assert.equal(sentPayload.seo.meta_descripcion, 'Meta Descripción Personalizada para Google');

  // Detalle de producto mapea campos de SEO
  const rawMongoProduct = {
    id: '0123456789abcdef01234567',
    nombre: 'Polera Desde Mongo',
    descripcion: 'Desc',
    categoria: 'Ropa',
    activo: true,
    imagenes: [],
    revision: 'rev-1',
    variantes: [{ sku: 'P-1', stock: 2, precio: 50, atributos_variante: [] }],
    seo: {
      meta_titulo: 'Título Guardado en DB',
      meta_descripcion: 'Descripción Guardada en DB',
    },
  };

  const serviceWithDetail = loadModule('src/features/admin/services/productService.ts', {
    localStorage: { getItem: () => 'token-test' },
    sessionStorage: { getItem: () => null },
    fetch: async () => ({ ok: true, json: async () => ({ exito: true, data: rawMongoProduct }) }),
  });

  const adapted = await serviceWithDetail.fetchAdminProduct('0123456789abcdef01234567');
  assert.equal(adapted.seoTitle, 'Título Guardado en DB');
  assert.equal(adapted.seoDescription, 'Descripción Guardada en DB');

  // Actualizar producto preserva y envía campos SEO actualizados
  adapted.seoTitle = 'Título Modificado';
  adapted.seoDescription = 'Descripción Modificada';

  let updateRequest = null;
  const serviceUpdate = loadModule('src/features/admin/services/productService.ts', {
    localStorage: { getItem: () => 'token-test' },
    sessionStorage: { getItem: () => null },
    fetch: async (url, options) => {
      updateRequest = { url, options };
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: {
            ...rawMongoProduct,
            seo: {
              meta_titulo: 'Título Modificado',
              meta_descripcion: 'Descripción Modificada',
            },
          },
        }),
      };
    },
  });

  const updatedResult = await serviceUpdate.updateCatalogProduct(adapted);
  const updatedPayload = JSON.parse(updateRequest.options.body);
  assert.equal(updatedPayload.seo.meta_titulo, 'Título Modificado');
  assert.equal(updatedPayload.seo.meta_descripcion, 'Descripción Modificada');
  assert.equal(updatedResult.seoTitle, 'Título Modificado');
  assert.equal(updatedResult.seoDescription, 'Descripción Modificada');

  console.log('OK: productService envía, mapea y actualiza meta_titulo y meta_descripcion');
}

async function main() {
  testSeoService();
  await testProductServiceSeoPayload();
  console.log('\n=== Todos los tests de Meta-Título y Meta-Descripción pasaron exitosamente ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
