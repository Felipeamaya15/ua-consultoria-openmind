const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'src');
const load = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Soft Discovery une imagen, título y buscador en una sola portada', () => {
  const source = load('features/storefront/pages/MinimalHome.tsx');
  const hero = source.slice(source.indexOf('OPENMIND_SOFT_DISCOVERY_COMPACT_HERO_V1'), source.indexOf('{/* Beneficios compactos debajo de la portada. */}'));
  assert.match(hero, /om-minimal-hero-grid/);
  assert.match(hero, /om-minimal-hero-copy/);
  assert.match(hero, /om-minimal-hero-media/);
  assert.match(hero, /onContentChange=\{hero\.onChange\}/);
  assert.match(hero, /data-visual-part="heroTitleBlock"/);
  assert.match(hero, /data-landing-search/);
  assert.doesNotMatch(hero, /floatingProducts/);
  assert.equal((hero.match(/<HeroCarousel\b/g) || []).length, 1);
});

test('Productos destacados permanecen en su sección real, no flotan sobre la portada', () => {
  const source = load('features/storefront/pages/MinimalHome.tsx');
  assert.match(source, /"sistema:destacados"/);
  assert.match(source, /<HomeSections commerce=/);
  assert.doesNotMatch(source, /const floatingProducts/);
});

test('El nuevo CSS solo actúa en Soft Discovery y mantiene el diseño adaptable', () => {
  const layout = load('features/storefront/components/store/minimal/MinimalLayout.tsx');
  const css = load('features/storefront/components/store/minimal/minimalLandingPolish.css');
  assert.match(layout, /import '\.\/minimalLandingPolish\.css'/);
  assert.match(css, /\.template-minimal/);
  assert.match(css, /\.om-minimal-hero-grid/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 0\.95fr\) minmax\(0, 1\.05fr\)/);
  assert.match(css, /@media \(max-width: 899px\)/);
  assert.match(css, /flex-direction:\s*row !important/);
  assert.doesNotMatch(css, /\.template-(?:editorial|visual|catalog)\b/);
});

test('Soft Discovery usa la barra lateral y conserva un menu compacto para movil', () => {
  const header = load('features/storefront/components/store/minimal/MinimalHeader.tsx');
  const sidebar = load('features/storefront/components/store/minimal/MinimalSidebar.tsx');
  assert.doesNotMatch(header, /data-minimal-nav-pill|<AccountNavigation\b|handleLogout|modo=registro/);
  assert.match(header, /<InstitutionalBadge\b/);
  assert.match(header, /<MinimalCartIcon\b/);
  assert.match(header, /<CompactMobileNavigation\s*\/>/);
  assert.match(sidebar, /Navegación lateral/);
  assert.match(sidebar, /<AccountNavigation\b/);
  assert.match(sidebar, /modo=registro/);
  assert.match(sidebar, /handleLogout/);
});
