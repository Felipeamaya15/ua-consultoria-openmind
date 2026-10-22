// Ejecutar desde frontend: node tests/seo-pixel.cjs
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

async function testPixelValidation() {
  const pixelService = loadModule('src/features/storefront/services/metaPixelService.ts');

  // 1. Validaciones exitosas
  assert.equal(pixelService.validatePixelId('1234567890123456').valid, true);
  assert.equal(pixelService.validatePixelId('123456789012345').valid, true);
  assert.equal(pixelService.validatePixelId('123456789').valid, true);
  assert.equal(pixelService.validatePixelId('  1234567890123456  ').valid, true);
  assert.equal(pixelService.validatePixelId('  1234567890123456  ').pixelId, '1234567890123456');

  // Vacíos son válidos (desactivado / opcional)
  assert.equal(pixelService.validatePixelId('').valid, true);
  assert.equal(pixelService.validatePixelId('   ').valid, true);
  assert.equal(pixelService.validatePixelId(null).valid, true);
  assert.equal(pixelService.validatePixelId(undefined).valid, true);

  // 2. Validaciones con error
  // Contiene caracteres no numéricos
  const nonNumeric = pixelService.validatePixelId('12345abc6789012');
  assert.equal(nonNumeric.valid, false);
  assert.match(nonNumeric.error, /números/);

  // Caracteres especiales
  const specialChars = pixelService.validatePixelId('1234-5678-9012');
  assert.equal(specialChars.valid, false);

  // Longitud insuficiente (< 9 dígitos)
  const tooShort = pixelService.validatePixelId('12345678');
  assert.equal(tooShort.valid, false);
  assert.match(tooShort.error, /entre 9 y 16 dígitos/);

  // Longitud excesiva (> 16 dígitos)
  const tooLong = pixelService.validatePixelId('12345678901234567');
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.error, /entre 9 y 16 dígitos/);

  // Negativos
  const negative = pixelService.validatePixelId('-123456789012');
  assert.equal(negative.valid, false);

  console.log('OK: Validación de formato y longitud de Meta/Facebook Pixel ID');
}

async function testPixelInitAndTracking() {
  const events = [];
  const insertedScripts = [];
  const mockDocument = {
    getElementById: (id) => null,
    getElementsByTagName: () => [{
      parentNode: {
        insertBefore: (newNode) => { insertedScripts.push(newNode); },
      },
    }],
    head: { appendChild: (node) => { insertedScripts.push(node); } },
    createElement: (tag) => ({ tagName: tag, id: '', async: false, src: '' }),
  };

  const mockWindow = {
    document: mockDocument,
  };

  const pixelService = loadModule('src/features/storefront/services/metaPixelService.ts', {
    window: mockWindow,
    document: mockDocument,
  });

  // Inicializar pixel válido
  const initialized = pixelService.initMetaPixel('1234567890123456');
  assert.equal(initialized, true);
  assert.equal(typeof mockWindow.fbq, 'function');
  assert.equal(mockWindow.__metaPixelId, '1234567890123456');
  assert.equal(insertedScripts.length > 0, true);
  assert.equal(insertedScripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');

  // Tracking de eventos
  assert.equal(pixelService.trackMetaPixelPageView('/plantilla/1'), true);
  assert.equal(pixelService.trackMetaPixelPageView('/plantilla/1'), false);
  pixelService.trackMetaPixelEvent('ViewContent', { content_name: 'Polera', value: 9990 });
  pixelService.trackMetaPixelEvent('AddToCart', { content_name: 'Polera', value: 9990 });
  pixelService.trackMetaPixelEvent('Purchase', { content_name: 'ORD-1234', value: 19980 });

  // Verificar que la cola capturó los eventos
  assert.equal(mockWindow.fbq.queue.length, 6); // consent, init, PageView y tres eventos
  assert.deepEqual(Array.from(mockWindow.fbq.queue[0]), ['consent', 'grant']);
  assert.equal(mockWindow.fbq.queue[1][0], 'init');
  assert.equal(mockWindow.fbq.queue[1][1], '1234567890123456');
  assert.equal(mockWindow.fbq.queue[2][1], 'PageView');
  assert.equal(mockWindow.fbq.queue[3][1], 'ViewContent');
  assert.equal(mockWindow.fbq.queue[4][1], 'AddToCart');
  assert.equal(mockWindow.fbq.queue[5][1], 'Purchase');

  pixelService.revokeMetaPixelConsent();
  const revokedLength = mockWindow.fbq.queue.length;
  pixelService.trackMetaPixelEvent('AddToCart');
  assert.equal(mockWindow.fbq.queue.length, revokedLength, 'no registra eventos sin consentimiento');

  console.log('OK: Inicialización del SDK de Meta Pixel y tracking de eventos');
}

async function testSeoAnalyticsComponent() {
  const jsx = (type, props) => ({ type, props });
  let savedConfig = null;
  const mockConfig = {
    metaTitle: 'Mi Tienda Original',
    metaDescription: 'Descripción de prueba',
    gaId: 'G-12345',
    pixelId: '',
  };

  const state = [];
  const formComponent = loadModule('src/features/admin/pages/SeoAnalytics.tsx', {
    require: (id) => {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react') return {
        useState: (initial) => {
          const index = state.length;
          state.push(initial);
          return [state[index], (val) => {
            state[index] = typeof val === 'function' ? val(state[index]) : val;
          }];
        },
      };
      if (id.includes('AdminContext')) return {
        useAdmin: () => ({
          config: mockConfig,
          setConfig: (next) => { savedConfig = next; return true; },
        }),
      };
      if (id.includes('components/ui')) {
        return Object.fromEntries(['AdminCard', 'Alert', 'Input', 'Textarea', 'Button', 'Badge'].map(x => [x, x]));
      }
      if (id.includes('GoogleAnalyticsField')) {
        return { GoogleAnalyticsField: 'GoogleAnalyticsField' };
      }
      if (id.includes('MetaPixelField')) {
        return { MetaPixelField: 'MetaPixelField' };
      }
      if (id.includes('metaPixelService')) {
        return loadModule('src/features/storefront/services/metaPixelService.ts');
      }
      if (id.includes('googleAnalyticsService')) {
        return loadModule('src/features/storefront/services/googleAnalyticsService.ts');
      }
      throw new Error(`Dependencia no esperada: ${id}`);
    },
  });

  const tree = formComponent.default();
  assert.equal(tree.type, 'form');

  // Simular envío con Pixel inválido
  // Estado 0: form, Estado 1: saved, Estado 2: error
  state[0].pixelId = '123invalid';
  const preventDefault = () => {};
  tree.props.onSubmit({ preventDefault });

  assert.equal(savedConfig, null); // No debe guardar
  assert.equal(state[1], false); // saved = false
  assert.match(state[2], /números/); // error message

  // Simular envío con Pixel válido con espacios
  state[0].pixelId = '  987654321012345  ';
  state[0].metaTitle = '  Título Tienda Optimizado  ';
  tree.props.onSubmit({ preventDefault });

  assert.notEqual(savedConfig, null);
  assert.equal(savedConfig.pixelId, '987654321012345');
  assert.equal(savedConfig.metaTitle, 'Título Tienda Optimizado');
  assert.equal(state[1], true); // saved = true
  assert.equal(state[2], ''); // error limpio

  console.log('OK: Formulario SeoAnalytics valida, reporta error y guarda identificador de Pixel');
}

async function testRepositoryPersistence() {
  const storage = new Map();
  const mockLocalStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
  };

  const identity = { apiBaseUrl: 'http://test', storeId: 'tienda-1' };
  const storageModule = loadModule('src/features/storefront/visual/storage.ts', {
    localStorage: mockLocalStorage,
    window: {},
  });

  // Guardar configuración con pixelId
  const configToSave = {
    name: 'Tienda Test',
    pixelId: '1122334455667788',
    metaTitle: 'SEO Title Test',
    metaDescription: 'SEO Desc Test',
  };

  storageModule.saveStoredStoreConfig(configToSave, identity);
  const loaded = storageModule.readStoredStoreConfig(identity);

  assert.equal(loaded.pixelId, '1122334455667788');
  assert.equal(loaded.metaTitle, 'SEO Title Test');
  assert.equal(loaded.metaDescription, 'SEO Desc Test');

  console.log('OK: Persistencia de identificador de Meta Pixel en almacenamiento de tienda');
}

async function main() {
  await testPixelValidation();
  await testPixelInitAndTracking();
  await testSeoAnalyticsComponent();
  await testRepositoryPersistence();
  console.log('\n=== Todos los tests de Meta/Facebook Pixel pasaron exitosamente ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
