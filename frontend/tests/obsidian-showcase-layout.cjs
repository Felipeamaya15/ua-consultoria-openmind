
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
const home = read('features/storefront/pages/CatalogHome.tsx');
const css = read('features/storefront/pages/obsidianShowcase4.css');
const visual = read('features/storefront/pages/VisualHome.tsx');

test('Obsidian es una portada inmersiva y no copia el hero de Velta', () => {
  assert.match(home, /OPENMIND_OBSIDIAN_SHOWCASE_UNIVERSAL_V1/);
  assert.match(home, /om-ob-hero/);
  assert.match(css, /min-height:\s*max\(650px,\s*100svh\)/);
  assert.match(css, /text-align:\s*center/);
  assert(!visual.includes('om-ob-hero'));
});
test('Conserva el carrusel y los textos por imagen con CTA configurable', () => {
  assert.match(home, /<HeroCarousel\s+landing=\{landing\}\s+onContentChange=\{hero\.onChange\}/);
  assert.match(home, /hero\.showTitle/);
  assert.match(home, /hero\.showDescription/);
  assert.match(home, /hero\.showButton/);
  assert.match(home, /to=\{hero\.href\}/);
});
test('Accesos a talleres y servicios solo cuando hay bloques visibles', () => {
  assert.match(home, /visibleBlocks/);
  assert.match(home, /workshopBlock\s*&&/);
  assert.match(home, /serviceBlock\s*&&/);
  assert.match(home, /#seccion-\$\{workshopBlock\.id\}/);
  assert.match(home, /#seccion-\$\{serviceBlock\.id\}/);
});
test('Showcase usa galería real y conserva animaciones opcionales', () => {
  assert.match(home, /data-ob-featured-gallery/);
  assert.match(home, /<ProductImageGallery\s+images=\{mochila\.images\}/);
  assert.match(home, /showcaseSide\.map/);
  assert.match(css, /om-ob-featured-grid/);
  const hover = read('features/storefront/visual/image-hover.css');
  assert.match(hover, /var\(--om-product-overlay-animation/);
});
test('No introduce una paleta fija ni edita otras plantillas', () => {
  assert.match(css, /var\(--visual-header-bg/);
  assert.match(css, /var\(--visual-button/);
  assert.match(css, /var\(--visual-surface/);
  assert.match(css, /\[data-landing-page="catalog"\]/);
  assert(!css.includes('template-editorial'));
  assert(!css.includes('template-minimal'));
  assert(!css.includes('template-visual'));
});
