const assert = require('node:assert/strict'), { test } = require('node:test');
const { load } = require('./source-loader.cjs');
const { publicationImages, buildPublication } = load('src/features/marketing/domain/content.ts');
const { readSnapshot, snapshot } = load('src/features/marketing/domain/drafts.ts');
const { initialTemplateHistory } = load('src/features/marketing/domain/editor.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const product = { id: 'a'.repeat(24), name: 'Bolso QA', category: 'QA', active: true, images: ['https://test.example/shared.png'], variants: [
  { sku: 'A', price: 100, offerPrice: null, stock: 2, active: true, attributes: [], images: ['https://test.example/a.png'] },
  { sku: 'B', price: 200, offerPrice: 150, stock: 2, active: true, attributes: [], images: ['https://test.example/b.png', 'https://test.example/shared.png'] },
] };

test('catalog images follow chosen variant and offer; shared images are deduplicated', () => {
  assert.deepEqual(plain(publicationImages(product, 'B')), ['https://test.example/b.png', 'https://test.example/shared.png']);
  assert.equal(buildPublication(product, 'product').image, 'https://test.example/a.png');
  assert.equal(buildPublication(product, 'promotion').image, 'https://test.example/b.png');
  assert.equal(publicationImages(product, '', 'promotion')[0], 'https://test.example/b.png');
  assert.deepEqual(plain(publicationImages({ ...product, variants: [{ ...product.variants[0], images: [] }] }, 'A')), product.images);
});

test('private library drafts store only reference and styles, reloadable without image bytes or tokens', () => {
  const ref = { kind: 'library', id: '52100000-0000-4000-8000-000000000001' };
  const saved = readSnapshot(snapshot('', '', 'product', 'square', initialTemplateHistory(), ref));
  assert.deepEqual(plain(saved.sharingReference), ref);
  assert(!JSON.stringify(saved).includes('data:image'));
  assert.throws(() => readSnapshot({ ...saved, sharingReference: { kind: 'library', id: '../otra' } }));
});

test('library filters are URL encoded with authentication and private detail never sends tokens in URLs', async () => {
  const calls = [], id = '52100000-0000-4000-8000-000000000001';
  const resource = { id, titulo: 'QA', descripcion: '', tipo: 'imagen', url: 'https://test.example/a.png', activo: true, archivo: null };
  const api = load('src/features/marketing/services/mediaLibraryService.ts', {
    '../../../api': { API_BASE_URL: 'http://api.test' },
    '../../../shared/services/apiRequest': { requestJson: async (url, options) => { calls.push([url, options]); return url.includes('?') ? { resultados: [resource], total: 1, pagina: 1, por_pagina: 24 } : resource; } },
  }, { localStorage: { getItem: () => 'synthetic-token' }, sessionStorage: { getItem: () => null } });
  await api.fetchMediaLibrary(1, undefined, { q: 'Azul & lino', tipo: 'imagen', estado: 'activo', orden: 'nombre' });
  assert.equal(new URL(calls[0][0]).searchParams.get('q'), 'Azul & lino');
  assert.equal(new URL(calls[0][0]).searchParams.get('estado'), 'activo');
  await api.fetchMediaResource(id);
  assert.equal(calls[1][1].headers.Authorization, 'Token synthetic-token');
  assert(!calls[1][0].includes('synthetic-token'));
});

test('private image resolution revalidates ownership/availability and never creates a public media URL', async () => {
  let active = true, calls = 0;
  const { resolveSharingItem } = load('src/features/marketing/services/sharingService.ts', {
    '../../landing/services/landingService': {}, '../../landing/services/sectionResources': {}, '../../storefront/services/catalogService': {},
    '../../admin/services/promotionService': {}, './socialProfilesService': {}, './marketingService': {},
    './mediaLibraryService': { fetchMediaResource: async () => { calls++; return { titulo: 'Privada', descripcion: 'QA', activo: active, tipo: 'imagen', url: '', archivo: { mime: 'image/png' } }; }, fetchMediaImage: async () => new Blob(['qa'], { type: 'image/png' }) },
  }, { Uint8Array, btoa: value => Buffer.from(value, 'binary').toString('base64') });
  const ref = { kind: 'library', id: '52100000-0000-4000-8000-000000000001' }, signal = new AbortController().signal;
  const item = await resolveSharingItem(ref, 'https://shop.test/plantilla/1', signal);
  assert.match(item.images[0], /^data:image\/png;base64,/);
  assert.equal(item.url, 'https://shop.test/plantilla/1');
  active = false;
  await assert.rejects(resolveSharingItem(ref, 'https://shop.test', signal), /activa/);
  assert.equal(calls, 2);
});
