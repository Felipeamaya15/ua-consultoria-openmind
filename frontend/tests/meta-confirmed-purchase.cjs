const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./source-loader.cjs');

function harness(consent = 'granted') {
  const storage = new Map(), events = [];
  const window = {__metaPixelConsent: consent, fbq: (...args) => events.push(args)};
  const {trackConfirmedMetaPurchase} = load('src/features/storefront/services/metaPurchaseTracking.ts', {}, {
    window, sessionStorage: {getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)},
  });
  storage.set('meta-order:1:ORDER', JSON.stringify({value: 35000, currency: 'CLP',
    content_ids: ['physical', 'activity:workshop'],
    contents: [{id: 'physical', quantity: 1, item_price: 5000},
               {id: 'activity:workshop', quantity: 2, item_price: 15000}]}));
  return {track: trackConfirmedMetaPurchase, storage, events};
}

test('compra mixta confirmada usa el total guardado del servidor una sola vez', () => {
  const h = harness();
  assert.equal(h.track(1, 'ORDER'), true);
  assert.equal(h.track(1, 'ORDER'), false);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0][1], 'Purchase');
  assert.equal(h.events[0][2].value, 35000);
  assert.equal(h.events[0][2].currency, 'CLP');
  assert.deepEqual(Array.from(h.events[0][2].content_ids), ['physical', 'activity:workshop']);
  assert.equal(h.events[0][2].email, undefined);
});

test('sin consentimiento o tras revocarlo no hay Purchase', () => {
  for (const consent of [undefined, 'revoked']) {
    const h = harness(consent === undefined ? null : consent);
    assert.equal(h.track(1, 'ORDER'), false);
    assert.equal(h.events.length, 0);
  }
});

test('otro pedido o datos corruptos nunca generan un valor inventado', () => {
  const h = harness();
  assert.equal(h.track(1, 'OTHER'), false);
  for (const data of ['{broken', JSON.stringify({value: -1, currency: 'CLP', content_ids: []}),
                      JSON.stringify({value: 1, currency: 'USD', content_ids: []})]) {
    h.storage.set('meta-order:1:ORDER', data);
    assert.equal(h.track(1, 'ORDER'), false);
  }
  assert.equal(h.events.length, 0);
});
