const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');

test('Diseño se adapta a pantallas intermedias sin comprimir los títulos', () => {
  const page = read('features/admin/pages/Design.tsx');
  assert.match(page, /flex flex-col xl:flex-row xl:items-center xl:justify-between/);
  assert.match(page, /className="min-w-0 flex-1"/);
  assert.match(page, /w-full xl:w-auto xl:shrink-0/);
});

test('Las cuatro miniaturas reales llenan el recuadro y mantienen tamaño estable', () => {
  const page = read('features/admin/pages/Design.tsx');
  assert.match(page, /<StorefrontTemplateThumbnail template=\{tpl\.id\} name=\{tpl\.name\}/);
  assert.match(page, /THUMBNAIL_BROWSER_HEIGHT\s*=\s*720/);
  assert.match(page, /height:\s*THUMBNAIL_BROWSER_HEIGHT/);
  assert.match(page, /Math\.max\(0\.1, host\.clientWidth \/ THUMBNAIL_BROWSER_WIDTH\)/);
  assert.doesNotMatch(page, /images\.unsplash\.com/);
});

test('Las miniaturas no rotan las fotos del hero ni reproducen videos', () => {
  const hero = read('features/storefront/components/HeroCarousel.tsx');
  assert.match(hero, /isActiveTemplateThumbnailPreview\(\)/);
  assert.match(hero, /count <= 1 \|\| thumbnailPreview \|\| settings\.mode/);
  assert.match(hero, /!thumbnailPreview &&/);
});

test('La galería detalle usa una escena estable y no superpone imágenes al cambiar', () => {
  const component = read('features/storefront/components/store/ProductImageGallery.tsx');
  const css = read('features/storefront/components/store/productImageGallery.css');
  assert.match(component, /detail\s*\|\|\s*!src\s*\|\|\s*!old/);
  assert.match(component, /om-product-gallery__backdrop/);
  assert.match(css, /\.om-product-gallery--detail \.om-product-gallery__backdrop img/);
  assert.match(css, /object-fit:\s*cover/);
  assert.match(css, /\.om-product-gallery--detail \.om-product-gallery__layer img/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /position:\s*absolute/);
  const page = read('features/storefront/pages/ProductDetail.tsx');
  assert.match(page, /relative overflow-hidden bg-\[var\(--muted\)\]/);
});


test('La foto de detalle llena y centra el visor sin heredar el limite global de altura', () => {
  const css = read('features/storefront/components/store/productImageGallery.css');
  const globalCss = read('styles/visual-config.css');
  assert.match(globalCss, /\[data-storefront-visual\] \.ua-store-page \[data-page-main-image\]/);
  assert.match(globalCss, /\[data-page-main-image\]\s*\{height:auto; aspect-ratio:/);
  const selector = '[data-storefront-visual] .ua-store-page .om-product-gallery--detail .om-product-gallery__layer img[data-page-main-image]';
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(rule, 'Falta la regla especifica para la imagen principal de detalle');
  const body = rule[1];
  for (const expected of [
    /position:\s*absolute\s*!important/,
    /height:\s*100%\s*!important/,
    /max-height:\s*none\s*!important/,
    /aspect-ratio:\s*auto\s*!important/,
    /object-fit:\s*contain\s*!important/,
    /object-position:\s*center center\s*!important/,
  ]) assert.match(body, expected);
});


test('Las flechas de detalle no cambian de posición al pasar el mouse o pulsarlas', () => {
  const css = read('features/storefront/components/store/productImageGallery.css');
  const marker = '/* OPENMIND_DETAIL_STABLE_ARROW_HIT_TARGET_V1';
  assert.ok(css.includes(marker), 'Falta el arreglo de flechas estables');
  const scoped = css.slice(css.indexOf(marker));
  assert.match(scoped, /\.om-product-gallery\.om-product-gallery--detail-controls \.om-product-gallery__arrow\s*\{/);
  assert.match(scoped, /top:\s*50%\s*!important/);
  assert.match(scoped, /transform:\s*translate3d\(0,\s*-50%,\s*0\)\s*!important/);
  assert.match(scoped, /width:\s*52px\s*!important/);
  assert.match(scoped, /height:\s*52px\s*!important/);
  assert.match(scoped, /\.om-product-gallery__arrow--previous\s*\{/);
  assert.match(scoped, /\.om-product-gallery__arrow--next\s*\{/);
  assert.match(scoped, /:is\(:hover,\s*:active,\s*:focus-visible\)/);
});

test('El video de producto llena el visor sin altura limitada por el CSS global', () => {
  const css = read('features/storefront/components/store/productImageGallery.css');
  const gallery = read('features/storefront/components/store/ProductImageGallery.tsx');
  const globalCss = read('styles/visual-config.css');
  assert.match(gallery, /<ViewportVideo[\s\S]*?data-page-main-image/);
  assert.match(globalCss, /\.ua-store-page \[data-page-main-image\]/);
  const selector = '[data-storefront-visual] .ua-store-page .om-product-gallery--detail .om-product-gallery__layer video[data-page-main-image]';
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(rule, 'Falta la regla especifica para el video del producto');
  for (const pattern of [
    /position:\s*absolute\s*!important/,
    /inset:\s*0\s*!important/,
    /width:\s*100%\s*!important/,
    /height:\s*100%\s*!important/,
    /max-height:\s*none\s*!important/,
    /aspect-ratio:\s*auto\s*!important/,
    /object-fit:\s*contain\s*!important/,
    /background:\s*#000\s*!important/,
    /pointer-events:\s*auto\s*!important/,
  ]) assert.match(rule[1], pattern);
});
