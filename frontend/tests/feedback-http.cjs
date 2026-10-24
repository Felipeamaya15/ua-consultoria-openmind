// Requiere: postman simulation run tests/feedback.sim.yaml --port 4915 --no-history
const assert = require('node:assert/strict');
const { load } = require('./source-loader.cjs');
const base = process.env.FEEDBACK_API || 'http://127.0.0.1:4915/openmind';
const globals = { fetch, FormData, Event, window: new EventTarget(), DOMException, localStorage: { getItem: () => 'qa-only' }, sessionStorage: { getItem: () => null } };
const mocks = { '../../../api': { API_BASE_URL: base }, '../../auth/services/authService': { authService: { getToken: () => 'qa-only' } } };
const mod = path => load(`src/${path}`, mocks, globals);
const { requestJson } = mod('shared/services/apiRequest.ts');
const state = async value => { const r = await fetch(base + '/__qa/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); assert(r.ok); };
(async () => {
  await state({ reset: true });
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504]) {
    await assert.rejects(requestJson(base + '/__qa/error/' + status), error => error.status === status);
  }
  await assert.rejects(requestJson(base + '/__qa/error/200'), /respuesta recibida no es válida/);
  await assert.rejects(requestJson(base + '/__qa/error/408', {}, undefined, 30), /tardó demasiado/);
  await assert.rejects(requestJson('http://127.0.0.1:1/offline'), /conectar con el servidor/);
  const controller = new AbortController();
  const cancelled = requestJson(base + '/__qa/error/408', { signal: controller.signal }); controller.abort();
  await assert.rejects(cancelled, error => error.name === 'AbortError');
  const business = mod('features/storefront/services/storeInformationService.ts');
  assert.equal((await business.saveStoreInformation({ nombre: 'Negocio HTTP QA', descripcion: 'Prueba' })).nombre, 'Negocio HTTP QA');
  await state({ failBusiness: true }); await assert.rejects(business.saveStoreInformation({ nombre: 'Rechazado', descripcion: '' }), /Revisa el nombre/);
  await state({ failBusiness: false });
  const landing = mod('features/landing/services/landingService.ts');
  const form = { titulo: 'Portada por HTTP', descripcion: 'QA', texto_boton: 'Ver', secciones: {}, imagen_principal: null };
  assert.equal((await landing.saveLandingConfig(form)).titulo, form.titulo);
  await state({ failLanding: true }); await assert.rejects(landing.saveLandingConfig(form), /servicio no está disponible/);
  await state({ failLanding: false });
  const { promotionService: promos } = mod('features/admin/services/promotionService.ts');
  let promotion = await promos.create({ name: 'Promoción QA', code: 'QA10', type: 'percentage', value: 10, startsAt: '2026-10-20', active: true });
  promotion = await promos.update({ ...promotion, name: 'Promoción editada QA' }); assert.equal(promotion.name, 'Promoción editada QA');
  assert.equal((await promos.update({ ...promotion, active: false })).active, false);
  await promos.remove(promotion.id); assert.equal((await promos.list()).length, 0);
  const orders = mod('features/admin/services/recentOrdersService.ts');
  assert.equal((await orders.updateOrderStatus(7, 'preparando')).estado, 'preparando');
  await state({ emailFailed: true }); const order = await orders.updateOrderStatus(7, 'enviado');
  assert.equal(order.estado, 'enviado'); assert(orders.describeShipmentEmail(order.correo).failed);
  const legal = mod('features/storefront/services/legalService.ts').legalService;
  assert.equal((await legal.fetchAdminLegalPages()).terms.version, 1);
  await state({ failLegal: true }); await assert.rejects(legal.fetchAdminLegalPages(), /servicio no está disponible/);
  console.log('APROBADO: 15 fallos HTTP/red/timeout/cancelación y servicios de negocio, portada multipart, promociones, pedidos y legales sobre HTTP real contra Postman.');
})().catch(error => { console.error(error); process.exitCode = 1; });
