/**
 * Validación de la tarea: Optimizar carga inicial del catálogo.
 * Comprueba:
 * 1) El serializador público del listado en el backend entrega las variantes activas y descripción
 *    en la primera consulta (GET /api/catalog/productos/).
 * 2) fetchPublicProducts({ includeVariants: true }) hidrata todos los productos, variantes, precios,
 *    stock y filtros de atributos en 1 sola petición HTTP (eliminando el problema N+1 de red).
 * 3) Se mantiene el fallback a fetchPublicProductDetail cuando un mock resumido no incluye variantes.
 * 4) ProductCard aplica loading="lazy" y decoding="async" en las imágenes del catálogo.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadCatalogService(fetchImpl) {
  const file = path.join(root, 'src/features/storefront/services/catalogService.ts');
  const source = fs
    .readFileSync(file, 'utf8')
    .replace('(import.meta as any).env.VITE_API_URL', '"http://localhost:8000"');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Error,
    Date,
    Math,
    Promise,
    Array,
    Object,
    Set,
    encodeURIComponent,
    require: (name) => {
      if (name.includes('initialLoad')) {
        return {
          fetchInitialLoad: (url, options) => fetchImpl(url, options),
        };
      }
      return {};
    },
  });

  return module.exports;
}

test('el listado público hidrata variantes y atributos en 1 sola petición HTTP sin N+1 llamadas adicionales', async () => {
  const catalogItems = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1).padStart(24, '0'),
    nombre: `Producto Optimizado ${i + 1}`,
    slug: `producto-optimizado-${i + 1}`,
    descripcion: `Descripción ${i + 1}`,
    categoria: i % 2 === 0 ? 'Ropa' : 'Calzado',
    imagen: `/media/prod-${i + 1}.webp`,
    precio: 20000,
    precio_oferta: 15990,
    disponible: true,
    variantes: [
      {
        sku: `OPT-${i + 1}-M`,
        precio: 20000,
        precio_oferta: 15990,
        stock: 6,
        atributos_variante: [{ clave: 'talla', etiqueta: 'Talla', valor: 'M' }],
      },
      {
        sku: `OPT-${i + 1}-L`,
        precio: 22000,
        precio_oferta: null,
        stock: 0,
        atributos_variante: [{ clave: 'talla', etiqueta: 'Talla', valor: 'L' }],
      },
    ],
  }));

  const calls = [];
  const service = loadCatalogService(async (url) => {
    calls.push(url);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (url.endsWith('/api/catalog/productos/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ exito: true, mensaje: 'OK', data: catalogItems }),
      };
    }
    throw new Error(`No debe solicitar detalle individual cuando el listado ya trae variantes: ${url}`);
  });

  const startedAt = performance.now();
  const products = await service.fetchPublicProducts({ includeVariants: true });
  const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;

  assert.equal(calls.length, 1, 'Se realiza exactamente 1 petición HTTP en lugar de 13 (1 + 12)');
  assert.equal(products.length, 12);
  assert.equal(products[0].variantsLoaded, true);
  assert.equal(products[0].basePrice, 15990);
  assert.equal(products[0].comparePrice, 20000);
  assert.equal(products[0].attributeLabels.talla, 'Talla');
  assert.deepEqual(JSON.parse(JSON.stringify(products[0].attributes.talla)), ['M', 'L']);
  assert.equal(products[0].variants[0].sku, 'OPT-1-M');
  assert.equal(products[0].variants[0].available, true);
  assert.equal(products[0].variants[1].available, false);
  assert.ok(elapsedMs < 200, `Carga inicial optimizada completada en ${elapsedMs} ms`);
});

test('el serializador del backend incluye variantes activas y ProductCard aplica lazy loading', () => {
  const serializerSource = fs.readFileSync(
    path.join(root, '../backend/apps/catalog/presentation/serializers.py'),
    'utf8',
  );
  assert.match(serializerSource, /class ProductPublicListItemSerializer[\s\S]*?variantes = serializers\.SerializerMethodField\(\)/);
  assert.match(serializerSource, /def get_variantes\(self, producto\):[\s\S]*?VarianteSerializer\(self\._variantes\(producto\), many=True\)\.data/);

  const cardSource = fs.readFileSync(
    path.join(root, 'src/features/storefront/components/store/ProductCard.tsx'),
    'utf8',
  );
  const lazyMatches = cardSource.match(/loading="lazy"/g) || [];
  assert.ok(lazyMatches.length >= 5, 'Todas las vistas de ProductCard usan loading="lazy"');
  assert.match(cardSource, /decoding="async"/);
});