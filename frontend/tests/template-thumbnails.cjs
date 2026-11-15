const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./source-loader.cjs');
const { isTemplateThumbnailPreview } = load('src/features/storefront/visual/pages.ts');
const root = path.resolve(__dirname, '..');

test('solo las miniaturas dentro de Diseño se reconocen como vista interna', () => {
  assert.equal(isTemplateThumbnailPreview(true, '/emprendedor/diseno', '?miniatura=1'), true);
  assert.equal(isTemplateThumbnailPreview(false, '/emprendedor/diseno', '?miniatura=1'), false);
  assert.equal(isTemplateThumbnailPreview(true, '/plantilla/1', '?miniatura=1'), false);
  assert.equal(isTemplateThumbnailPreview(true, '/emprendedor/diseno/editor', '?miniatura=1'), false);
  assert.equal(isTemplateThumbnailPreview(true, '/emprendedor/diseno', '?miniatura=0'), false);
  assert.equal(isTemplateThumbnailPreview(true, '/emprendedor/diseno', ''), false);
});

test('las tarjetas usan las cuatro rutas reales y no fotografías genéricas', () => {
  const design = fs.readFileSync(path.join(root, 'src/features/admin/pages/Design.tsx'), 'utf8');
  assert.match(design, /<StorefrontTemplateThumbnail template={tpl.id} name={tpl.name} \/>/);
  assert.match(design, /templatePaths\[template\]/);
  assert.match(design, /IntersectionObserver/);
  assert.doesNotMatch(design, /images\.unsplash\.com/);
});

test('las miniaturas no activan banner ni píxeles publicitarios', () => {
  const cookies = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/CookieConsentBanner.tsx'), 'utf8');
  assert.match(cookies, /!isActiveTemplateThumbnailPreview\(\)/);
});
