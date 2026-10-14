const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function transpileAndRun(relativePath, customContext = {}) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  const context = {
    module: moduleObj,
    exports: moduleObj.exports,
    require: (id) => {
      if (id === 'react/jsx-runtime') {
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      }
      if (id === 'react') {
        return {
          useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
          useEffect: () => {},
          useMemo: (fn) => fn(),
          useCallback: (fn) => fn,
          createContext: (val) => ({ Provider: () => null, _currentValue: val }),
          useContext: (ctx) => ctx._currentValue,
        };
      }
      if (id === 'react-router-dom') {
        return {
          useParams: () => ({ type: 'terminos' }),
          Link: ({ to, children }) => ({ type: 'a', props: { href: to, children } }),
          useLocation: () => ({ pathname: '/' }),
        };
      }
      if (customContext.requireMock) {
        const mocked = customContext.requireMock(id);
        if (mocked) return mocked;
      }
      const target = path.resolve(path.dirname(fullPath), id);
      if (fs.existsSync(target + '.ts')) return transpileAndRun(path.relative(root, target + '.ts'), customContext);
      if (fs.existsSync(target + '.tsx')) return transpileAndRun(path.relative(root, target + '.tsx'), customContext);
      if (fs.existsSync(target + '/index.ts')) return transpileAndRun(path.relative(root, target + '/index.ts'), customContext);
      throw new Error(`Cannot resolve: ${id}`);
    },
    console,
    Error,
    structuredClone: (x) => JSON.parse(JSON.stringify(x)),
    localStorage: {
      getItem: (k) => (k === 'token' ? 'test-token-123' : null),
      setItem: () => {},
      removeItem: () => {},
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    Event: class Event { constructor(type) { this.type = type; } },
    ...customContext.globals,
  };

  vm.runInNewContext(code, context);
  return moduleObj.exports;
}

(async function runTests() {
  console.log('Testing Legal Pages Service & Flow...');

  // 1. Test legalContent defaults
  const legalContent = transpileAndRun('src/features/storefront/data/legalContent.ts');
  assert.ok(legalContent.defaultLegalPages.terms, 'defaultLegalPages must have terms');
  assert.ok(legalContent.defaultLegalPages.privacy, 'defaultLegalPages must have privacy');
  assert.ok(legalContent.defaultLegalPages.refund, 'defaultLegalPages must have refund');
  assert.ok(legalContent.defaultLegalPages.terms.published.includes('Aceptación de los términos'));
  assert.ok(legalContent.defaultLegalPages.privacy.published.includes('Información que recopilamos'));
  assert.ok(legalContent.defaultLegalPages.refund.published.includes('Derecho a devolución'));
  console.log('✔ legalContent defaults verified');

  // 2. Test legalService API calls
  let fetchCalls = [];
  const fakeFetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (url.endsWith('/api/legal/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: {
            terms: { title: 'Términos Test', published: 'Contenido Términos' },
            privacy: { title: 'Privacidad Test', published: 'Contenido Privacidad' },
            refund: { title: 'Reembolso Test', published: 'Contenido Reembolso' },
          },
        }),
      };
    }
    if (url.includes('/api/legal/configuracion/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: {
            terms: { title: 'Términos Admin', draft: 'Draft Términos', published: 'Pub Términos' },
            privacy: { title: 'Privacidad Admin', draft: 'Draft Privacidad', published: 'Pub Privacidad' },
            refund: { title: 'Reembolso Admin', draft: 'Draft Reembolso', published: 'Pub Reembolso' },
          },
        }),
      };
    }
    if (url.includes('/api/legal/terminos/')) {
      return {
        ok: true,
        json: async () => ({
          exito: true,
          data: { title: 'Términos Detalle', published: 'Pub Detalle' },
        }),
      };
    }
    return { ok: false, json: async () => ({ exito: false, mensaje: 'Not found' }) };
  };

  const legalServiceMod = transpileAndRun('src/features/storefront/services/legalService.ts', {
    requireMock: (id) => {
      if (id.endsWith('/api')) return { API_BASE_URL: 'http://test-api:8000' };
      if (id.includes('initialLoad')) return { fetchInitialLoad: fakeFetch };
      if (id.includes('authService')) return { authService: { getToken: () => 'token-abc' } };
      return null;
    },
    globals: {
      fetch: fakeFetch,
    },
  });

  const { legalService } = legalServiceMod;

  // 2.1 Fetch public pages
  const publicPages = await legalService.fetchPublicLegalPages();
  assert.equal(publicPages.terms.title, 'Términos Test');
  assert.equal(publicPages.terms.published, 'Contenido Términos');
  assert.equal(publicPages.privacy.published, 'Contenido Privacidad');
  assert.equal(publicPages.refund.published, 'Contenido Reembolso');
  console.log('✔ legalService.fetchPublicLegalPages verified');

  // 2.2 Fetch admin pages
  const adminPages = await legalService.fetchAdminLegalPages();
  assert.equal(adminPages.terms.draft, 'Draft Términos');
  assert.ok(fetchCalls.some(c => c.options?.headers?.Authorization === 'Token token-abc'));
  console.log('✔ legalService.fetchAdminLegalPages sends auth token');

  // 2.3 Save draft
  await legalService.saveDraft('terms', 'Nuevo borrador de términos');
  const draftCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(draftCall.options.method, 'PUT');
  assert.equal(JSON.parse(draftCall.options.body).accion, 'draft');
  assert.equal(JSON.parse(draftCall.options.body).draft, 'Nuevo borrador de términos');
  console.log('✔ legalService.saveDraft sends correct draft payload');

  // 2.4 Publish
  await legalService.publish('refund', 'Nueva política de reembolso publicada');
  const pubCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(pubCall.options.method, 'PUT');
  assert.equal(JSON.parse(pubCall.options.body).accion, 'publish');
  assert.equal(JSON.parse(pubCall.options.body).tipo, 'refund');
  assert.equal(JSON.parse(pubCall.options.body).published, 'Nueva política de reembolso publicada');
  console.log('✔ legalService.publish sends correct publish payload for refund');

  // 2.5 Restore
  await legalService.restore('privacy');
  const restCall = fetchCalls[fetchCalls.length - 1];
  assert.equal(restCall.options.method, 'PUT');
  assert.equal(JSON.parse(restCall.options.body).accion, 'restore');
  assert.equal(JSON.parse(restCall.options.body).tipo, 'privacy');
  console.log('✔ legalService.restore sends correct restore payload for privacy');

  // 3. Checkout links verification
  const checkoutSource = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Checkout.tsx'), 'utf8');
  assert.ok(checkoutSource.includes("to={route('legal/terms')}"), 'Checkout must link to terms');
  assert.ok(checkoutSource.includes("to={route('legal/privacy')}"), 'Checkout must link to privacy');
  assert.ok(checkoutSource.includes("to={route('legal/refund')}"), 'Checkout must link to refund');
  console.log('✔ Checkout links to terms, privacy, and refund policies in purchase flow');

  // 4. Legal page navigation verification (Inicio is non-clickable text, no Volver a la tienda)
  const legalSource = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Legal.tsx'), 'utf8');
  assert.ok(!legalSource.includes('Volver a la tienda'), 'Legal page must not have Volver a la tienda links');
  assert.ok(!legalSource.includes('href: route()'), 'Breadcrumb Inicio must not have href');
  console.log('✔ Legal page shows Inicio as non-clickable text and excludes return-to-home links');

  console.log('\nAll Legal Pages tests passed successfully!');
})();
