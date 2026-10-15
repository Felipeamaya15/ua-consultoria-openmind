// Renderiza los componentes reales con fixtures de prueba y el CSS compilado.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const assert = require('node:assert/strict'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require(process.env.DASHBOARD_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
function load(relative, mocks = {}) {
  const file = path.resolve(root, relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const req = id => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    const p = path.resolve(path.dirname(file), id);
    return load(['.ts', '.tsx'].map(ext => p + ext).find(fs.existsSync) || path.join(p, 'index.tsx'), mocks);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: req, URLSearchParams });
  return module.exports;
}
const { DashboardMetrics } = load('src/features/admin/components/dashboard/DashboardMetrics.tsx', {
  'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
  '../../data/mockAdminData': { formatPrice: n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n) },
});
const assets = path.join(root, 'dist/assets');
const css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(n => /^index-.*\.css$/.test(n))), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'src/features/admin/admin.css'), 'utf8');
const data = { fecha_desde: '2026-10-08', fecha_hasta: '2026-10-14', total_ventas: '123456789.00', total_pedidos: 42, por_despachar: 12,
  historico: Array.from({ length: 7 }, (_, i) => ({ fecha: `2026-10-${String(i + 8).padStart(2, '0')}`, ventas: i === 6 ? '123456789.00' : '0.00', pedidos: i === 6 ? 42 : 0 })) };
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.DASHBOARD_BROWSER_CHANNEL || 'msedge' });
  const output = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-visual-'));
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [375, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const state of [{ status: 'ready', data }, { status: 'loading' }, { status: 'error', message: 'No se pudo conectar con el servidor.' }, { status: 'ready', data: { ...data, total_pedidos: 0, total_ventas: '0.00', por_despachar: 0 } }]) {
        const label = state.status === 'ready' && !state.data.total_pedidos ? 'empty' : state.status;
        const markup = renderToStaticMarkup(React.createElement(DashboardMetrics, { state, onRetry() {} }));
        await page.setContent(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}\n${adminCss}</style><body class="admin-shell"><main style="padding:24px;max-width:1200px;margin:auto"><h1 style="margin-bottom:24px;font-size:24px;font-weight:bold">Resumen de la Tienda</h1>${markup}</main></body></html>`);
        const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
        assert.ok(dimensions.scroll <= dimensions.width, `sin desbordamiento: ${width}/${label}`);
        const boxes = await page.locator('section[aria-label="Estadísticas de la tienda"] > div:first-child > :is(a, div)').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
        if (width === 375) assert.ok(boxes[1].y > boxes[0].y, 'tarjetas apiladas en móvil');
        else assert.equal(boxes[1].y, boxes[0].y, 'tarjetas en dos columnas en tablet y cuatro en escritorio');
        await page.screenshot({ path: path.join(output, `dashboard-${width}-${label}.png`), fullPage: true });
        console.log(`OK ${width}px ${label}`);
      }
      await page.close();
    }
    console.log(`Capturas: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
