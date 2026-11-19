
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('styles/storefront.css');
const catalog = read('features/storefront/pages/CatalogHome.tsx');
const visual = read('features/storefront/pages/VisualHome.tsx');
const categories = read('features/landing/components/HomeCategories.tsx');
const gallery = read('features/storefront/components/store/ProductImageGallery.tsx');

test('Velta y Obsidian conservan la sección real de categorías', () => {
  assert.match(visual, /['"]sistema:categorias['"]\s*:\s*<HomeCategories\s*\/>/);
  assert.match(catalog, /['"]sistema:categorias['"]\s*:\s*<HomeCategories\s*\/>/);
  assert.match(categories, /data-visual-part="categoryItem"/);
  assert.match(categories, /data-visual-part="categoryLabel"/);
});

test('las categorías son legibles incluso sin fotografías, solo en plantillas 3 y 4', () => {
  const block = css.slice(css.indexOf('OPENMIND_VELTA_OBSIDIAN_CATEGORIES_AND_FEATURED_HOVER_V1'));
  assert(block.length > 800);
  assert(block.includes('data-landing-page="visual"'));
  assert(block.includes('data-landing-page="catalog"'));
  assert(block.includes('categoryLabel'));
  assert.match(block, /position:\s*absolute\s*!important/);
  assert.match(block, /color:\s*#fff\s*!important/);
  assert.match(block, /background:\s*linear-gradient/);
  assert.match(block, /display:\s*block\s*!important/);
});

test('el producto principal de Obsidian cambia fotos usando ProductImageGallery', () => {
  const start = catalog.indexOf('"sistema:destacados"');
  const end = catalog.indexOf('"sistema:contenido"', start);
  assert(start !== -1 && end > start);
  const featured = catalog.slice(start, end);
  assert.match(featured, /<ProductImageGallery\s+images=\{mochila\.images\}/);
  assert.doesNotMatch(featured, /src=\{mochila\.images\[0\]\}/);
  assert.match(featured, /pointer-events-none p-6 sm:p-8 md:p-12/);

  assert.match(featured, /to=\{route\(`producto\/\$\{mochila\.id\}`\)\}/);
  assert.match(gallery, /onPointerEnter=/);
  assert.match(gallery, /setHovered\(true\)/);
});


test('Velta y Obsidian usan columnas compactas sin estirar una categoria unica', () => {
  const block = css.slice(css.indexOf('OPENMIND_VELTA_OBSIDIAN_CATEGORIES_AND_FEATURED_HOVER_V1'));
  assert.match(block, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*200px\),\s*1fr\)\)/);
  assert.match(block, /display:\s*block\s*!important/);
});

test('Obsidian mantiene varias fotos y reutiliza efectos configurables en su destacada', () => {
  const hover = read('features/storefront/visual/image-hover.css');
  assert.match(catalog, /<Link\s+data-ob-featured-gallery\s+to=\{route\(`/);
  assert.match(catalog, /<ProductImageGallery\s+images=\{mochila\.images\}/);
  assert.match(hover, /OPENMIND_CATEGORIES_COMPACT_AND_GALLERY_HOVER_V2/);
  assert.match(hover, /\[data-ob-featured-gallery\]:is\(:hover,:focus-within\)::after/);
  assert.match(hover, /--om-product-overlay-animation/);
  assert.match(hover, /prefers-reduced-motion:\s*reduce/);
});
