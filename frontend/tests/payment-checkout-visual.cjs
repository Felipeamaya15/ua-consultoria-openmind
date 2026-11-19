
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
 const bundle=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},jsx:'automatic',bundle:true,write:false,format:'iife',loader:{'.css':'empty'},
 define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"VITE_API_URL":"https://checkout-api.test"}'},plugins:[{name:'checkout-fixture',setup(build){
  build.onLoad({filter:/node_modules[\\/]@react-oauth[\\/]google[\\/]/},()=>({loader:'js',contents:'export const useGoogleLogin=()=>()=>{};'}));
  build.onLoad({filter:/CartContext\.tsx$/},()=>({loader:'js',contents:`import{useState}from'react';export function useCart(){const[shippingMethod,setShippingMethod]=useState('Chilexpress');return{activities:[],items:[{productId:'qa',variantId:'qa',name:'Producto de prueba',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',attributes:{},quantity:1,price:60000}],subtotal:60000,discount:0,promoCode:'',clearCart(){},shippingMethod,setShippingMethod}}` }));
  build.onLoad({filter:/StoreIdentityContext\.tsx$/},()=>({loader:'js',contents:'export const useStoreIdentity=()=>({identity:null});'}));
  build.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'js',contents:`export const API_BASE_URL='https://checkout-api.test';`}));
  build.onLoad({filter:/visual[\\/]pages\.ts$/},args=>({loader:'ts',contents:fs.readFileSync(args.path,'utf8').replace(/(export function checkoutPreviewStep\([^\n]+\{)/,'$1 return "payment";')}));
 }}]});
 const assets=path.join(root,'dist/assets'),css=fs.readdirSync(assets).filter(n=>/^(index-|Checkout-).*\.css$/.test(n)).map(n=>fs.readFileSync(path.join(assets,n),'utf8')).join('\n');
 const html=`<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 const output=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'checkout-payments-'));fs.mkdirSync(output,{recursive:true});
 try{browser=await chromium.launch({headless:true,channel:'msedge'});
 for(const template of [1,2,3,4])for(const width of [375,768,1280]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let enabled=true;
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://checkout-api.test/**',route=>{
   const url=new URL(route.request().url());assert.equal(route.request().method(),'GET');
   let data;if(url.pathname==='/api/entregas/alternativas/')data={pickup:{...pickup,enabled},chilexpress:{enabled:true,accountId:'',apiKey:'',status:'not_configured'},starken:{enabled:true,accountId:'',apiKey:'',status:'not_configured'}};
   else if(url.pathname==='/api/pagos/activos/')data={transbank:{enabled:true},mercadopago:{enabled:true},paypal:{enabled:true,fx:{tipo_cambio:'950',fecha_dato:'2026-11-17',margen_pct:'2',fuente:'QA'}},linkify:{enabled:true},tuu:{enabled:true},transfer:{enabled:true,fields:{bank_name:'Banco QA',account_type:'Corriente',account_number:'123456',holder_rut:'11111111-1',holder_name:'QA',confirmation_email:'qa@example.test'}}};else throw Error('Endpoint inesperado: '+url.pathname);
   return route.fulfill({json:{exito:true,data},headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/plantilla/${template}/compra`);
  for (const name of ['Webpay / Transbank','Mercado Pago','PayPal','Linkify','TUU','Transferencia bancaria']) {
   const radio=page.getByRole('radio',{name,exact:true});await radio.waitFor({timeout:10000}).catch(async e=>{console.error(errors,await page.locator('body').innerText());throw e});await radio.focus();await radio.press("Space");assert.equal(await radio.isChecked(),true);
   assert.equal(await page.getByLabel('N\u00famero de tarjeta',{exact:true}).count(),0);
   assert.equal(await page.getByText(/CLIENTE DEMO|demo@example.com|Demostraci\u00f3n sin conexi\u00f3n/).count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${template}/${width}/${name}`);
   await page.screenshot({path:path.join(output,`payments-${template}-${width}-${name.replaceAll(/[^a-z]/gi,'')}.png`),fullPage:true,animations:'disabled'});
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`OK plantilla ${template}, ${width}px: seis medios de pago, teclado, sin datos ficticios ni desbordamiento`);
 }
 console.log(`Capturas: ${output}`);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
