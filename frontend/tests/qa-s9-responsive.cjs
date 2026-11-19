
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.QA_S9_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'openmind-s9-responsive-'));
(async()=>{
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
 import Cart from './src/features/storefront/pages/Cart';
 import {CatalogHeader} from './src/features/storefront/components/store/catalog/CatalogHeader';
 import {VisualHeader} from './src/features/storefront/components/store/visual/VisualHeader';
 import {MinimalHeader} from './src/features/storefront/components/store/minimal/MinimalHeader';
 import {EditorialLayout} from './src/features/storefront/components/store/EditorialLayout';
 import {Tabs} from './src/features/admin/components/ui';
 import{resolveVisualConfig}from './src/features/storefront/visual/resolveVisualConfig';
 import{visualConfigToCssVariables}from './src/features/storefront/visual/cssVariables';
 const id=Number(location.pathname.split('/')[2]),template=['editorial','minimal','visual','catalog'][id-1];
 const Header=id===4?CatalogHeader:id===3?VisualHeader:id===2?MinimalHeader:EditorialLayout;
 function App(){const[tab,setTab]=React.useState('consulta');return <BrowserRouter><div className={'template-'+template} data-storefront-visual={template} style={visualConfigToCssVariables(resolveVisualConfig({template}))}>
 <Header/><main className="ua-store-page"><Cart/></main></div><div style={{padding:16,maxWidth:700,margin:'auto'}}><Tabs wrap label="Solicitudes de actividades" tabs={[{id:'consulta',label:'Solicitudes de información'},{id:'inscripcion',label:'Inscripciones a talleres'}]} active={tab} onChange={setTab}/></div></BrowserRouter>}
 createRoot(document.getElementById('root')).render(<App/>);`;
 const bundle=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},jsx:'automatic',bundle:true,write:false,format:'iife',loader:{'.css':'empty'},
 define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},plugins:[{name:'isolated-qa',setup(b){
 b.onLoad({filter:/EditorialLayout\.tsx$/},args=>{
  const source=fs.readFileSync(args.path,'utf8').replaceAll('\r\n','\n'),header=source.indexOf('<header data-visual-section'),end=source.indexOf('</header>',header)+9;
  const start=source.indexOf('  return (\n    <StoreVisualRoot',source.indexOf('export function EditorialLayout'));
  assert.ok(start>0&&header>start&&end>header);
  return {loader:'tsx',contents:source.slice(0,start)+'return ('+source.slice(header,end)+');\n}'};
 });
 b.onLoad({filter:/[\\/]authService\.ts$/},()=>({loader:'js',contents:`export const authService={getMe:async()=>({data:null}),logout(){},getToken:()=>null};`}));
 b.onLoad({filter:/CartContext\.tsx$/},()=>({loader:'js',contents:`export function useCart(){return {items:[{productId:'qa',variantId:'qa',sku:'TAZ-AZUL',name:'Taza de cerámica artesanal de colección con nombre largo',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="tan"/></svg>',attributes:{Color:'Azul'},quantity:3,price:9990,maxStock:10}],activities:[],count:3,subtotal:29970,discount:0,total:29970,shipping:null,promoCode:'',promoNotice:'',removeItem(){},updateQuantity(){},applyPromo(){}}}`}));
 b.onLoad({filter:/[\\/]StoreContext\.tsx$/},()=>({loader:'js',contents:`export const useStore=()=>({config:{name:'Taller Nube Artesanal y Cerámica',logo:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="90" height="40"><rect width="90" height="40" fill="orange"/></svg>'}});`}));
 b.onLoad({filter:/[\\/]AccountNavigation\.tsx$/},()=>({loader:'jsx',contents:`export const useStorefrontIdentity=()=>({user:null});export const notifyStorefrontAuthChange=()=>{};export const AccountNavigation=({className})=><a className={className} href="/ingresar">Iniciar sesión</a>;`}));
 b.onLoad({filter:/[\\/]useStorefrontTemplate\.ts$/},()=>({loader:'js',contents:`export function useStorefrontTemplate(){const id=Number(location.pathname.split('/')[2]);return {route:p=>'/plantilla/'+id+'/'+(p||''),isMinimal:id===2,isVisual:id===3,isCatalog:id===4}}`}));
 }}]});
 const assets=path.join(root,'dist/assets'),css=fs.readdirSync(assets).filter(n=>/^index-.*\.css$/.test(n)).map(n=>fs.readFileSync(path.join(assets,n),'utf8')).join('\n');
 const html=`<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
 const server=http.createServer((req,res)=>{if(req.url==='/logo-universidad-autonoma.png'){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(path.join(root,'public/logo-universidad-autonoma.png')));}res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
 try{browser=await chromium.launch({channel:'msedge',headless:true});fs.mkdirSync(output,{recursive:true});
 for(const template of [1,2,3,4])for(const [width,height]of [[360,800],[390,844],[768,1024],[1366,768]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/plantilla/${template}/carrito`);
 await page.getByRole('heading',{name:/carrito/i}).first().waitFor();
 const checks=await page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const logo=document.querySelector('[data-visual-part="logo"]'),name=logo?.querySelector('span'),nav=document.querySelector('[data-visual-part="headerLayout"]');
  const navigation=document.querySelector('[data-visual-part="navigation"]');
  const nr=name?.getBoundingClientRect(),vr=navigation?.getBoundingClientRect();
  return {overlap:!!(nr&&vr&&vr.width&&nr.right>vr.left&&nr.left<vr.right&&nr.bottom>vr.top&&nr.top<vr.bottom),overflow:document.documentElement.scrollWidth>innerWidth,logo:logo&&rect(logo),name:name&&rect(name),nav:nav&&rect(nav),nameClipped:name&&name.scrollWidth>name.clientWidth,
   prices:[...document.querySelectorAll('[data-page-price]')].map(e=>({text:e.textContent,overflow:e.scrollWidth>e.clientWidth,whiteSpace:getComputedStyle(e).whiteSpace})),
   tabs:[...document.querySelectorAll('[role="tab"]')].map(e=>({text:e.textContent,...rect(e)}))};
 });
 await page.screenshot({path:path.join(output,`${template}-${width}.png`),fullPage:true,animations:'disabled'});
 const record={template,width,...checks,errors};results.push(record);console.log(JSON.stringify(record));
 await page.close();
 }
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('OUTPUT '+output);
 assert.ok(results.every(r=>!r.overlap&&!r.overflow&&!r.nameClipped&&!r.errors.length),'Sin superposición, desbordamiento, cortes ni errores JS');
 assert.ok(results.every(r=>r.prices.every(p=>!p.overflow&&p.whiteSpace==='nowrap')),'Precios completos en una línea');
 assert.ok(results.every(r=>r.tabs.every(t=>t.x>=0&&t.right<=r.width)),'Pestañas visibles sin corte');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
