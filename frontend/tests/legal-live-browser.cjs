// Auditoría de solo lectura sobre la aplicación local y sus datos legales existentes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.LEGAL_LIVE_URL || 'http://127.0.0.1:5173', api = process.env.LEGAL_LIVE_API || 'http://127.0.0.1:8000';
const out = process.env.LEGAL_LIVE_OUT || path.resolve(__dirname, '../../docs/scrum455456/evidence');
(async () => {
  const response = await fetch(api + '/api/legal/'); assert.equal(response.status, 200);
  const pages = (await response.json()).data;
  assert.equal((await fetch(api + '/api/legal/configuracion/')).status, 401);
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), results = [], errors = [];
  await context.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  try {
    for (const type of ['terms', 'privacy', 'refund', 'cookies']) {
      await page.goto(`${base}/plantilla/1/legal/${type}`);
      await page.getByRole('heading', { name: pages[type].title, exact: true }).waitFor();
      assert((await page.locator('body').innerText()).includes(pages[type].published.split('\n\n').find(p => !p.startsWith('**'))));
      results.push({ action: 'Leer página legal ' + type, expected: 'Versión publicada existente visible', obtained: 'HTTP 200 y contenido publicado renderizado', status: 'APROBADO', version: pages[type].version });
    }
    assert.deepEqual(errors, []);
    fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, 'legal-live.png') });
    fs.writeFileSync(path.join(out, 'legal-live-results.json'), JSON.stringify(results, null, 2));
    console.log('APROBADO: cuatro páginas legales públicas reales; configuración protegida con 401; ninguna escritura ni excepción de React.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
