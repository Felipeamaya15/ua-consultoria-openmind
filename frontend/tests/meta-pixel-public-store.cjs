// Ejecutar desde frontend: node tests/meta-pixel-public-store.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'src/features/storefront/services/metaPixelService.ts'),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const scripts = [];
const document = {
  getElementById: (id) => scripts.find((script) => script.id === id) || null,
  getElementsByTagName: () => [],
  createElement: () => ({ id: '', async: false, src: '' }),
  head: { appendChild: (script) => scripts.push(script) },
};
const window = {};
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, window, document });
const pixel = moduleRef.exports;

pixel.revokeMetaPixelConsent();
assert.equal(scripts.length, 0, 'no carga el SDK al rechazar cookies');
assert.equal(pixel.trackMetaPixelPageView('/plantilla/1'), false);

assert.equal(pixel.initMetaPixel('1234567890123456'), true);
assert.equal(scripts.length, 1);
assert.equal(scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
assert.equal(pixel.trackMetaPixelPageView('/plantilla/1'), true);
assert.equal(pixel.trackMetaPixelPageView('/plantilla/1'), false);
assert.equal(pixel.trackMetaPixelPageView('/plantilla/1/catalogo'), true);

const pageViews = window.fbq.queue.filter((args) => args[0] === 'track' && args[1] === 'PageView');
assert.equal(pageViews.length, 2);

pixel.revokeMetaPixelConsent();
const queueLength = window.fbq.queue.length;
assert.equal(pixel.trackMetaPixelPageView('/plantilla/1/carrito'), false);
pixel.trackMetaPixelEvent('Purchase', { value: 19990, currency: 'CLP' });
assert.equal(window.fbq.queue.length, queueLength, 'la revocación bloquea vistas y eventos comerciales');

const storeContext = fs.readFileSync(
  path.join(root, 'src/features/storefront/context/StoreContext.tsx'),
  'utf8',
);
const banner = fs.readFileSync(
  path.join(root, 'src/features/storefront/components/store/CookieConsentBanner.tsx'),
  'utf8',
);
assert.doesNotMatch(storeContext, /initMetaPixel/);
assert.match(banner, /choice === 'accepted'/);
assert.match(banner, /revokeMetaPixelConsent/);
assert.match(banner, /trackMetaPixelPageView/);

console.log('OK: Meta Pixel público respeta consentimiento y navegación SPA');
