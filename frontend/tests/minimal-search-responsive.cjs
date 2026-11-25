const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'src');
const get = name => fs.readFileSync(path.join(root, name), 'utf8');

test('el boton de buscar no usa el texto comercial de la portada', () => {
  const source = get('features/storefront/pages/MinimalHome.tsx');
  assert.match(source, /className="om-minimal-search-submit/);
  assert.match(source, /aria-label="Buscar productos"/);
  assert.match(source, /<span>Buscar<\/span>/);
  assert.doesNotMatch(source, /hero\.customButton \? 'Buscar' : landing\?\.texto_boton/);
  assert.doesNotMatch(source, /<button data-visual-section=\{VISUAL_SECTION\.heroCta\}\s+type="submit"/);
});

test('el CTA de la portada se mantiene independiente y editable por imagen', () => {
  const source = get('features/storefront/pages/MinimalHome.tsx');
  const hero = source.split('OPENMIND_SOFT_DISCOVERY_COMPACT_HERO_V1')[1]?.split('{/* Beneficios compactos debajo de la portada. */}')[0];
  assert.ok(hero, 'no se encontró la portada Soft Discovery');
  assert.match(hero, /hero\.showButton && hero\.buttonText/);
  assert.match(hero, /<Link data-visual-section=\{VISUAL_SECTION\.heroCta\}/);
  assert.match(hero, /\{hero\.buttonText\}/);
  assert.match(hero, /onSubmit=\{handleSearch\}/);
  assert.match(hero, /data-landing-search/);
});

test('el buscador se mantiene dentro del ancho de la columna en escritorio y movil', () => {
  const source = get('features/storefront/pages/MinimalHome.tsx');
  const css = get('features/storefront/components/store/minimal/minimalLandingPolish.css');
  assert.match(source, /om-minimal-hero-search/);
  assert.match(source, /om-minimal-search-field/);
  assert.match(source, /om-minimal-search-submit/);
  assert.match(css, /OPENMIND_SOFT_DISCOVERY_RESPONSIVE_SEARCH_V1/);
  assert.match(css, /\.om-minimal-search-field input\[type="search"\]/);
  assert.match(css, /flex: 1 1 0% !important/);
  assert.match(css, /@media \(max-width: 440px\)/);
});
