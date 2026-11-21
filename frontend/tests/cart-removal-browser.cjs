// Real React components and native dialogs; cart persistence/API are local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const esbuild = require('esbuild');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, '../backend/.pytest_cache/commerce-qa/cart-captures'));
const stateSource = `
import {useSyncExternalStore} from 'react';
let state={items:[{productId:'physical',variantId:'sku',sku:'SKU',name:'Producto QA',image:'',attributes:{},quantity:1,price:5000,maxStock:5}],activities:[{sectionId:'workshop',title:'Taller QA',quantity:1,price:15000,version:'${'a'.repeat(64)}',start:'2037-12-12T15:00:00Z',zone:'America/Santiago'}]};
const listeners=new Set(); const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
function update(next){state=next;window.__qaCart=state;listeners.forEach(fn=>fn());} window.__qaCart=state;
export function useCart(){useSyncExternalStore(subscribe,()=>state);const subtotal=state.items.reduce((s,i)=>s+i.price*i.quantity,0)+state.activities.reduce((s,i)=>s+i.price*i.quantity,0);return{...state,subtotal,total:subtotal,discount:0,shipping:0,promoCode:'',count:state.items.length+state.activities.length,loading:false,applyPromo:async()=>({ok:false,message:'QA'}),removeItem:(id,sku)=>update({...state,items:state.items.filter(i=>i.productId!==id||i.variantId!==sku)}),updateQuantity:(id,sku,q)=>update({...state,items:state.items.map(i=>i.productId===id&&i.variantId===sku?{...i,quantity:q}:i)})};}
export function useActivityCart(){useSyncExternalStore(subscribe,()=>state);return{items:state.activities,put(){},remove:id=>update({...state,activities:state.activities.filter(i=>i.sectionId!==id)}),reduce:id=>update({...state,activities:state.activities.map(i=>i.sectionId===id?{...i,quantity:i.quantity-1}:i)})};}`;

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import Cart from './src/features/storefront/pages/Cart';
import{ActivityRequestForm}from'./src/features/landing/components/ActivityRequestForm';
import{resolveVisualConfig}from'./src/features/storefront/visual/resolveVisualConfig';
import{visualConfigToCssVariables}from'./src/features/storefront/visual/cssVariables';
window.__qaQueries=[];const template=['editorial','minimal','visual','catalog'][Number(location.pathname.split('/')[2])-1];
createRoot(document.getElementById('root')).render(<BrowserRouter><div data-storefront-visual={template} style={visualConfigToCssVariables(resolveVisualConfig({template}))}><Cart/><ActivityRequestForm sectionId="workshop" kind="consulta" label="Consultar taller QA"/></div></BrowserRouter>);`;
  const bundle = await esbuild.build({stdin: {contents: entry, loader: 'tsx', resolveDir: root},
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: {'.css': 'empty'},
    define: {'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}'},
    plugins: [{name: 'isolated-cart', setup(build) {
      build.onResolve({filter: /(?:CartContext|context\/activityCart)$/}, () => ({path: 'qa-state', namespace: 'qa'}));
      build.onLoad({filter: /.*/, namespace: 'qa'}, () => ({contents: stateSource, loader: 'js', resolveDir: root}));
      build.onLoad({filter: /paidActivityService\.ts$/}, () => ({loader: 'js', contents: `export const fetchPaidQuote=async()=>({tipo:'taller',estado:'disponible',version:'${'a'.repeat(64)}',cupos_disponibles:5});export const canSelectPaidQuote=()=>true;export const formatActivityDate=()=> '12/12/2037';export const paidStatusLabel={};`}));
      build.onLoad({filter: /[\\/]activityService\.ts$/}, () => ({loader: 'js', contents: 'export const submitActivity=async(section,kind,data)=>window.__qaQueries.push({section,kind,data});'}));
    }}]});
  const assets = path.join(root, 'dist/assets');
  const css = fs.readdirSync(assets).filter(name => /^(index-|activities-|activity-purchase-preview-).*\.css$/.test(name))
    .map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/fixture.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : `<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({channel: 'msedge', headless: true});
    for (const template of [1, 2, 3, 4]) for (const width of [375, 1280]) {
      const page = await browser.newPage({viewport: {width, height: 950}}), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/plantilla/${template}/carrito`);
      const remove = page.getByRole('button', {name: 'Eliminar Producto QA', exact: true});
      await remove.waitFor();
      page.once('dialog', dialog => dialog.dismiss()); await remove.click();
      assert.equal(await page.evaluate(() => window.__qaCart.items.length), 1);
      page.once('dialog', dialog => dialog.accept()); await remove.click();
      await page.waitForFunction(() => window.__qaCart.items.length === 0);
      const removeActivity = page.getByRole('button', {name: 'Eliminar Taller QA del carrito', exact: true});
      page.once('dialog', dialog => dialog.dismiss()); await removeActivity.click();
      assert.equal(await page.evaluate(() => window.__qaCart.activities.length), 1);
      await page.screenshot({path: path.join(output, `cart-${template}-${width}.png`), fullPage: true});
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', {name: 'Quitar último participante y eliminar actividad', exact: true}).click();
      await page.waitForFunction(() => window.__qaCart.activities.length === 0);
      for (const message of ['Primera consulta', 'Segunda consulta diferente']) {
        await page.getByRole('button', {name: 'Consultar taller QA', exact: true}).click();
        const dialog = page.getByRole('dialog', {name: 'Solicitar información'});
        await dialog.getByLabel('Nombre', {exact: true}).fill('Cliente QA');
        await dialog.getByLabel('Correo electrónico', {exact: true}).fill('qa@example.test');
        await dialog.getByLabel('Tu consulta', {exact: true}).fill(message);
        await dialog.getByRole('checkbox').check();
        await dialog.getByRole('button', {name: 'Enviar consulta', exact: true}).click();
        await dialog.getByRole('heading', {name: 'Recibimos tus datos'}).waitFor();
        await dialog.getByRole('button', {name: 'Cerrar', exact: true}).last().click();
      }
      const ids = await page.evaluate(() => window.__qaQueries.map(item => item.data.solicitud_id));
      assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      console.log(`OK plantilla ${template}, ${width}px: cancelación, eliminación, última unidad y segunda consulta`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
