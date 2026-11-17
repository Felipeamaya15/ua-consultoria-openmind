// Editor y exportador reales; identidad, catálogo y proveedor de Instagram sintéticos.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_S9_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'openmind-s9-marketing-'));
(async()=>{
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{createBrowserRouter,RouterProvider}from'react-router-dom';import Marketing from './src/features/marketing/pages/Marketing';
 createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'*',element:<Marketing/>}])}/>);`;
 const products=[{id:'000000000000000000000001',name:'Taza de cerámica artesanal',category:'Cerámica',description:'Una pieza hecha a mano.',active:true,
 images:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='],variants:[{sku:'TAZA-AZUL',price:12990,offerPrice:9990,stock:10,active:true,attributes:[]}]},
 {id:'000000000000000000000002',name:'Plato artesanal',category:'Cerámica',active:true,images:[],variants:[{sku:'PLATO',price:7990,offerPrice:null,stock:5,active:true,attributes:[]}]}];
 const bundle=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},jsx:'automatic',bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},plugins:[{name:'isolated-marketing',setup(b){
 b.onLoad({filter:/useMarketingOwner\.ts$/},()=>({loader:'js',contents:`const scope={apiBaseUrl:'http://qa.test',storeId:'1',userId:'1'};const isCurrent=()=>true;export const useMarketingOwner=()=>({scope,isCurrent,sessionKey:'qa'});`}));
 b.onLoad({filter:/useMarketingSources\.ts$/},()=>({loader:'js',contents:`const data={products:${JSON.stringify(products)},brand:{name:'Taller Nube',logo:null,palette:{primary:'#1a3a6b',secondary:'#eef1f8',onPrimary:'#fff',onSecondary:'#111'}},loading:false,productError:'',brandError:'',brandWarning:'',refresh(){}};export const useMarketingSources=()=>data;`}));
 b.onLoad({filter:/[\\/]AdminContext\.tsx$/},()=>({loader:'js',contents:`export const useAdmin=()=>({config:{template:'editorial'}});`}));
 b.onLoad({filter:/MarketingSections\.tsx$/},()=>({loader:'jsx',contents:`export const MarketingSections=({children})=><main style={{maxWidth:1200,margin:'auto',padding:16}}>{children}</main>;`}));
 b.onLoad({filter:/PublishedContentPicker\.tsx$/},()=>({loader:'js',contents:`export const PublishedContentPicker=()=>null;`}));
 b.onLoad({filter:/instagramService\.ts$/},()=>({loader:'js',contents:`export const INSTAGRAM_STATES={preparada:'Preparada: aún no publicada',publicada:'Publicación confirmada por Instagram'};let saved;
 export const instagramService={status:async()=>({conectado:!!window.qaConnected,usuario:window.qaConnected?'qa_store':'',oauth_configurado:!!window.qaConnected,publicacion_habilitada:!!window.qaConnected,publicacion_externa_permitida:!!window.qaConnected,media_https_configurada:!!window.qaConnected}),history:async()=>[],
 prepare:async(file,caption)=>{window.qaPrepared=(window.qaPrepared||0)+1;return saved={id:'qa',descripcion:caption,estado:'preparada'};},confirm:async()=>{window.qaConfirmed=(window.qaConfirmed||0)+1;return {...saved,estado:'publicada',media_id:'synthetic'};}};`}));
 }}]});
 const assets=path.join(root,'dist/assets'),css=fs.readdirSync(assets).filter(n=>/^(index-|Marketing-).*\.css$/.test(n)).map(n=>fs.readFileSync(path.join(assets,n),'utf8')).join('\n');
 const html=`<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({headless:true,channel:'msedge'});fs.mkdirSync(output,{recursive:true});
 for(const width of [360,768,1366]){
 const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.message)});page.on('dialog',d=>d.accept());
 await context.route('**/*',r=>{const u=new URL(r.request().url());return ['http:','https:'].includes(u.protocol)&&u.hostname!=='127.0.0.1'?r.abort():r.continue();});
 await page.goto(`http://127.0.0.1:${server.address().port}/emprendedor/marketing`);
 await page.getByLabel('Buscar producto',{exact:true}).fill('Taza');
 await page.getByRole('button',{name:/Taza de cerámica artesanal/}).click();
 await page.locator('.marketing-art').waitFor();
 await page.getByLabel('Nombre del borrador',{exact:true}).fill('Promoción QA');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await page.getByRole('button',{name:'Mis borradores',exact:true}).click({timeout:10000}).catch(async e=>{console.error((await page.locator('body').innerText()).slice(-3000));throw e});
 await page.getByRole('heading',{name:'Mis borradores',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Listado de borradores');
 await page.getByRole('button',{name:'Abrir Promoción QA',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar publicación (JPG)',exact:true}).click();
 const file=await download;await file.saveAs(path.join(output,`publication-${width}.jpg`));assert.ok(fs.statSync(path.join(output,`publication-${width}.jpg`)).size>200);
 await page.getByRole('button',{name:'Publicar en Instagram',exact:true}).click();
 const modal=page.getByRole('dialog');await modal.getByRole('heading',{name:'Completa tu publicación manualmente'}).waitFor();
 const fallback=page.waitForEvent('download');await modal.getByRole('button',{name:'Descargar imagen preparada',exact:true}).click();await fallback;
 assert.equal(await modal.getByRole('link',{name:'Abrir Instagram ↗',exact:true}).getAttribute('href'),'https://www.instagram.com/');
 assert.equal(await modal.getByRole('button',{name:'Preparar publicación',exact:true}).isDisabled(),true);
 await page.screenshot({path:path.join(output,`manual-${width}.png`),fullPage:true,animations:'disabled'});
 await modal.getByRole('button',{name:'Cerrar revisión',exact:true}).click();
 await page.evaluate(()=>window.qaConnected=true);
 await page.getByRole('button',{name:'Publicar en Instagram',exact:true}).click();
 await modal.getByRole('button',{name:'Preparar publicación',exact:true}).click();
 await modal.getByRole('button',{name:'Confirmar publicación en Instagram',exact:true}).click();
 await modal.getByText(/Publicación confirmada por Instagram/).waitFor();
 assert.deepEqual(await page.evaluate(()=>[window.qaPrepared,window.qaConfirmed]),[1,1]);
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(output,`authorized-${width}.png`),fullPage:true,animations:'disabled'});
 console.log(`PASS ${width}: búsqueda, borrador, descarga real JPG, alternativa manual e integración autorizada simulada`);await context.close();
 }console.log('OUTPUT '+output);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
