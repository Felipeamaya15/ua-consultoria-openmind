// Real React components and native dialogs; cart persistence/API are local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const esbuild = require('esbuild');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(require('node:os').tmpdir(),'openmind-dialog-captures'));
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
import{FeedbackProvider,useFeedback}from'./src/shared/components/FeedbackProvider';
import{AdminModal}from'./src/features/admin/components/ui/AdminModal';
function LifecycleChild(){const feedback=useFeedback();return <button onClick={()=>{feedback.confirm({title:'Solicitud pendiente QA',message:'Espera confirmación QA'}).then(value=>window.__qaClosed=value);feedback.confirm({title:'Duplicada QA',message:'Duplicada'}).then(value=>window.__qaDuplicate=value);}}>Abrir pendiente QA</button>}
function Lifecycle(){const[visible,setVisible]=React.useState(true);window.__qaUnmount=()=>setVisible(false);return visible?<LifecycleChild/>:null}
function Nested(){const[open,setOpen]=React.useState(false),feedback=useFeedback();return <><button onClick={()=>setOpen(true)}>Abrir editor QA</button><AdminModal open={open} onClose={()=>setOpen(false)} title="Editor QA"><button onClick={async()=>{if(await feedback.confirm({title:'Descartar edición QA',message:'¿Descartar?',confirmLabel:'Descartar cambios'}))setOpen(false);}}>Cerrar editor QA</button></AdminModal></>}
function Probe(){const feedback=useFeedback();return <><button onClick={async()=>{const values=await feedback.ask({title:'Solicitar anulación',message:'La tienda revisará la solicitud.',confirmLabel:'Solicitar anulación',fields:[{name:'motivo',label:'Motivo',multiline:true},{name:'referencia',label:'Referencia',required:false}]});window.__qaAnswer=values;}}>Abrir solicitud QA</button><button onClick={()=>feedback.notify('Cambio registrado QA','success')}>Aviso de éxito QA</button><button onClick={()=>feedback.notify('Fallo controlado QA','error')}>Aviso de error QA</button></>}
import{ActivityRequestForm}from'./src/features/landing/components/ActivityRequestForm';
import{resolveVisualConfig}from'./src/features/storefront/visual/resolveVisualConfig';
import{visualConfigToCssVariables}from'./src/features/storefront/visual/cssVariables';
window.__qaQueries=[];const template=['editorial','minimal','visual','catalog'][Number(location.pathname.split('/')[2])-1];
createRoot(document.getElementById('root')).render(<BrowserRouter><FeedbackProvider><main><div data-storefront-visual={template} style={visualConfigToCssVariables(resolveVisualConfig({template}))}><h1>Carrito QA</h1><Cart/><Probe/><Lifecycle/><Nested/><ActivityRequestForm sectionId="workshop" kind="consulta" label="Consultar taller QA"/></div></main></FeedbackProvider></BrowserRouter>);`;
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
  const css = fs.readdirSync(assets).filter(name => /^(index-|Cart-|activities-|activity-purchase-preview-).*\.css$/.test(name))
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
      page.on('dialog',async dialog=>{errors.push('Diálogo nativo: '+dialog.type());await dialog.dismiss();});
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/plantilla/${template}/carrito`);
      const remove = page.getByRole('button', {name: 'Eliminar Producto QA', exact: true});
      await remove.waitFor();
      await remove.click();
      const confirmation=page.getByRole('dialog',{name:'Eliminar producto',exact:true});
      await confirmation.waitFor();
      assert.equal(await confirmation.getAttribute('aria-modal'),'true');
      assert(await confirmation.getAttribute('aria-describedby'));
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Cancelar');
      for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await confirmation.evaluate(el=>el.contains(document.activeElement)));}
      for(let i=0;i<8;i++){await page.keyboard.press('Shift+Tab');assert(await confirmation.evaluate(el=>el.contains(document.activeElement)));}
      assert(await confirmation.evaluate(el=>{const sample=document.createElement('span');sample.style.fontFamily='var(--visual-body-font)';sample.style.backgroundColor='var(--visual-surface)';el.append(sample);const match=getComputedStyle(el).fontFamily===getComputedStyle(sample).fontFamily&&getComputedStyle(el).backgroundColor===getComputedStyle(sample).backgroundColor;sample.remove();return match;}));
      assert(await confirmation.evaluate(el=>el.getBoundingClientRect().width<=innerWidth-24));
      await page.keyboard.press('Escape');await confirmation.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>window.__qaCart.items.length),1);
      assert(await remove.evaluate(el=>el===document.activeElement));
      await remove.click();await confirmation.getByRole('button',{name:'Cerrar',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.__qaCart.items.length),1);
      await remove.click();await confirmation.getByRole('button',{name:'Cancelar',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.__qaCart.items.length),1);
      await remove.click();await page.mouse.click(2,2);await confirmation.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>window.__qaCart.items.length),1);
      await remove.click();
      await page.screenshot({path:path.join(output,'dialog-'+template+'-'+width+'.png'),fullPage:true});
      await confirmation.getByRole('button',{name:'Eliminar producto',exact:true}).click();
      await page.waitForFunction(()=>window.__qaCart.items.length===0);
      const removeActivity=page.getByRole('button',{name:'Eliminar Taller QA del carrito',exact:true});
      await removeActivity.click();
      const activityDialog=page.getByRole('dialog',{name:'Quitar taller o servicio',exact:true});
      await activityDialog.getByRole('button',{name:'Cancelar',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.__qaCart.activities.length),1);
      await page.getByRole('button',{name:'Quitar último participante y eliminar actividad',exact:true}).click();
      await activityDialog.getByRole('button',{name:'Quitar del carrito',exact:true}).click();
      await page.waitForFunction(()=>window.__qaCart.activities.length===0);
      await page.getByRole('button',{name:'Abrir solicitud QA',exact:true}).click();
      const question=page.getByRole('dialog',{name:'Solicitar anulación',exact:true});
      await question.getByRole('button',{name:'Solicitar anulación',exact:true}).click();
      assert.equal(await question.getByLabel('Motivo',{exact:true}).getAttribute('aria-invalid'),'true');
      assert(await question.getByLabel('Motivo',{exact:true}).evaluate(el=>el===document.activeElement));
      assert(await question.getByLabel('Motivo',{exact:true}).evaluate(el=>Boolean(document.getElementById(el.getAttribute('aria-describedby')))));
      await question.getByLabel('Motivo',{exact:true}).fill('  Motivo sintético QA  ');
      await question.getByRole('button',{name:'Solicitar anulación',exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>window.__qaAnswer),{motivo:'Motivo sintético QA',referencia:''});
      await page.getByRole('button',{name:'Abrir solicitud QA',exact:true}).click();await page.keyboard.press('Escape');
      await page.waitForFunction(()=>window.__qaAnswer===null);
      await page.getByRole('button',{name:'Aviso de éxito QA',exact:true}).click();
      await page.getByRole('status').filter({hasText:'Cambio registrado QA'}).waitFor();
      await page.getByRole('button',{name:'Aviso de error QA',exact:true}).click();
      const toast=page.getByRole('alert').filter({hasText:'Fallo controlado QA'});await toast.waitFor();
      await toast.getByRole('button',{name:'Cerrar',exact:true}).click();await toast.waitFor({state:'detached'});
      await page.getByRole('button',{name:'Abrir editor QA',exact:true}).click();
      const editor=page.getByRole('dialog',{name:'Editor QA',exact:true});
      await editor.getByRole('button',{name:'Cerrar editor QA',exact:true}).click();
      const nested=page.getByRole('dialog',{name:'Descartar edición QA',exact:true});
      await nested.getByRole('button',{name:'Cancelar',exact:true}).click();
      assert(await editor.isVisible());
      assert(await editor.getByRole('button',{name:'Cerrar editor QA',exact:true}).evaluate(el=>el===document.activeElement));
      await editor.getByRole('button',{name:'Cerrar editor QA',exact:true}).click();
      await nested.getByRole('button',{name:'Descartar cambios',exact:true}).click();await editor.waitFor({state:'hidden'});
      await page.getByRole('button',{name:'Abrir pendiente QA',exact:true}).click();
      await page.getByRole('dialog',{name:'Solicitud pendiente QA',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.__qaDuplicate),false);
      await page.evaluate(()=>window.__qaUnmount());
      await page.waitForFunction(()=>window.__qaClosed===false);
      assert.equal(await page.locator('dialog[open]').count(),0);
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
      console.log(`OK plantilla ${template}, ${width}px: modal, teclado, foco, cancelación, campos, toast, carrito mixto y segunda consulta`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
