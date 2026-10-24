// Regresión reproducible. Conserva exit 1 ante cualquier fallo, incluso previo a estas tareas.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const tests = ['api-request', 'promotions', 'product-creation', 'product-editing', 'product-seo', 'order-email-notice', 'recent-orders', 'tracking-states', 'manual-transfer-rejection', 'linkify-validation', 'transfer-validation', 'store-identity', 'landing-editor', 'landing-content', 'landing-blocks', 'marketing', 'marketing-editor', 'marketing-drafts', 'visual-config', 'visual-editor', 'visual-editor-final', 'legal-pages', 'legal-page-structure', 'legal-current-version', 'legal-content-versions', 'profile', 'entrepreneur-profile', 'email-variables', 'seo-pixel', 'google-analytics-persistence', 'meta-pixel-field', 'reports', 'commercial-history', 'error-state'];
const root = path.resolve(__dirname, '..'), out = path.resolve(root, '../docs/scrum455456');
const results = []; let logs = '';
for (const test of tests) {
  const run = spawnSync(process.execPath, [path.join(__dirname, test + '.cjs')], { cwd: root, encoding: 'utf8' });
  results.push({ test, status: run.status === 0 ? 'APROBADO' : 'FALLIDO', exit: run.status });
  logs += `\nTEST ${test}\n${run.stdout}${run.stderr}`;
  console.log(`${test}: ${run.status === 0 ? 'APROBADO' : 'FALLIDO'}`);
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'regression-results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(out, 'regression.log'), logs);
if (results.some(result => result.exit !== 0)) process.exitCode = 1;
