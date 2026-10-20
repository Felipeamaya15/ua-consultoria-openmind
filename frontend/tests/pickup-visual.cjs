// Prueba en navegador del editor real; servicios externos sustituidos por fixtures explícitas.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), esbuild = require('esbuild');
const { chromium } = require(process.env.PICKUP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import PickupEditor from './src/features/admin/components/shipping/PickupEditor';
    import{validatePickup}from'./src/features/admin/services/pickupConfiguration';
    function App(){const[value,setValue]=useState({enabled:false,address:'',schedule:''});const[errors,setErrors]=useState({});const[configured,setConfigured]=useState(null);
      return <main className="admin-shell" style={{padding:24,maxWidth:760,margin:'auto'}}><PickupEditor value={value} errors={errors} onChange={setValue} onProviderStatus={setConfigured}/>
      <button id="save-fixture" onClick={()=>setErrors(validatePickup(value,configured===true))}>Validar configuración de prueba</button><output id="validation-errors">{Object.keys(errors).length}</output></main>}
    createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, jsx: 'automatic', bundle: true, write: false, format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, plugins: [{ name: 'address-fixture', setup(build) {
      build.onLoad({ filter: /shippingService\.ts$/ }, () => ({ loader: 'js', contents: `
        export async function getPickupAddressStatus(){return{configured:window.PICKUP_TEST_PROVIDER}}
        export async function searchPickupAddresses(){return[{region:'Metropolitana de Santiago',comuna:'Providencia',street:'Avenida Providencia',number:'1234',reference:'',verification:'fixture-not-real'}]}` }));
    }}] });
  const assets = path.join(root, 'dist/assets'), css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(n => /^index-.*\.css$/.test(n))), 'utf8');
  const adminCss = fs.readFileSync(path.join(root, 'src/features/admin/admin.css'), 'utf8');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const output = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'pickup-visual-')); fs.mkdirSync(output, { recursive: true });
  try {
    for (const configured of [false, true]) {
    for (const width of [375, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', error => console.error('Error de navegador:', error.message));
      await page.setContent(`<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${adminCss}</style><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: `window.PICKUP_TEST_PROVIDER=${configured};` });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByText('Ofrecer retiro a clientes', { exact: true }).click();
      assert.equal(await page.getByLabel('Activar retiro en tienda').isChecked(), true);
      await page.locator('#save-fixture').click();
      await page.getByText('Habilita al menos un día de retiro.').waitFor();
      await page.getByLabel('Región', { exact: true }).selectOption('Metropolitana de Santiago');
      await page.getByLabel('Comuna', { exact: true }).selectOption('Providencia');
      await page.getByLabel('Calle o establecimiento', { exact: true }).fill('Providencia');
      await page.getByLabel('Número', { exact: true }).fill('1234');
      if (configured) {
        await page.getByRole('button', { name: 'Buscar dirección', exact: true }).click();
        await page.getByRole('button', { name: 'Avenida Providencia 1234, Providencia, Metropolitana de Santiago' }).click();
        await page.getByText('Dirección seleccionada y reconocida por el proveedor.').waitFor();
      } else {
        await page.getByText('Dirección ingresada manualmente; no verificada externamente.', {exact:true}).waitFor();
        assert.equal(await page.getByRole('button', {name:'Buscar dirección',exact:true}).count(),0);
        assert.equal(await page.getByText('Dirección seleccionada y reconocida por el proveedor.').count(),0);
      }
      for (const day of ['Lunes', 'Martes', 'Viernes']) {
        await page.locator('label').filter({ hasText: day }).filter({ has: page.locator('input[type=checkbox]') }).locator('input').check();
        await page.getByLabel(`Inicio ${day}`, { exact: true }).fill('09:00');
        await page.getByLabel(`Término ${day}`, { exact: true }).fill('18:00');
      }
      await page.locator('#save-fixture').click();
      await page.getByText('Lunes, Martes, Viernes: 09:00 a 18:00', { exact: false }).waitFor();
      assert.equal(await page.getByText('Habilita al menos un día de retiro.').count(), 0);
      assert.equal(await page.locator('#validation-errors').textContent(), '0');
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
      assert.ok(dimensions.scroll <= dimensions.width, `sin desbordamiento a ${width}px`);
      await page.screenshot({ path: path.join(output, `pickup-${configured ? "google" : "manual"}-${width}.png`), fullPage: true });
      console.log(`OK ${configured ? "Google con fixture" : "manual sin proveedor"} ${width}px: activación, dirección, horarios y validación`);
      await page.close();
    }
    }
    console.log(`Capturas: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
