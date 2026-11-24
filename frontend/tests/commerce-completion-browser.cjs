const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{WholesaleQuote}from'./src/features/storefront/components/store/WholesaleQuote';
import{InvoiceFields}from'./src/features/storefront/components/store/InvoiceFields';
import{CommerceSettings}from'./src/features/marketing/components/CommerceSettings';
import MyWorkshops from'./src/features/storefront/pages/MyWorkshops';
import{HomeCategories}from'./src/features/landing/components/HomeCategories';
import{resolveVisualConfig}from'./src/features/storefront/visual/resolveVisualConfig';
import{visualConfigToCssVariables}from'./src/features/storefront/visual/cssVariables';
const template=['editorial','minimal','visual','catalog'][Number(location.pathname.split('/')[2])-1];
function App(){const[value,setValue]=useState();window.__invoice=value;return <BrowserRouter><div data-storefront-visual={template} style={visualConfigToCssVariables(resolveVisualConfig({template}))}><main data-landing-page={template} style={{maxWidth:800,margin:'auto',padding:16}}><HomeCategories/><WholesaleQuote productId={'a'.repeat(24)} productName="Producto sintético"/><InvoiceFields value={value} onChange={setValue}/><CommerceSettings active/><MyWorkshops/></main></div></BrowserRouter>;}createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await esbuild.build({stdin: {contents: entry, loader: 'tsx', resolveDir: root}, bundle: true, write: false,
    format: 'iife', jsx: 'automatic', loader: {'.css': 'empty'}, define: {'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}'},
    plugins: [{name: 'local-commerce', setup(build) {
      build.onLoad({filter: /[\\/]StoreContext\.tsx$/},()=>({loader:'js',contents:`export const useStore=()=>({landingProducts:[{status:'active',category:'Categoría sintética',images:innerWidth>600?['data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16"%3E%3Crect width="16" height="16" fill="%23243e75"/%3E%3C/svg%3E']:[]}]});`}));
      build.onLoad({filter: /useLandingContent\.ts$/},()=>({loader:'js',contents:`export const useLandingContent=()=>({categories:['Categoría sintética']});`}));
      build.onLoad({filter: /commerceService\.ts$/}, async args => {
        const source = await fs.promises.readFile(args.path, 'utf8');
        const validation = source.slice(source.indexOf('export function invoiceErrors'), source.indexOf('export async function commerceRequest'));
        return {loader: 'ts', contents: validation + `
window.__calls=[];let options={cotizaciones:true,factura:true,recordatorios:false};
export async function commerceRequest(path,method='GET',data){window.__calls.push({path,method,data});
if(path==='comercio'&&method==='GET')return options;
if(path==='comercio'&&method==='PATCH'){options={...options,...data};return options;}
if(path==='carritos-abandonados')return {opciones:options,permitido:false,correo:{envio_habilitado:false},carritos:[],historial:[]};
if(path==='cotizaciones'){if(window.__failQuote)throw Error('No pudimos guardar. Conserva los datos y reintenta.');return {recibida:true};}
if(path==='mis-talleres')return [{pedido:42,reserva:'00000000-0000-4000-8000-000000000001',grabacion:'private',titulo:'Grabación sintética',hasta:'2030-12-31T23:59:59Z'}];
throw Error(path);}`};
      });
    }}]});
  const css = fs.readdirSync(path.join(root, 'dist/assets')).filter(file => /^index-.*\.css$/.test(file)).map(file => fs.readFileSync(path.join(root, 'dist/assets', file), 'utf8')).join('\n');
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    for (const template of [1, 2, 3, 4]) for (const width of [375, 1280]) {
      const page = await browser.newPage({viewport: {width, height: 950}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        if (route.request().isNavigationRequest()) return route.fulfill({contentType: 'text/html', body: `<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></html>`});
        return route.abort();
      });
      await page.goto(`http://localhost:5173/plantilla/${template}/commerce-fixture`);
      if(template>=3){const category=page.locator('[data-visual-part="categoryItem"]');const label=category.locator('[data-visual-part="categoryLabel"]');const style=await label.evaluate(node=>{const value=getComputedStyle(node);return {position:value.position,color:value.color,background:value.backgroundImage};});assert.equal(style.position,'absolute');assert.equal(style.color,'rgb(255, 255, 255)');assert.match(style.background,/linear-gradient/);if(width>600)assert((await category.boundingBox()).width<300);}
      await page.getByRole('button', {name: 'Solicitar cotización por mayor', exact: true}).click();
      const form = page.locator('form');
      await form.getByLabel('Nombre', {exact: true}).fill('Comprador sintético');
      await form.getByLabel('Correo electrónico', {exact: true}).fill('cliente@example.com');
      await form.getByLabel('Cantidad solicitada').fill('25');
      await form.getByLabel('Empresa (opcional)').fill('Empresa QA');
      await form.getByLabel('Mensaje u observaciones').fill('Cotización sintética');
      await form.getByRole('checkbox').check();
      await page.evaluate(() => {window.__failQuote = true;});
      await form.getByRole('button', {name: 'Enviar cotización'}).click();
      await page.getByText('No pudimos guardar. Conserva los datos y reintenta.').waitFor();
      assert.equal(await form.getByLabel('Nombre', {exact: true}).inputValue(), 'Comprador sintético');
      await page.evaluate(() => {window.__failQuote = false;});
      await form.getByRole('button', {name: 'Enviar cotización'}).click();
      await page.getByText('Cotización guardada. La tienda podrá responderte por correo.').waitFor();
      const calls = await page.evaluate(() => window.__calls.filter(call => call.path === 'cotizaciones'));
      assert.equal(calls.length, 2);
      assert.equal(calls[0].data.solicitud_id, calls[1].data.solicitud_id);
      assert.equal(calls[1].data.cantidad, 25);
      assert.equal(calls[1].data.producto, 'a'.repeat(24));
      await page.getByRole('checkbox', {name: 'Solicitar factura', exact: true}).check();
      await page.getByLabel(/^RUT/).fill('12345678-9');
      await page.getByText('Ingresa un RUT válido con dígito verificador.').waitFor();
      await page.getByLabel(/^RUT/).fill('12.345.678-5');
      assert.equal(await page.getByText('Ingresa un RUT válido con dígito verificador.').count(), 0);
      await page.getByLabel(/^Razón social/).fill('Empresa sintética');
      await page.getByLabel(/^Giro/).fill('Comercio');
      await page.getByLabel(/^Dirección tributaria/).fill('Calle sintética 123');
      await page.getByLabel(/^Comuna/).fill('Santiago');
      await page.getByLabel(/^Correo para la factura/).fill('tributario@example.com');
      assert.equal(await page.evaluate(() => window.__invoice.rut), '12.345.678-5');
      assert.equal(await page.getByRole('checkbox', {name: 'Recordatorios de carrito abandonado', exact: true}).isDisabled(), true);
      await page.getByRole('checkbox', {name: 'Recibir cotizaciones por mayor en los productos', exact: true}).uncheck();
      await page.getByText('Configuración guardada.').waitFor();
      assert.equal(await page.evaluate(() => window.__calls.filter(call => call.method === 'PATCH').at(-1).data.cotizaciones), false);
      await page.getByRole('button', {name: 'Reproducir', exact: true}).click();
      const video = page.locator('video');
      assert.equal(await video.getAttribute('controlslist'), 'nodownload noremoteplayback');
      assert.equal(await video.getAttribute('crossorigin'), 'use-credentials');
      assert.match(await video.getAttribute('src'), /\/mis-talleres\/42\/.+\/video\/$/);
      assert.equal(await page.getByRole('link', {name: 'Mis talleres', exact: true}).getAttribute('href'), `/plantilla/${template}/mis-talleres`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`OK plantilla ${template}, ${width}px: cotización/reintento, factura/RUT, bloqueo de envíos y reproductor privado simulado`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
