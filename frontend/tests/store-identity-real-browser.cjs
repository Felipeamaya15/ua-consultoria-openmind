const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.IDENTITY_TEST_URL || 'http://localhost:5173';
const api = process.env.IDENTITY_API_URL || 'http://127.0.0.1:8000';
const before = process.env.IDENTITY_STAGE === 'antes';
const out = path.resolve(__dirname, '../../docs/identidad-visual-plantillas');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const findings = [];
  try {
    const request = await browser.newContext();
    const read = async p => { const r = await request.request.get(api + p); assert(r.ok(), `${p}: ${r.status()}`); return (await r.json()).data; };
    const business = await read('/api/tienda/configuracion/'), landing = await read('/api/landing/configuracion/'), products = await read('/api/catalog/productos/');
    for (const width of [375, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 } });
      // This read-only real-data audit cannot write business data, even accidentally.
      await context.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const template of [1, 2, 3, 4]) {
        await page.goto(`${base}/plantilla/${template}`);
        await page.locator('h1').filter({ hasText: landing.titulo }).waitFor();
        await page.waitForTimeout(350);
        const header = page.locator('header[data-visual-section="header"]');
        const data = await header.evaluate(el => ({ text: el.innerText, logo: el.querySelector('[data-visual-part="logo"] img')?.getAttribute('src'), headerWidth: el.getBoundingClientRect().width }));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        const images = await page.locator('img[data-landing-image]').evaluateAll(imgs => imgs.filter(i => !i.hidden).map(i => ({src:i.src, loaded:i.complete && i.naturalWidth > 0})));
        findings.push({ width, template, ...data, overflow, images, errors: [...errors] });
        if (!before) {
          await header.getByRole('link', {name: `Ir al inicio de ${business.nombre}`, exact:true}).waitFor();
          assert.equal(await header.locator('[data-visual-part="logo"] img').count(), landing.logo ? 1 : 0);
          assert.equal(data.logo, landing.logo || undefined);
          assert(!overflow, `${template}/${width}: overflow`);
          assert(!data.text.includes('UNIVERSIDAD'), 'marca institucional fuera de cabecera comercial');
          assert.equal(await page.locator('[data-institutional-bar] [data-institutional-branding]').count(), 1);
          await page.reload();
          await header.getByRole('link', {name:`Ir al inicio de ${business.nombre}`,exact:true}).waitFor();
          assert.equal(await page.locator('h1').first().textContent().then(s=>s.trim()), landing.titulo);
          for (const id of landing.contenido?.productos_destacados || []) {
            const product = products.find(p => p.id === id);
            if (product) assert(await page.locator(`a[href="/plantilla/${template}/producto/${product.slug}"]`).count() > 0, product.nombre);
          }
        }
        await page.screenshot({ path: path.join(out, `${before?'antes':'despues'}-${template}-${width}.png`) });
        if (!before) assert.equal(errors.length, 0, errors.join('\n'));
        console.log(`OK API REAL ${before?'antes':'después'} plantilla ${template} ${width}px`);
      }
      await context.close();
    }
    await request.close();
  } finally {
    fs.writeFileSync(path.join(out, `${before?'antes':'despues'}-datos-reales.json`), JSON.stringify(findings, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode=1; });
