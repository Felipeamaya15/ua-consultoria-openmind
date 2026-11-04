const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./source-loader.cjs');
const { profileLink, publicSocialLinks } = load('src/features/landing/types/socialProfiles.ts');

test('normalizes handles, official profile URLs and WhatsApp with an encoded message', () => {
  for (const [network, input, expected] of [
    ['instagram', '@mi.tienda', 'https://instagram.com/mi.tienda'],
    ['instagram', 'instagram.comercio', 'https://instagram.com/instagram.comercio'],
    ['instagram', 'https://instagram.com/mi%2Etienda', 'https://instagram.com/mi.tienda'],
    ['instagram', 'www.instagram.com/mi.tienda/?igsh=tracking', 'https://instagram.com/mi.tienda'],
    ['facebook', 'mi.tienda', 'https://facebook.com/mi.tienda'],
    ['facebook', 'facebook.company', 'https://facebook.com/facebook.company'],
    ['facebook', 'https://m.facebook.com/profile.php?id=123', 'https://facebook.com/profile.php?id=123'],
    ['facebook', 'https://facebook.com/people/Mi-Tienda/123/', 'https://facebook.com/people/Mi-Tienda/123'],
    ['youtube', '@mi-canal', 'https://youtube.com/@mi-canal'],
    ['youtube', 'https://youtube.com/channel/UC' + 'a'.repeat(22), 'https://youtube.com/channel/UC' + 'a'.repeat(22)],
    ['youtube', 'https://youtube.com/user/MiCanal', 'https://youtube.com/user/MiCanal'],
  ]) {
    const result = profileLink(network, input);
    assert.equal(result.error, '', input); assert.equal(result.url, expected);
  }
  const wa = profileLink('whatsapp', '+56 (9) 1234-5678', '¡Hola! Quiero café & té');
  assert.equal(wa.value, '+56912345678');
  assert.equal(new URL(wa.url).searchParams.get('text'), '¡Hola! Quiero café & té');
  assert.equal(profileLink('whatsapp', '56912345678').url, 'https://wa.me/56912345678');
});

test('rejects mismatched hosts, unsafe URLs, posts, invalid phones and oversized messages', () => {
  for (const [network, value] of [
    ['instagram', 'https://instagram.com.evil.test/name'], ['instagram', 'https://facebook.com/name'],
    ['instagram', 'https://user:pass@instagram.com/name'], ['instagram', 'https://instagram.com:443/name'],
    ['instagram', 'javascript:alert(1)'], ['instagram', 'ftp://instagram.com/name'],
    ['instagram', 'https://instagram.com/p/123'], ['instagram', 'bad..name'],
    ['facebook', 'https://facebook.com/profile.php?id=123&id=456'],
    ['youtube', 'https://youtube.com/watch?v=123'], ['youtube', 'https://youtu.be/123'],
    ['youtube', 'https://youtube.com/@%bad'], ['youtube', '@ab'],
    ['whatsapp', '123'], ['whatsapp', '+012345678'], ['whatsapp', '+1234567890123456'],
    ['whatsapp', 'https://wa.me/56912345678'], ['whatsapp', '+56 nueve 1234'],
  ]) assert(profileLink(network, value).error, value);
  assert(profileLink('whatsapp', '+56912345678', 'a'.repeat(501)).error);
});

test('shared public adapter preserves legacy links, hides disabled/deleted profiles and includes YouTube', () => {
  const contact = { instagram: 'https://www.instagram.com/antes/', facebook: 'https://facebook.com/pages/Antigua/123', whatsapp: '+56 9 1234 5678', youtube: 'https://youtube.com/@mi-canal' };
  assert.equal(publicSocialLinks(contact).length, 4);
  assert(publicSocialLinks(contact).some(item => item.href === contact.facebook));
  contact.redes_sociales = { instagram: { activo: false }, whatsapp: { activo: true, mensaje: 'Hola & gracias' } };
  let result = publicSocialLinks(contact);
  assert.equal(result.length, 3); assert(!result.some(item => item.label === 'Instagram'));
  assert.equal(new URL(result.find(item => item.label === 'WhatsApp').href).searchParams.get('text'), 'Hola & gracias');
  contact.youtube = ''; result = publicSocialLinks(contact);
  assert(!result.some(item => item.label === 'YouTube'));
  assert.equal(publicSocialLinks({ instagram: 'javascript:alert(1)' }).length, 0);
});

function serviceHarness(response) {
  const calls = [], events = [];
  let token = 'test-session';
  const api = load('src/features/marketing/services/socialProfilesService.ts', {
    '../../../api': { API_BASE_URL: 'http://test' },
    '../../../shared/services/apiRequest': { requestJson: async (...args) => { calls.push(args); return typeof response === 'function' ? response() : response; } },
    '../../landing/services/landingService': { LANDING_CONFIG_CHANGED: 'landing-changed' },
  }, { localStorage: { getItem: () => token }, sessionStorage: { getItem: () => null }, window: { dispatchEvent: event => events.push(event.type) }, Event });
  return { api, calls, events, clearSession: () => { token = null; } };
}
const blank = () => Object.fromEntries(['instagram', 'facebook', 'youtube', 'whatsapp'].map(n => [n, { perfil: '', activo: false, mensaje: '' }]));

test('private service sends one store-independent patch, supports deletion and notifies public landing only after success', async () => {
  const h = serviceHarness(blank()), signal = new AbortController().signal;
  await h.api.fetchSocialProfiles(signal);
  assert.equal(h.calls[0][1].headers.Authorization, 'Token test-session');
  assert.equal(h.calls[0][1].cache, 'no-store'); assert.equal(h.events.length, 0);
  const value = { perfil: '@mi.tienda', activo: true, mensaje: '' };
  await h.api.saveSocialProfile('instagram', value, signal);
  assert.equal(h.calls[1][0], 'http://test/api/landing/redes-sociales/');
  assert.equal(h.calls[1][1].method, 'PATCH'); assert.equal(h.calls[1][1].signal, signal);
  assert.deepEqual(JSON.parse(h.calls[1][1].body), { instagram: value });
  await h.api.saveSocialProfile('instagram', null);
  assert.deepEqual(JSON.parse(h.calls[2][1].body), { instagram: null });
  assert.deepEqual(h.events, ['landing-changed', 'landing-changed']);
  h.clearSession(); await assert.rejects(h.api.fetchSocialProfiles(), /Inicia sesión/); assert.equal(h.calls.length, 3);
});

test('failed or malformed writes cannot claim a successful save or refresh the public page', async () => {
  for (const response of [null, { instagram: {} }, () => { throw new Error('Sin permiso'); }]) {
    const h = serviceHarness(response);
    await assert.rejects(h.api.saveSocialProfile('youtube', null)); assert.equal(h.events.length, 0);
  }
});

// Small hook runner executes the real card's event handlers and async state changes.
let runtime;
const hooks = {
  useState(initial) { const index = runtime.index++, instance = runtime; if (!(index in instance.slots)) instance.slots[index] = typeof initial === 'function' ? initial() : initial; return [instance.slots[index], value => { instance.slots[index] = typeof value === 'function' ? value(instance.slots[index]) : value; }]; },
  useRef(initial) { const index = runtime.index++; return runtime.slots[index] ??= { current: initial }; },
  useCallback(fn) { return fn; },
  useEffect(fn, deps) { const index = runtime.index++; const old = runtime.slots[index]; if (!old || deps.some((value, i) => old.deps[i] !== value)) { old?.cleanup?.(); runtime.effects.push(() => { runtime.slots[index] = { deps, cleanup: fn() }; }); } },
};
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const tick = () => new Promise(resolve => setImmediate(resolve));
function component(Component, props) {
  const instance = { slots: [], index: 0, effects: [] };
  return { render() { runtime = instance; instance.index = 0; const tree = Component(props); instance.effects.splice(0).forEach(fn => fn()); return nodes(tree); }, unmount() { instance.slots.forEach(slot => slot?.cleanup?.()); } };
}
function cardsHarness(persist) {
  const writes = [], changes = [], data = blank();
  const api = load('src/features/marketing/components/SocialProfiles.tsx', {
    react: hooks,
    '../../../shared/components/states': { ErrorState: 'ErrorState', LoadingState: 'LoadingState' },
    '../../admin/components/ui': Object.fromEntries(['AdminCard', 'Alert', 'Button', 'Icon', 'Input', 'Textarea', 'Toggle'].map(name => [name, name])),
    '../services/socialProfilesService': { fetchSocialProfiles: async () => data, saveSocialProfile: async (network, value, signal) => { writes.push({ network, value, signal }); return persist ? persist(network, value, data) : { ...data, [network]: value || { perfil: '', activo: false, mensaje: '' } }; } },
  });
  const parent = component(api.SocialProfiles, { active: true, isCurrent: () => true, onDirty: dirty => changes.push(dirty) });
  return { parent, writes, changes, card: tree => { const entry = tree.find(n => typeof n.type === 'function' && n.props.network === 'instagram'); return component(entry.type, entry.props); } };
}

test('card validates before writing, saves, toggles, reloads its baseline and deletes with explicit confirmation', async () => {
  const h = cardsHarness(); h.parent.render(); await tick();
  const card = h.card(h.parent.render());
  const input = value => card.render().find(n => n.type === 'Input').props.onChange({ target: { value } });
  const submit = () => card.render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  input('https://evil.test/name'); submit(); await tick(); assert.equal(h.writes.length, 0);
  input('@mi.tienda'); submit(); await tick();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].value.activo, true);
  assert(card.render().some(n => n.props?.role === 'status' && n.props.children === 'Cambios guardados.'));
  card.render().find(n => n.type === 'Toggle').props.onChange(false); submit(); await tick();
  assert.equal(h.writes[1].value.activo, false);
  card.render().find(n => n.type === 'Button' && n.props.children === 'Eliminar configuración').props.onClick();
  card.render().find(n => n.type === 'Button' && n.props.children === 'Confirmar eliminación').props.onClick(); await tick();
  assert.equal(h.writes[2].value, null);
  assert.equal(card.render().find(n => n.type === 'Input').props.value, '');
  card.unmount(); h.parent.unmount();
});

test('card preserves unsaved edits after server error and aborts pending requests on unmount', async () => {
  const h = cardsHarness(() => { throw new Error('No autorizado'); }); h.parent.render(); await tick();
  const card = h.card(h.parent.render());
  card.render().find(n => n.type === 'Input').props.onChange({ target: { value: '@mi.tienda' } });
  card.render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await tick();
  const tree = card.render();
  assert.equal(tree.find(n => n.type === 'Input').props.value, '@mi.tienda');
  assert(tree.some(n => n.type === 'Alert' && n.props.children === 'No autorizado'));
  assert(!tree.some(n => n.props?.role === 'status' && n.props.children === 'Cambios guardados.'));
  card.unmount(); h.parent.unmount();
  const pending = cardsHarness(() => new Promise(() => {})); pending.parent.render(); await tick();
  const pendingCard = pending.card(pending.parent.render());
  pendingCard.render().find(n => n.type === 'Input').props.onChange({ target: { value: '@mi.tienda' } });
  pendingCard.render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  pendingCard.unmount(); assert(pending.writes[0].signal.aborted); pending.parent.unmount();
});
