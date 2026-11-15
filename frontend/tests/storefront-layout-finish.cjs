const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const folder = path.join(__dirname, '../src/features/storefront/components/store');
const read = name => fs.readFileSync(path.join(folder, name), 'utf8');
const css = read('storefrontLayoutPolish.css');
test('reglas comunes cargadas una sola vez desde StoreVisualRoot', () => {
  assert.equal((read('StoreVisualRoot.tsx').match(/import ['"]\.\/storefrontLayoutPolish\.css['"]/g)||[]).length,1);
  assert.match(css, /OPENMIND_STOREFRONT_LAYOUT_FINISH_V1/);
});
test('solo Studio Pop y Obsidian comparten anchos; se conserva el hero full bleed', () => {
  assert.match(css, /:is\(\.template-editorial,\.template-catalog\):has\(\[data-landing-page\]\)/);
  assert.match(css, /--om-landing-rail:.*1440px/);
  assert.match(css, /padding-inline: var\(--om-landing-inset\) !important/);
  assert.match(css, /nav\.om-ob-quicklinks/);
  assert.doesNotMatch(css, /om-ob-hero-frame|hero-carousel__image|\.template-visual/);
});
test('Soft Discovery conserva logo, carrito, registro y navegacion accesible sin duplicados', () => {
  const header = read('minimal/MinimalHeader.tsx');
  const side = read('minimal/MinimalSidebar.tsx');
  assert.match(header, /<InstitutionalBadge\b/);
  assert.match(header, /config\.name/);
  assert.match(header, /<MinimalCartIcon\b/);
  assert.match(header, /<CompactMobileNavigation\s*\/>/);
  assert.doesNotMatch(header, /<nav\b|<AccountNavigation\b|handleLogout|modo=registro/);
  for(const label of ['Inicio','Catálogo','Seguimiento']) assert(side.includes(`aria-label="${label}"`));
  assert.match(side,/modo=registro/);
  assert.match(side,/<AccountNavigation\b/);
  assert.match(side,/handleLogout/);
});
test('ajuste de separacion antes del footer limitado a pages de inicio', () => {
  assert.match(css, /#main-content:has\(\[data-landing-page\]\) \+ footer\[data-visual-section="footer"\] \{\s*margin-top: 0 !important/);
  assert.match(css, /#main-content \[data-landing-page\] \{\s*margin-bottom: 0 !important;\s*padding-bottom: 0 !important/);
});
