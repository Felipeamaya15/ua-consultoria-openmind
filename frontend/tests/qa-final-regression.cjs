// Regresión final: las 34 suites solicitadas y 26 suites de consumidores públicos.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), out = path.resolve(root, '../docs/qa-final-scrum455456');
fs.mkdirSync(out, { recursive: true });
const base = spawnSync(process.execPath, [path.join(__dirname, 'feedback-regression.cjs')], { cwd: root, encoding: 'utf8' });
process.stdout.write(base.stdout); process.stderr.write(base.stderr);
const extra = ['account-navigation', 'admin-panel-help', 'analytics-checkout', 'business-time', 'cart-checkout', 'checkout-shipping', 'customer-orders', 'dashboard-navigation', 'dashboard', 'editor-emprendedor-ux', 'empty-state', 'google-analytics-field', 'google-analytics-public-store', 'google-analytics-validation', 'guest-cart', 'integration-blockers', 'loading-state', 'meta-pixel-public-store', 'order-tracking', 'product-visual-consistency', 'shipping-pickup', 'shipping-tracking-chilexpress', 'shipping-tracking', 'stock-feedback', 'store-seo-metadata', 'storefront-variants'];
const added = []; let log = '';
for (const test of extra) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test + '.cjs')], { cwd: root, encoding: 'utf8', timeout: 20000 });
  added.push({ test, status: result.status === 0 ? 'APROBADO' : 'FALLIDO', exit: result.status });
  log += `\nTEST ${test}\n${result.stdout}${result.stderr}`;
  console.log(`${test}: ${result.status === 0 ? 'APROBADO' : 'FALLIDO'}`);
}
const combined = [...JSON.parse(fs.readFileSync(path.resolve(out, '../scrum455456/regression-results.json'), 'utf8')), ...added];
fs.writeFileSync(path.join(out, 'additional-regression-results.json'), JSON.stringify(added, null, 2));
fs.writeFileSync(path.join(out, 'additional-regression.log'), log);
fs.writeFileSync(path.join(out, 'all-regression-results.json'), JSON.stringify(combined, null, 2));
if (base.status !== 0 || combined.some(result => result.exit !== 0)) process.exitCode = 1;
