// Regression of the rendered purchase summary and the current error boundary.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./source-loader.cjs');

test('customer errors preserve actionable feedback and hide technical/sensitive details', () => {
  const { humanizeAdminError } = load('src/features/admin/utils/humanizeError.ts');
  const fallback = 'No pudimos completar esta acción. Intenta nuevamente.';
  for (const error of ['Traceback /app/settings.py', 'SELECT password FROM usuario', 'token=private', 'mongodb://user:pass@local', null]) {
    assert.equal(humanizeAdminError(error), fallback);
  }
  assert.equal(humanizeAdminError('Selecciona una comuna.'), 'Selecciona una comuna.');
});

test('summary renders actual SKU attributes, quantities and financial breakdown without mutating input', () => {
  const Card = load('src/features/storefront/components/OrderSummaryCard.tsx', {
    '../data/mockData': { formatPrice: amount => `CLP ${amount}` },
  }).default;
  const summary = { items: [{ id: 'sku-m', name: 'Polera <M>', quantity: 2, price: 1000, variantAttributes: { talla: 'M' } }], subtotal: 2000, shippingCost: 500, discount: 200, total: 2300 };
  const before = JSON.stringify(summary);
  const html = renderToStaticMarkup(React.createElement(Card, { summary }));
  for (const text of ['Polera &lt;M&gt;', '2 productos', 'M', 'CLP 2000', 'CLP 500', '-CLP 200', 'CLP 2300']) assert.ok(html.includes(text), text);
  assert.equal(JSON.stringify(summary), before);
  assert.equal(renderToStaticMarkup(React.createElement(Card, { summary: { ...summary, items: [] } })), '');
});

test('default receipt and payment templates include the purchase summary marker', () => {
  const templates = load('src/features/admin/data/emailTemplates.ts').createDefaultEmailTemplates();
  assert.ok(templates.order_received.body.includes('{{orderSummary}}'));
  assert.ok(templates.payment_success.body.includes('{{orderSummary}}'));
});
