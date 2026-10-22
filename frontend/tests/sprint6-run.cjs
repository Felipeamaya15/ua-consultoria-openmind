const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const tests = ['sprint6-qa', 'shipping-pickup', 'checkout-shipping', 'cart-checkout', 'promotions', 'integration-blockers',
  'product-creation', 'product-editing', 'customer-orders', 'dashboard', 'recent-orders', 'dashboard-navigation', 'analytics-checkout', 'reports',
  'editor-emprendedor-ux', 'visual-editor', 'visual-editor-final', 'landing-blocks'];
const log = [], results = [];
for (const name of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, `${name}.cjs`)], { encoding: 'utf8', timeout: 120000 });
  log.push(`\n=== ${name} (exit ${result.status}) ===\n${result.stdout || ''}${result.stderr || ''}`);
  results.push({ name, exit: result.status, error: result.error?.message });
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${name}`);
}
const folder = path.resolve(__dirname, '../../docs/sprint6-qa'); fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'frontend-tests.log'), log.join('\n'));
fs.writeFileSync(path.join(folder, 'frontend-results.json'), JSON.stringify(results, null, 2));
if (results.some(result => result.exit !== 0)) process.exitCode = 1;
