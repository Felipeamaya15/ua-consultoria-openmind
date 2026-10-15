// Componentes reales con APIs aisladas. No crea pedidos ni consulta proveedores externos.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const hours=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,{enabled:['mon','tue','fri'].includes(day),start:'09:30',end:'18:30'}]));
const pickup={enabled:true,address:'Calle de prueba 42, Providencia',schedule:'Horario de prueba',version:2,
  location:{region:'Metropolitana de Santiago',comuna:'Providencia',street:'Calle de prueba',number:'42',reference:'Local A'},hours};
(async()=>{
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
 import Checkout from './src/features/storefront/pages/Checkout';
 import{resolveVisualConfig}from './src/features/storefront/visual/resolveVisualConfig';
 import{visualConfigToCssVariables}from './src/features/storefront/visual/cssVariables';
 const template=['editorial','minimal','visual','catalog'][Number(location.pathname.split('/')[2])-1];
 createRoot(document.getElementById('root')).render(<BrowserRouter><div data-storefront-visual={template} style={visualConfigToCssVariables(resolveVisualConfig({template}))}><Checkout/></div></BrowserRouter>);`;
 const bundle=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},jsx:'automatic',bundle:true,write:false,format:'iife',
 define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"VITE_API_URL":"https://checkout-api.test"}'},plugins:[{name:'checkout-fixture',setup(build){
  build.onLoad({filter:/CartContext\.tsx$/},()=>({loader:'js',contents:`import{useState}from'react';export function useCart(){const[shippingMethod,setShippingMethod]=useState('Chilexpress');return{items:[{productId:'qa',variantId:'qa',name:'Producto de prueba',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',attributes:{},quantity:1,price:60000}],subtotal:60000,discount:0,promoCode:'',clearCart(){},shippingMethod,setShippingMethod}}` }));
  build.onLoad({filter:/StoreIdentityContext\.tsx$/},()=>({loader:'js',contents:'export const useStoreIdentity=()=>({identity:null});'}));
  build.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'js',contents:`export const API_BASE_URL='https://checkout-api.test';`}));
  build.onLoad({filter:/visual[\\/]pages\.ts$/},args=>({loader:'ts',contents:fs.readFileSync(args.path,'utf8').replace(/(export function checkoutPreviewStep\([^\n]+\{)/,'$1 return "delivery";')}));
 }}]});
 const assets=path.join(root,'dist/assets'),css=fs.readFileSync(path.join(assets,fs.readdirSync(assets).find(n=>/^index-.*\.css$/.test(n))),'utf8');
 const html=`<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 const output=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'checkout-pickup-'));fs.mkdirSync(output,{recursive:true});
 try{browser=await chromium.launch({headless:true,channel:'msedge'});
 for(const template of [1,2,3,4])for(const width of [375,768,1280]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let enabled=true;
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://checkout-api.test/**',route=>{
   const url=new URL(route.request().url());assert.equal(route.request().method(),'GET');
   let data;if(url.pathname==='/api/entregas/alternativas/')data={pickup:{...pickup,enabled},chilexpress:{enabled:true,accountId:'',apiKey:'',status:'not_configured'},starken:{enabled:true,accountId:'',apiKey:'',status:'not_configured'}};
   else if(url.pathname==='/api/pagos/activos/')data={};else throw Error('Endpoint inesperado: '+url.pathname);
   return route.fulfill({json:{exito:true,data},headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/plantilla/${template}/compra`);
  const button=page.getByRole('button',{name:'Ver dirección y horarios',exact:true});await button.waitFor();
  const radio=page.getByRole('radio',{name:'Retiro en tienda',exact:true});
  await page.locator('label').filter({has:page.getByRole('radio',{name:'Chilexpress',exact:true})}).click();
  assert.equal(await page.getByRole('radio',{name:'Chilexpress',exact:true}).isChecked(),true);
  assert.equal(await button.getAttribute('aria-expanded'),'false');assert.equal(await page.getByRole('region',{name:'Dirección y horarios de retiro'}).count(),0);
  const summary=page.locator('aside');const totalBefore=await summary.textContent();
  await button.focus();await button.press('Enter');
  const details=page.getByRole('region',{name:'Dirección y horarios de retiro'});await details.waitFor();
  for(const text of ['Calle de prueba 42','Providencia, Metropolitana de Santiago','Lunes, Martes, Viernes','09:30 a 18:30'])assert.ok((await details.textContent()).includes(text));
  assert.equal(await radio.isChecked(),false);assert.equal(await summary.textContent(),totalBefore);
  assert.equal(await details.locator('a').count(),0);
  await page.getByRole('button',{name:'Ocultar dirección y horarios',exact:true}).press('Space');assert.equal(await details.count(),0);
  await radio.focus();await radio.press('Space');assert.equal(await radio.isChecked(),true);assert.ok((await summary.textContent()).includes('Gratis ($0)'));
  const pickupTotal=await summary.textContent();await button.click();assert.equal(await radio.isChecked(),true);assert.equal(await summary.textContent(),pickupTotal);
  assert.equal(await page.getByRole('radio',{name:'Starken',exact:true}).count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`sin desbordamiento ${template}/${width}`);
  await page.screenshot({path:path.join(output,`checkout-pickup-${template}-${width}.png`),fullPage:true});
  enabled=false;await page.reload();await page.getByRole('radio',{name:'Chilexpress',exact:true}).waitFor();assert.equal(await radio.count(),0);assert.equal(await button.count(),0);
  assert.deepEqual(errors,[]);await page.close();console.log(`OK plantilla ${template}, ${width}px: desplegable, teclado, costo, selección, dirección, horarios, deshabilitado y transportistas`);
 }
 console.log(`Capturas: ${output}`);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
