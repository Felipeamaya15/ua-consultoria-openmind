const assert = require('node:assert/strict'), { test } = require('node:test');
const { load } = require('./source-loader.cjs');
const { inspectMediaUrl, mediaProblem } = load('src/features/marketing/domain/mediaLibrary.ts');
const id = '891a51ae-24fe-4bba-9bda-123456789abc';
const item = { id, titulo: 'Video', descripcion: 'Descripción', tipo: 'youtube', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', activo: true, archivo: null, creado: '2026-11-04T00:00:00Z', actualizado: '2026-11-04T00:00:00Z' };

test('canonicalizes compatible content and limits embeds to official fixed endpoints', () => {
  for (const url of ['https://youtu.be/M7lc1UVf-VE?t=20', 'https://youtube.com/watch?v=M7lc1UVf-VE', 'https://www.youtube.com/shorts/M7lc1UVf-VE']) {
    const result = inspectMediaUrl('youtube', url); assert.equal(result.error, '');
    assert.equal(result.embed, 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE');
  }
  assert.equal(inspectMediaUrl('instagram', 'https://instagram.com/p/ABC_123/?igsh=123').url, 'https://www.instagram.com/p/ABC_123/');
  const facebook = inspectMediaUrl('facebook', 'https://facebook.com/tienda/posts/pfbidABC123');
  assert.equal(new URL(facebook.embed).origin, 'https://www.facebook.com');
  assert.equal(new URL(facebook.embed).pathname, '/plugins/post.php');
  assert.equal(new URL(facebook.embed).searchParams.get('href'), facebook.url);
  assert.equal(inspectMediaUrl('enlace', 'https://example.org/pagina').embed, '');
  assert.equal(inspectMediaUrl('imagen', 'https://example.org/imagen.webp').error, '');
});

test('rejects unsafe URLs, local targets, profiles and mismatched providers before save', () => {
  for (const [kind, url] of [
    ['enlace', 'javascript:alert(1)'], ['enlace', 'data:text/html,test'], ['enlace', 'http://example.org'],
    ['enlace', 'https://127.0.0.1/test'], ['enlace', 'https://10.0.0.1/test'], ['enlace', 'https://192.168.1.1/test'],
    ['enlace', 'https://localhost/test'], ['enlace', 'https://user:pass@example.org'], ['enlace', 'https://example.org:8080'],
    ['enlace', '<iframe src="https://example.org">'], ['enlace', 'https://example.org/<script>'],
    ['youtube', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE'], ['youtube', 'https://youtube.com/@canal'],
    ['instagram', 'https://instagram.com/persona'], ['facebook', 'https://facebook.com/login'],
    ['imagen', 'https://example.org/imagen.svg'], ['imagen', 'https://example.org/imagen.html'],
  ]) assert(inspectMediaUrl(kind, url).error, url);
});

test('validates form limits, images and preservation of an existing uploaded image', () => {
  const draft = { titulo: 'Foto', descripcion: '', tipo: 'imagen', url: '', activo: true };
  assert(mediaProblem({ ...draft, titulo: '' }, null));
  assert.equal(mediaProblem(draft, null, true), '');
  assert(mediaProblem(draft, null, false));
  assert.equal(mediaProblem(draft, new File(['photo'], 'foto.heic')), '');
  assert(mediaProblem(draft, new File(['movie'], 'clip.mp4')));
  assert(mediaProblem(draft, new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png')));
  assert(mediaProblem({ ...draft, descripcion: 'x'.repeat(2001) }, null, true));
});

function service(response) {
  const calls = []; let token = 'synthetic-auth';
  const api = load('src/features/marketing/services/mediaLibraryService.ts', {
    '../../../api': { API_BASE_URL: 'http://api.test' },
    '../../../shared/services/apiRequest': { requestJson: async (...args) => { calls.push(args); return typeof response === 'function' ? response() : response; }, readApiResponse: async () => { throw new Error('Sin acceso'); } },
  }, { FormData, localStorage: { getItem: () => token }, sessionStorage: { getItem: () => null }, fetch: async (...args) => { calls.push(args); return { ok: true, headers: new Headers({ 'Content-Type': 'image/png' }), blob: async () => new Blob(['bytes'], { type: 'image/png' }) }; } });
  return { api, calls, logout: () => { token = null; } };
}

test('service persists multipart files and metadata, preserves stored images, toggles and confirms deletion', async () => {
  const h = service(item), draft = { titulo: ' Imagen ', descripcion: ' Texto ', tipo: 'imagen', url: '', activo: true };
  await h.api.saveMediaResource(null, draft, new File(['png'], 'foto.png'), false);
  assert.equal(h.calls[0][1].method, 'POST'); assert.equal(h.calls[0][1].headers.Authorization, 'Token synthetic-auth');
  assert.equal(h.calls[0][1].body.get('imagen').name, 'foto.png'); assert.equal(h.calls[0][1].body.get('titulo'), 'Imagen');
  assert.equal(h.calls[0][1].body.has('url'), false);
  await h.api.saveMediaResource(id, draft, null, true);
  assert.equal(h.calls[1][1].method, 'PATCH'); assert.equal(h.calls[1][1].body.has('imagen'), false); assert.equal(h.calls[1][1].body.has('url'), false);
  await h.api.setMediaActive(id, false); assert.deepEqual(JSON.parse(h.calls[2][1].body), { activo: false });
  const deletion = service({ id }); await deletion.api.deleteMediaResource(id); assert.equal(deletion.calls[0][1].method, 'DELETE');
  await assert.rejects(service({ id: 'wrong' }).api.deleteMediaResource(id), /confirmar/);
  h.logout(); await assert.rejects(h.api.setMediaActive(id, true), /Inicia sesión/);
});

test('service verifies paginated responses and never accepts malformed resource data', async () => {
  const h = service({ resultados: [item], total: 1, pagina: 2, por_pagina: 24 });
  const signal = new AbortController().signal;
  assert.equal((await h.api.fetchMediaLibrary(2, signal)).resultados[0].id, id);
  assert.equal(h.calls[0][0], 'http://api.test/api/landing/biblioteca/?pagina=2'); assert.equal(h.calls[0][1].signal, signal);
  await assert.rejects(service({ resultados: [], total: '1' }).api.fetchMediaLibrary());
  await assert.rejects(service({ ...item, tipo: 'html' }).api.setMediaActive(id, false));
  await assert.rejects(service(item).api.setMediaActive('../otra-tienda', false));
});

test('local image bytes are fetched with authentication, no token in the URL and abort support', async () => {
  const h = service(item), signal = new AbortController().signal;
  const blob = await h.api.fetchMediaImage(id, signal);
  assert.equal(blob.type, 'image/png'); assert.equal(h.calls[0][1].signal, signal);
  assert.equal(h.calls[0][1].headers.Authorization, 'Token synthetic-auth');
  assert.equal(h.calls[0][0], `http://api.test/api/landing/biblioteca/${id}/imagen/`);
  assert(!h.calls[0][0].includes('synthetic-auth'));
});

let runtime;
const hooks = {
  useState(initial) { const i = runtime.cursor++, owner = runtime; if (!(i in owner.slots)) owner.slots[i] = typeof initial === 'function' ? initial() : initial; return [owner.slots[i], value => { owner.slots[i] = typeof value === 'function' ? value(owner.slots[i]) : value; }]; },
  useRef(initial) { const i = runtime.cursor++; return runtime.slots[i] ??= { current: initial }; },
  useEffect(fn, deps) { const i = runtime.cursor++, owner = runtime, before = owner.slots[i]; if (!before || deps.some((v, index) => before.deps[index] !== v)) { before?.cleanup?.(); owner.effects.push(() => { owner.slots[i] = { deps, cleanup: fn() }; }); } },
};
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const tick = () => new Promise(resolve => setImmediate(resolve));
function component(Component, props) {
  const own = { slots: [], cursor: 0, effects: [] };
  return { render() { runtime = own; own.cursor = 0; const tree = nodes(Component(props)); own.effects.splice(0).forEach(fn => fn()); return tree; }, unmount() { own.slots.forEach(slot => slot?.cleanup?.()); } };
}
function libraryHarness({ failSave = false, failLoad = false } = {}) {
  const writes = [], removed = [], toggles = [], loads = [];
  const api = load('src/features/marketing/components/MediaLibrary.tsx', {
    react: hooks, './MediaPreview': { MediaPreview: 'MediaPreview' }, './mediaLibrary.css': {},
    '../../../shared/components/states': { EmptyListState: 'EmptyListState', ErrorState: 'ErrorState', LoadingState: 'LoadingState' },
    '../../../shared/services/imageUpload': { IMAGE_ACCEPT: '.png,.heic' },
    '../../admin/components/ui': Object.fromEntries(['AdminCard','Alert','Button','Input','Select','Textarea','Toggle'].map(n => [n,n])),
    '../../admin/utils/humanizeError': { humanizeAdminError: text => text },
    '../services/mediaLibraryService': {
      fetchMediaLibrary: async (page, signal) => { loads.push(signal); if (failLoad && loads.length === 1) throw new Error('Sin conexión'); return { resultados: [item], total: 1, pagina: page, por_pagina: 24 }; },
      saveMediaResource: async (...args) => { writes.push(args); if (failSave) throw new Error('No se guardó'); return item; },
      setMediaActive: async (...args) => { toggles.push(args); return item; },
      deleteMediaResource: async (...args) => { removed.push(args); },
    },
  }, { window: { confirm: () => true } });
  const parent = component(api.MediaLibrary, { active: true, isCurrent: () => true, onDirty: () => {} });
  const form = () => { const node = parent.render().find(n => typeof n.type === 'function' && 'onSave' in n.props); return component(node.type, node.props); };
  return { parent, form, writes, removed, toggles, loads };
}

test('real form validates input before mutation and keeps edits after server rejection', async () => {
  const h = libraryHarness({ failSave: true }); h.parent.render(); await tick();
  h.parent.render().find(n => n.type === 'Button' && n.props.children === 'Agregar recurso').props.onClick();
  const form = h.form();
  form.render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(); assert.equal(h.writes.length, 0);
  form.render().find(n => n.type === 'Input' && n.props.label === 'Título del recurso').props.onChange({ target: { value: 'Mi video' } });
  form.render().find(n => n.type === 'Select' && n.props.label === 'Tipo de contenido').props.onChange({ target: { value: 'youtube' } });
  form.render().find(n => n.type === 'Input' && n.props.label === 'URL del contenido').props.onChange({ target: { value: 'https://youtu.be/M7lc1UVf-VE' } });
  form.render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await tick();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0][1].titulo, 'Mi video');
  assert.equal(form.render().find(n => n.type === 'Input' && n.props.label === 'Título del recurso').props.value, 'Mi video');
  assert(h.parent.render().some(n => n.type === 'Alert' && n.props.children === 'No se guardó'));
  form.unmount(); h.parent.unmount();
});

test('library offers retry, toggles state, and requires explicit deletion confirmation', async () => {
  const h = libraryHarness({ failLoad: true }); h.parent.render(); await tick();
  h.parent.render().find(n => n.type === 'ErrorState').props.onRetry(); h.parent.render(); await tick();
  let tree = h.parent.render();
  tree.find(n => n.type === 'Button' && n.props['aria-label'] === 'Desactivar Video').props.onClick(); await tick();
  assert.equal(h.toggles[0][0], id); assert.equal(h.toggles[0][1], false);
  tree = h.parent.render(); tree.find(n => n.type === 'Button' && n.props['aria-label'] === 'Eliminar Video').props.onClick();
  assert.equal(h.removed.length, 0);
  h.parent.render().find(n => n.type === 'Button' && n.props.children === 'Confirmar eliminación').props.onClick(); await tick();
  assert.equal(h.removed[0][0], id);
  h.parent.unmount(); assert(h.loads.at(-1).aborted);
});
