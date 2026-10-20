const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const assert = require('node:assert/strict'), { test } = require('node:test');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function load(file) {
  const full = path.resolve(__dirname, '../src/features/marketing', file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { structuredClone, module, exports: module.exports, require: id => {
    if (!id.startsWith('.')) return require(id);
    const base = path.resolve(path.dirname(full), id);
    return load(['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync));
  } }); return module.exports;
}
const e = load('domain/editor.ts'), branding = load('domain/brand.ts');
test('documento visual normaliza límites, enums, colores, textos; no admite campos comerciales', () => {
  const d = e.defaultDesign();
  const n = e.normalizeDesign({ ...d, price: 1, template: 'bad', font: 'url(bad)', zoom: 800, imageIndex: -5, heading: 'A'.repeat(90),
    colors: { background: 'url(x)', text: '#abcdef', accent: '#fff1', label: '<svg>' }, textStyles: { ...d.textStyles, heading: { size: NaN, color: 'red', align: 'bad', bold: true, italic: true } } });
  assert.equal(n.template, 'photo'); assert.equal(n.font, 'sans'); assert.equal(n.zoom, 400); assert.equal(n.imageIndex, 0);
  assert.equal(n.heading.length, 48); assert.equal(n.colors.background, null); assert.equal(n.colors.text, '#abcdef');
  assert.equal(n.textStyles.heading.size, 100); assert.equal(n.textStyles.heading.align, 'left'); assert(!('price' in n));
  assert.equal(e.normalizeDesign({ ...d, zoom: Infinity }).zoom, 100);
});
test('textos editoriales no anuncian precios, HTML ni condiciones; nombre real separado', () => {
  for (const text of ['<script>alert()</script>', 'A solo $99', 'Gratis', '50% menos', 'Sin stock', 'Oferta', 'Envío libre', 'Vence mañana', 'Últimas unidades']) assert(e.editorialProblem(text), text);
  for (const text of ['Una nueva mirada', 'Conoce este producto', 'Diseñado para acompañarte']) assert.equal(e.editorialProblem(text), null);
});
test('colores de todos los bloques comerciales tienen contraste AA sin cambiar marca', () => {
  const brand = branding.marketingPalette('#ffffff', '#eeeeee'), before = JSON.stringify(brand);
  const d = { ...e.defaultDesign(), colors: { background: '#ffffff', text: '#ffffff', accent: '#888888', label: '#aaaaaa' } };
  const p = e.designPalette(brand, d);
  assert(e.contrast(p.background, p.text) >= 4.5); assert(e.contrast(p.accent, p.onAccent) >= 4.5); assert(e.contrast(p.label, p.onLabel) >= 4.5);
  assert.equal(e.safeTextColor('#ffffff', '#ffffff'), '#000000'); assert.equal(JSON.stringify(brand), before);
});
test('historial acotado, undo/redo, reset reversible y rama nueva sin futuro', () => {
  let h = e.initialHistory(); const original = JSON.stringify(h.present);
  h = e.designHistory(h, { type: 'change', next: { ...h.present, heading: 'Descubre la colección' } });
  const edited = JSON.stringify(h.present);
  h = e.designHistory(h, { type: 'reset' }); assert.equal(JSON.stringify(h.present), original);
  h = e.designHistory(h, { type: 'undo' }); assert.equal(JSON.stringify(h.present), edited);
  h = e.designHistory(h, { type: 'redo' }); assert.equal(JSON.stringify(h.present), original);
  h = e.designHistory(h, { type: 'undo' }); h = e.designHistory(h, { type: 'change', next: { ...h.present, zoom: 120 } }); assert.equal(h.future.length, 0);
  for (let i = 0; i < 80; i++) h = e.designHistory(h, { type: 'change', next: { ...h.present, showLogo: !!(i % 2) } });
  assert.equal(h.past.length, 40);
});
test('plantillas y formato no alteran datos comerciales; renderer evita inyección y títulos falsos', () => {
  const { PublicationPreview } = load('components/PublicationPreview.tsx');
  const source = { productId: 'a'.repeat(24), productName: 'Nombre real <img src=x onerror=alert(1)>', category: '', image: null, price: 2000000, originalPrice: 3000000, discountLabel: '33,33% menos', fromPrice: false, variantLabel: 'Color: Azul', hasMultipleVariants: true, source: 'promotion' };
  const brand = { name: 'Tienda real', logo: null, palette: branding.marketingPalette('#123456', '#fafafa') };
  const before = JSON.stringify([source, brand]);
  for (const template of e.TEMPLATES) for (const format of ['square', 'story', 'banner']) {
    const editor = { ...e.defaultDesign(), template: template.id, heading: '<script>bad</script>', subtitle: 'Más cerca de ti', showSubtitle: true, cta: 'Conoce el producto', imageIndex: 999 };
    const html = renderToStaticMarkup(React.createElement(PublicationPreview, { content: source, brand, design: { format, layout: 'product-spotlight', editor } }));
    assert(html.includes(`data-template="${template.id}"`)); assert(html.includes(`data-format="${format}"`));
    assert(html.includes('20.000')); assert(html.includes('30.000')); assert(html.includes('Color: Azul')); assert(html.includes('Tienda real'));
    assert(!html.includes('<script>')); assert(!html.includes('bad')); assert(html.includes('&lt;img')); assert(html.includes('Conoce el producto'));
  }
  assert.equal(JSON.stringify([source, brand]), before);
});

test('cada plantilla restaura ajustes e historial propios sin arrastrar los de otra', () => {
  let s = e.initialTemplateHistory();
  const change = patch => { s = e.templateHistory(s, { type: 'change', next: { ...s.documents[s.active].present, ...patch } }); };
  change({ heading: 'Solo fotografía', appearance: { ...e.defaultAppearance(), radius: 4 } });
  change({ template: 'feature' });
  assert.equal(s.documents.feature.present.heading, '');
  assert.equal(s.documents.feature.present.appearance.radius, null);
  change({ heading: 'Solo destacado' });
  change({ template: 'minimal' });
  assert.equal(s.documents.minimal.present.heading, '');
  assert.equal(s.documents.minimal.present.mediaSide, 'end', 'Esencial conserva ficha primero');
  change({ template: 'photo' });
  assert.equal(s.documents.photo.present.heading, 'Solo fotografía');
  s = e.templateHistory(s, { type: 'undo' });
  assert.equal(s.documents.photo.present.heading, '');
  assert.equal(s.documents.feature.present.heading, 'Solo destacado');
  s = e.templateHistory(s, { type: 'redo' });
  assert.equal(s.documents.photo.present.appearance.radius, 4);
  change({ template: '__proto__' }); assert.equal(s.active, 'photo');
  const anotherStore = e.initialTemplateHistory();
  assert.equal(anotherStore.documents.photo.present.heading, '');
  assert.notEqual(anotherStore.documents.photo, s.documents.photo);
});

test('restablecer solo afecta a la plantilla activa y es reversible', () => {
  let s = e.initialTemplateHistory();
  s = e.templateHistory(s, { type: 'change', next: { ...s.documents.photo.present, template: 'minimal' } });
  s = e.templateHistory(s, { type: 'change', next: { ...s.documents.minimal.present, heading: 'Personalizado' } });
  s = e.templateHistory(s, { type: 'reset' });
  assert.equal(s.active, 'minimal'); assert.equal(s.documents.minimal.present.template, 'minimal');
  assert.equal(s.documents.minimal.present.mediaSide, 'end');
  s = e.templateHistory(s, { type: 'undo' }); assert.equal(s.documents.minimal.present.heading, 'Personalizado');
});

test('apariencia limita valores y rechaza CSS arbitrario; fuente heredada y datos comerciales protegidos', () => {
  const value = e.normalizeDesign({ ...e.defaultDesign(), headingFont: 'constructor', price: 1,
    appearance: { radius: Infinity, imageX: -30, imageY: 900, mediaShare: 100, imagePadding: 999, buttonStyle: 'url(bad)', borderColor: 'red;display:none', showButton: false } });
  assert.equal(value.headingFont, null); assert(!('price' in value));
  assert.equal(value.appearance.imageX, 0); assert.equal(value.appearance.imageY, 100);
  assert.equal(value.appearance.mediaShare, 70); assert.equal(value.appearance.imagePadding, 10);
  assert.equal(value.appearance.radius, 0); assert.equal(value.appearance.borderColor, null);
  assert.equal(value.appearance.buttonStyle, 'solid'); assert.equal(value.appearance.showButton, false);
  const legacy = e.normalizeDesign({ template: 'photo' });
  assert.equal(legacy.textStyles.price.bold, true); assert.equal(legacy.appearance.radius, null);
  assert.equal(e.FONT_FAMILIES.calibri.includes('Calibri'), true);
});

test('ficha y CTA nuevos aceptan documentos anteriores, limitan medidas y contrastan fondos independientes', () => {
  const old = e.defaultDesign();
  for (const key of ['copyBackground','copyRadius','copyBorderStyle','copyBorderWidth','copyBorderColor','copyShadow','buttonBackground','buttonAlign','buttonShape','buttonWidth','buttonBorderStyle','buttonBorderWidth','buttonBorderColor']) delete old.appearance[key];
  const migrated = e.normalizeDesign(old);
  assert.equal(migrated.appearance.copyBackground, null); assert.equal(migrated.appearance.copyBorderStyle, 'original');
  assert.equal(migrated.appearance.copyShadow, 'original'); assert.equal(migrated.appearance.buttonShape, 'original');
  assert.equal(migrated.appearance.buttonWidth, null); assert.equal(migrated.appearance.buttonBorderWidth, 1);
  const n = e.normalizeDesign({ ...migrated, appearance: { ...migrated.appearance,
    copyBackground: '#ffffff', copyRadius: 900, copyBorderStyle: 'url(x)', copyBorderWidth: -5, copyBorderColor: 'red', copyShadow: '__proto__',
    buttonBackground: '#ffffff', buttonAlign: 'absolute', buttonShape: 'expression(x)', buttonWidth: 5, buttonBorderStyle: 'url(x)', buttonBorderWidth: 999, buttonBorderColor: '<svg>' } });
  assert.equal(n.appearance.copyRadius, 12); assert.equal(n.appearance.copyBorderStyle, 'original');
  assert.equal(n.appearance.copyBorderWidth, 0); assert.equal(n.appearance.copyBorderColor, null); assert.equal(n.appearance.copyShadow, 'original');
  assert.equal(n.appearance.buttonAlign, 'inherit'); assert.equal(n.appearance.buttonShape, 'original'); assert.equal(n.appearance.buttonWidth, 20);
  assert.equal(n.appearance.buttonBorderStyle, 'solid'); assert.equal(n.appearance.buttonBorderWidth, 8); assert.equal(n.appearance.buttonBorderColor, null);
  const p = e.designPalette(branding.marketingPalette('#172b3a', '#e8ddc0'), n);
  assert.equal(p.background, '#172b3a'); assert.equal(p.copyBackground, '#ffffff'); assert.equal(p.buttonBackground, '#ffffff');
  assert(e.contrast(p.copyText, p.copyBackground) >= 4.5); assert(e.contrast(p.text, p.background) >= 4.5);
});

test('estilos independientes de ficha y CTA se recuperan con undo/redo sin contaminar otras plantillas', () => {
  let s = e.initialTemplateHistory();
  const initial = JSON.stringify(s.documents.feature);
  const appearance = { ...s.documents.photo.present.appearance, copyBackground: '#ffffff', copyRadius: 3, copyBorderStyle: 'dashed', copyShadow: 'soft', buttonBackground: '#172b3a', buttonAlign: 'right', buttonShape: 'pill', buttonWidth: 65 };
  s = e.templateHistory(s, { type: 'change', next: { ...s.documents.photo.present, appearance } });
  s = e.templateHistory(s, { type: 'change', next: { ...s.documents.photo.present, template: 'feature' } });
  assert.equal(JSON.stringify(s.documents.feature), initial);
  s = e.templateHistory(s, { type: 'change', next: { ...s.documents.feature.present, template: 'photo' } });
  assert.equal(s.documents.photo.present.appearance.copyBackground, '#ffffff');
  assert.equal(s.documents.photo.present.appearance.buttonAlign, 'right');
  s = e.templateHistory(s, { type: 'undo' }); assert.equal(s.documents.photo.present.appearance.copyBackground, null);
  s = e.templateHistory(s, { type: 'redo' }); assert.equal(s.documents.photo.present.appearance.buttonWidth, 65);
  assert.equal(JSON.stringify(s.documents.feature), initial);
});

test('descripción real es opcional, escapa HTML y se presenta en todas las plantillas y formatos', () => {
  const { PublicationPreview } = load('components/PublicationPreview.tsx');
  const content = { productId: 'a'.repeat(24), productName: 'Producto real', description: 'Contenido real <script>alert(1)</script>', category: '', image: null,
    price: 1500000, originalPrice: 2000000, discountLabel: '25% menos', fromPrice: false, variantLabel: 'Única', hasMultipleVariants: false, source: 'product' };
  const brand = { name: 'Tienda real', logo: null, palette: branding.marketingPalette('#172b3a', '#e8ddc0') };
  const before = JSON.stringify([content, brand]);
  for (const template of e.TEMPLATES) for (const format of ['square','story','banner']) {
    const editor = { ...e.defaultDesign(template.id), showDescription: true };
    const render = () => renderToStaticMarkup(React.createElement(PublicationPreview, { content, brand, design: { format, layout: 'product-spotlight', editor } }));
    let html = render();
    assert(html.includes('marketing-art-description')); assert(html.includes('Contenido real &lt;script&gt;'));
    assert(!html.includes('<script>')); assert(html.includes('$15.000')); assert(html.includes('$20.000'));
    editor.showDescription = false; html = render(); assert(!html.includes('marketing-art-description'));
    assert.equal(e.normalizeDesign({ template: template.id }).showDescription, false);
  }
  assert.equal(JSON.stringify([content, brand]), before);
});
