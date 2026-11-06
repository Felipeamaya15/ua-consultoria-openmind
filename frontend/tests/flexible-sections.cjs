const assert = require('node:assert/strict'), { test } = require('node:test');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { webcrypto: crypto } = require('node:crypto');
const { load } = require('./source-loader.cjs');
const schema = load('src/features/landing/types/sectionElements.ts', {}, { crypto });
const resourceId = 'f44017aa-5324-45fb-baf8-5ff154d96655';
const sectionId = '81386c65-c014-4bda-9e4c-4ce4213f0381';
const media = { id: resourceId, titulo: 'Video de biblioteca', descripcion: '', tipo: 'youtube', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', activo: true, archivo: null, creado: '', actualizado: '' };

test('configurable presets preserve a stable compatible section shape and begin hidden', () => {
  for (const preset of Object.keys(schema.SECTION_PRESETS)) {
    const section = schema.createFlexibleSection(preset);
    assert.equal(section.tipo, 'personalizada'); assert.equal(section.visible, false);
    assert(section.nombre_interno); assert.equal(section.imagenes.length, 0);
    assert.equal(new Set(section.componentes.map(item => item.id)).size, section.componentes.length);
  }
  const first = schema.newSectionElement('texto'), second = schema.newSectionElement('texto');
  assert.notEqual(first.id, second.id); assert.equal(first.tipo, second.tipo);
  assert.equal(schema.SECTION_ELEMENTS.compra, undefined);
});

test('reordering repeated blocks preserves identity, visibility and source references without mutation', () => {
  const items = [schema.newSectionElement('texto'), { ...schema.newSectionElement('biblioteca'), recurso_id: resourceId, visible: false }];
  const moved = schema.moveElement(items, 1, -1);
  assert.equal(moved[0].recurso_id, resourceId); assert.equal(moved[0].visible, false);
  assert.equal(items[0].tipo, 'texto'); assert.equal(schema.moveElement(items, 0, -1), items);
});

function renderer(resources = {}) {
  return load('src/features/landing/components/SectionElements.tsx', {
    '../../marketing/components/MediaPreview': { MediaPreview: ({ resource, publicImageUrl }) => React.createElement('div', { 'data-resource': resource.id, 'data-public-image': publicImageUrl }, resource.titulo) },
    '../services/sectionResources': { fetchPublishedSectionResources: async () => resources },
    '../services/landingService': { LANDING_CONFIG_CHANGED: 'landing-changed' },
    '../../marketing/services/mediaLibraryService': { MEDIA_LIBRARY_CHANGED: 'media-changed' },
  });
}

test('section renderer escapes text, respects per-block visibility and produces real contact links', () => {
  const { SectionElements } = renderer();
  const elements = [{ id: 'a', tipo: 'titulo', visible: true, texto: '<script>alert(1)</script>' },
    { id: 'b', tipo: 'texto', visible: false, texto: 'No publicar' },
    { id: 'c', tipo: 'whatsapp', visible: true, numero: '+56912345678', mensaje: 'Hola & gracias', etiqueta: 'Consultar' },
    { id: 'd', tipo: 'precio', visible: true, importe: '15000' },
    { id: 'e', tipo: 'fecha', visible: true, fecha: '2027-01-20' }];
  const html = renderToStaticMarkup(React.createElement(SectionElements, { elements }));
  assert(html.includes('&lt;script&gt;')); assert(!html.includes('<script>')); assert(!html.includes('No publicar'));
  assert(html.includes('https://wa.me/56912345678?text=Hola%20%26%20gracias'));
  assert(html.includes('15.000')); assert(html.includes('20/01/2027'));
});

test('existing library IDs are reused and inactive or unavailable resources are not rendered publicly', () => {
  const { SectionElements } = renderer();
  const elements = [{ id: 'first', tipo: 'biblioteca', visible: true, recurso_id: resourceId }, { id: 'second', tipo: 'biblioteca', visible: true, recurso_id: resourceId }];
  const html = renderToStaticMarkup(React.createElement(SectionElements, { elements, ownerResources: { [resourceId]: media } }));
  assert.equal((html.match(/data-resource=/g) || []).length, 2); assert(!html.includes('biblioteca/'));
  const hidden = renderToStaticMarkup(React.createElement(SectionElements, { elements }));
  assert(!hidden.includes(media.titulo)); assert(!hidden.includes(resourceId));
  const inactive = renderToStaticMarkup(React.createElement(SectionElements, { elements, ownerResources: { [resourceId]: { ...media, activo: false } } }));
  assert(!inactive.includes('data-resource=')); assert(inactive.includes('No se mostrará'));
});

test('four storefront variants share configurable sections alongside unchanged legacy sections in saved order', () => {
  for (const template of ['editorial', 'minimal', 'visual', 'catalog']) {
    const legacy = { id: sectionId, tipo: 'texto', visible: true, titulo: 'Anterior', subtitulo: '', texto: 'Contenido anterior', imagenes: [] };
    const custom = { ...legacy, id: resourceId, tipo: 'personalizada', nombre_interno: 'Solo para el editor', componentes: [{ id: 'title', tipo: 'titulo', visible: true, texto: 'Título configurable' }] };
    const { LandingBlocks } = load('src/features/landing/components/LandingBlocks.tsx', {
      '../../storefront/context/StoreContext': { useStore: () => ({ landing: { contenido: { bloques: [legacy, custom] } }, blockStyles: {} }) },
      '../../storefront/hooks/useStorefrontTemplate': { useStorefrontTemplate: () => ({ template }) },
      '../services/sectionResources': { fetchPublishedSectionResources: async () => ({}) },
      '../services/landingService': { LANDING_CONFIG_CHANGED: 'landing-changed' },
      '../../marketing/services/mediaLibraryService': { MEDIA_LIBRARY_CHANGED: 'media-changed' },
    });
    const html = renderToStaticMarkup(React.createElement(LandingBlocks));
    assert(html.includes(`data-block-template="${template}"`));
    assert(html.indexOf('Contenido anterior') < html.indexOf('Título configurable'));
    assert(!html.includes('Solo para el editor'));
  }
});

let runtime;
const hooks = {
  useState(initial) { const i = runtime.cursor++, owner = runtime; if (!(i in owner.slots)) owner.slots[i] = typeof initial === 'function' ? initial() : initial; return [owner.slots[i], value => { owner.slots[i] = typeof value === 'function' ? value(owner.slots[i]) : value; }]; },
  useEffect(fn, deps) { const i = runtime.cursor++, owner = runtime, old = owner.slots[i]; if (!old || deps.some((v, index) => old.deps[index] !== v)) { old?.cleanup?.(); owner.effects.push(() => { owner.slots[i] = { deps, cleanup: fn() }; }); } },
};
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const tick = () => new Promise(resolve => setImmediate(resolve));

test('real editor adds repeated blocks, reorders, hides, removes and selects only active library entries by ID', async () => {
  let section = { id: sectionId, tipo: 'personalizada', visible: false, nombre_interno: 'Prueba', titulo: '', subtitulo: '', texto: '', imagenes: [], componentes: [] };
  const own = { slots: [], cursor: 0, effects: [] };
  const { FlexibleSectionEditor } = load('src/features/admin/components/FlexibleSectionEditor.tsx', {
    react: hooks,
    './ui': Object.fromEntries(['AdminCard','Button','Input','Modal','Select','Textarea','Toggle'].map(name => [name, name])),
    './ui/ImageUpload': { ImageUpload: 'ImageUpload' },
    '../../../shared/components/states': { ErrorState: 'ErrorState', LoadingState: 'LoadingState' },
    '../utils/humanizeError': { humanizeAdminError: text => text },
    '../../marketing/components/MediaPreview': { MediaPreview: 'MediaPreview' },
    '../../landing/services/sectionResources': { fetchSectionLibrary: async () => [media, { ...media, id: sectionId, titulo: 'Desactivado', activo: false }] },
    '../../landing/components/SectionElements': { SectionElements: 'SectionElements' },
  }, { crypto });
  function render() { runtime = own; own.cursor = 0; const tree = nodes(FlexibleSectionEditor({ section, onChange: next => { section = next; } })); own.effects.splice(0).forEach(fn => fn()); return tree; }
  const select = kind => render().find(node => node.type === 'Select' && node.props.label === 'Bloque que quieres agregar').props.onChange({ target: { value: kind } });
  const add = () => render().find(node => node.type === 'Button' && node.props.children === 'Agregar bloque').props.onClick();
  select('texto'); add(); add(); assert.equal(section.componentes.length, 2);
  const original = section.componentes[1].id;
  render().find(node => node.type === 'Button' && node.props['aria-label'] === 'Subir bloque 2').props.onClick();
  assert.equal(section.componentes[0].id, original);
  render().find(node => node.type === 'Toggle' && node.props.ariaLabel === 'Mostrar bloque 1').props.onChange(false);
  assert.equal(section.componentes[0].visible, false);
  render().find(node => node.type === 'Button' && node.props['aria-label'] === 'Eliminar bloque 1').props.onClick(); assert.equal(section.componentes.length, 1);
  select('biblioteca'); add(); render(); await tick();
  render().find(node => node.type === 'Button' && node.props.children === 'Seleccionar desde biblioteca').props.onClick();
  const choices = render().filter(node => node.type === 'Button' && Array.isArray(node.props.children) && node.props.children[0] === 'Usar ');
  assert.equal(choices.length, 1); choices[0].props.onClick();
  assert.equal(section.componentes[1].recurso_id, resourceId); assert.equal(section.componentes[1].imagenes, undefined);
  own.slots.forEach(slot => slot?.cleanup?.());
});
