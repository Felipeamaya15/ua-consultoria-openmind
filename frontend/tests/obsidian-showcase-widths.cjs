const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../src/features/storefront/pages/obsidianShowcase4.css'), 'utf8');
const patch = css.split('/* OPENMIND_OBSIDIAN_WIDTHS_CONSISTENT_V1')[1];

test('la correccion esta instalada solo en la plantilla 4', () => {
  assert(patch, 'Falta la correccion de anchos');
  assert.match(patch, /\.template-catalog/);
  assert.match(patch, /\[data-landing-page="catalog"\]/);
  for (const other of ['template-editorial', 'template-minimal', 'template-visual']) {
    assert(!patch.includes(other), 'Se detecto otra plantilla: ' + other);
  }
});
test('los accesos, beneficios, productos y categorias comparten ancho', () => {
  assert.match(patch, /--om-ob-content-width:\s*min\(92%,\s*1280px\)/);
  for (const part of ['om-ob-quicklinks', 'om-ob-featured', 'data-visual-kind="benefits"', 'data-visual-section="categories"']) {
    assert(patch.includes(part), 'Falta la seccion: ' + part);
  }
  assert.match(patch, /width:\s*var\(--om-ob-content-width\)\s*!important/);
});
test('el hero full-screen no cambia y hay ajuste responsivo', () => {
  assert.match(css, /\.om-ob-hero-frame\s*\{/);
  assert(!patch.includes('om-ob-hero-frame'), 'La portada no debe limitarse');
  assert.match(patch, /@media\s*\(max-width:\s*640px\)/);
  assert.match(patch, /calc\(100% - 32px\)/);
});
