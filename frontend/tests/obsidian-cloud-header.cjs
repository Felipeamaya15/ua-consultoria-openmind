const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../src/features/storefront/pages/obsidianShowcase4.css'), 'utf8');
const mark = '/* OPENMIND_OBSIDIAN_CLOUD_HEADER_V1';
const patch = css.split(mark)[1];
test('parche unico y limitado al inicio de Obsidian', () => {
  assert.equal(css.split(mark).length, 2);
  assert(patch);
  for (const rule of patch.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (rule[1].trim().startsWith('@')) continue;
    // Cada selector de este parche contiene el ambito catalog.
    assert.match(rule[1], /\.template-catalog/);
    assert.match(rule[1], /\[data-landing-page="catalog"\]/);
  }
});
test('la capa exterior e interior ya no desenfocan y la barra conserva la paleta', () => {
  const outer = patch.match(/> \[data-visual-section="header"\]\s*\{([^}]+)\}/)[1];
  assert.match(outer, /background:\s*transparent\s*!important/);
  assert.match(outer, /backdrop-filter:\s*none\s*!important/);
  const nav = patch.match(/\[data-visual-part="headerLayout"\]\s*\{([^}]+)\}/)[1];
  assert.match(nav, /backdrop-filter:\s*none\s*!important/);
  assert.match(nav, /background:\s*var\(--visual-header-bg, var\(--visual-surface\)\)/);
  assert.match(nav, /border-radius:\s*72px 36px 68px 40px/);
});
test('mantiene el ancho comun y no deshabilita las animaciones de las imagenes', () => {
  assert(css.includes('OPENMIND_OBSIDIAN_WIDTHS_CONSISTENT_V1'));
  assert.match(patch, /max-width:\s*1280px/);
  assert.match(patch, /@media\s*\(max-width:\s*767px\)/);
  assert(!patch.includes('.hero-carousel__image'));
  assert(!/animation\s*:|transition\s*:/.test(patch));
});
