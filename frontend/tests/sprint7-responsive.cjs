/** SCRUM-465: contrato básico responsive; no sustituye el test visual en navegador. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const checkout = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Checkout.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles/storefront.css'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src/app/router/index.tsx'), 'utf8');

test('el checkout mobile es el mismo componente real de las cuatro plantillas', () => {
  assert.match(routes, /path: 'compra',[\s\S]*?<Checkout\s*\/>/);
  assert.match(routes, /\.\.\.sharedChildren/g);
  assert.match(checkout, /data-checkout-page/);
  assert.match(checkout, /grid min-w-0 grid-cols-1 lg:grid-cols-5/);
});

test('el resumen no es sticky en pantallas móviles ni desborda la grilla', () => {
  assert.match(checkout, /lg:col-span-2 min-w-0 order-first lg:order-last/);
  assert.match(checkout, /lg:sticky lg:top-24/);
  assert.doesNotMatch(checkout, /\bsticky top-24\b/);
  assert.match(checkout, /data-checkout-items/);
});

test('las acciones importantes siguen visibles en pantallas angostas', () => {
  for (const marker of ['data-checkout-stepper', 'data-checkout-navigation', 'data-checkout-auth-options', 'data-checkout-shipping-option', 'data-checkout-promo-actions']) {
    assert(checkout.includes(marker), marker + ' ausente');
    assert(css.includes(`[data-checkout-${marker.replace('data-checkout-', '')}]`), marker + ' sin CSS');
  }
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /min-height: 2\.75rem/);
  assert.match(checkout, /disabled=\{isPaymentDisabled\}/);
});
