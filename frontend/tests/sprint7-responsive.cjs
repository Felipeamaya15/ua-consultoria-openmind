/** Contrato responsive y revisión general del Frontend: Landing, Catálogo, Detalle, Carrito, Checkout, Login y Panel Admin. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const checkout = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Checkout.tsx'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Catalog.tsx'), 'utf8');
const productCard = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/ProductCard.tsx'), 'utf8');
const editorialLayout = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/EditorialLayout.tsx'), 'utf8');
const minimalHeader = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/minimal/MinimalHeader.tsx'), 'utf8');
const editorialHome = fs.readFileSync(path.join(root, 'src/features/storefront/pages/EditorialHome.tsx'), 'utf8');
const minimalHome = fs.readFileSync(path.join(root, 'src/features/storefront/pages/MinimalHome.tsx'), 'utf8');
const visualHome = fs.readFileSync(path.join(root, 'src/features/storefront/pages/VisualHome.tsx'), 'utf8');
const catalogHome = fs.readFileSync(path.join(root, 'src/features/storefront/pages/CatalogHome.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles/storefront.css'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src/app/router/index.tsx'), 'utf8');

test('las cuatro landing pages están adaptadas a pantallas móviles sin desbordamiento', () => {
  assert.match(editorialHome, /data-landing-page="editorial"/);
  assert.match(minimalHome, /data-landing-page="minimal"/);
  assert.match(visualHome, /data-landing-page="visual"/);
  assert.match(catalogHome, /data-landing-page="catalog"/);

  for (const home of [editorialHome, minimalHome, visualHome, catalogHome]) {
    assert.match(home, /min-w-0/);
    assert.match(home, /break-words/);
    assert.match(home, /min-h-11/);
  }

  assert.match(minimalHome, /data-landing-search/);
  assert.match(css, /\.store-mobile-navigation/);
  assert.match(css, /\[data-landing-page\]/);
});

test('el menú hamburguesa móvil despliega opciones legibles con contraste garantizado y las tarjetas de categorías aprovechan el ancho móvil (SCRUM-496 / SCRUM-463)', () => {
  assert.match(editorialLayout, /data-mobile-menu-toggle/);
  assert.match(editorialLayout, /id="mobile-navigation"/);
  assert.match(editorialLayout, /data-mobile-navigation/);
  assert.match(css, /\[data-storefront-visual\] \[data-visual-section="header"\] #mobile-navigation/);
  assert.match(css, /\[data-storefront-visual\] \[data-visual-section="header"\] #mobile-navigation :is\(a, button, div, span\)/);
  assert.match(editorialHome, /min-h-\[140px\]/);
  assert.match(css, /\[data-landing-page="editorial"\] \[data-visual-section="categories"\] \[data-visual-part="categoryItem"\]/);
});

test('el catálogo y las tarjetas de producto se adaptan a dispositivos móviles en las cuatro plantillas', () => {
  assert.match(catalog, /data-catalog-page="catalog"/);
  assert.match(catalog, /data-catalog-page="visual"/);
  assert.match(catalog, /data-catalog-toolbar/);
  assert.match(catalog, /data-catalog-search/);
  assert.match(catalog, /data-visual-part="catalogFiltersToggle"/);
  assert.match(catalog, /col-span-12 md:col-span-9 min-w-0/);
  assert.doesNotMatch(catalog, /md:col-span-3 lg:col-span-9/);

  assert.match(productCard, /flex-col sm:flex-row/);
  assert.match(css, /\[data-catalog-page\]/);
  assert.match(css, /\[data-storefront-visual\] \[data-visual-card="list"\]/);
  assert.match(css, /\[data-storefront-visual\] \[data-visual-grid="catalog"\]/);
});

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

test('las seis vistas prioritarias (catálogo, detalle, carrito, checkout, login y admin) cumplen los fixes visuales y de navegación', () => {
  const productDetail = fs.readFileSync(path.join(root, 'src/features/storefront/pages/ProductDetail.tsx'), 'utf8');
  const cart = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Cart.tsx'), 'utf8');
  const login = fs.readFileSync(path.join(root, 'src/features/storefront/pages/Login.tsx'), 'utf8');
  const adminCss = fs.readFileSync(path.join(root, 'src/features/admin/admin.css'), 'utf8');

  assert.match(css, /\[data-catalog-page="visual"\] \[data-visual-part="catalogFilters"\] \[data-visual-part="catalogFiltersToggle"\]/);

  assert.match(productDetail, /data-page-columns/);
  assert.match(css, /\[data-visual-page="product"\] section \.grid\.grid-cols-2/);

  assert.match(cart, /lg:grid-cols-\[1fr_360px\]/);
  assert.match(cart, /flex-col sm:flex-row/);

  assert.match(css, /\[data-checkout-page\] \[data-page-panel\] \.grid\.grid-cols-2 > span/);

  assert.match(login, /data-login-header/);
  assert.doesNotMatch(login, /onClick=\{\(\) => loginConGoogle\(\)\}[\s\S]{0,250}¿Olvidaste tu contraseña\?/);
  assert.match(css, /\[data-storefront-visual\] \[data-visual-page="login"\] \[data-login-header\]/);
  assert.match(minimalHeader, /to="ingresar\?modo=registro"/);

  assert.match(adminCss, /@media\(max-width:639px\)\{[\s\S]*?\.catalog-overview\{grid-template-columns:minmax\(0,1fr\)\}/);
});