const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const esbuild=require('esbuild'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(os.tmpdir(),'openmind-manual-corrections-'));
const activity='11111111-1111-4111-8111-111111111111',version='a'.repeat(64),productId='000000000000000000000001';
const quote={seccion_id:activity,tipo:'taller',titulo:'Taller sintético QA',estado:'disponible',precio:15000,moneda:'CLP',inicio:'2037-12-12T15:00:00Z',cierre:'2037-12-11T15:00:00Z',hora_servidor:'2026-11-22T12:00:00Z',zona_horaria:'America/Santiago',cupos_disponibles:8,version,termino:'2037-12-12T17:00:00Z',venta:{cierre_minutos:60,tolerancia_minutos:0,cancelacion:'anticipada',cancelacion_horas:24},condiciones:[],requisitos:[],modalidad:[],ubicacion:[],compra_habilitada:true};
const activityRow=quantity=>({sectionId:activity,title:quote.titulo,quantity,price:15000,version,start:quote.inicio,zone:quote.zona_horaria});
const productRow=(quantity,sku='QA-AZUL')=>({id_item_carrito:sku==='QA-AZUL'?1:2,id_producto:1,producto_mongo_id:productId,slug:'producto-qa',nombre_producto:'Producto sintético QA',cantidad:quantity,sku,precio_unitario:sku==='QA-AZUL'?5000:8000,stock_disponible:sku==='QA-AZUL'?5:3,atributos:{Color:sku==='QA-AZUL'?'Azul':'Rojo'},imagen:''});
let state,bundle='';
const cases=[{name:'solo productos',products:2,activities:0},{name:'correo y contraseña',products:2,activities:2,password:true},{name:'solo talleres',products:0,activities:2},{name:'carrito mixto',products:2,activities:2},{name:'carrito previo y variantes',products:2,activities:2,prior:true,variant:true},{name:'cancelación',products:2,activities:2,cancel:true},{name:'fallo de Google',products:2,activities:2,fail:true},{name:'límites de stock y cupos',products:3,activities:3,limited:true}];
function reset(test={}){state={test,products:test.prior?[productRow(1)]:test.limited?[productRow(4)]:[],activities:test.prior?[activityRow(1)]:test.limited?[activityRow(7)]:[],mutations:[],forbidden:[],auth:0};}

(async()=>{
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Access-Control-Allow-Origin',site);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status<400?{exito:true,data}:{exito:false,mensaje:'Fallo sintético de autenticación'}));};
    if(url.pathname==='/qa-google'){res.setHeader('Content-Type','text/html');res.end(`<html lang="es"><meta charset="utf-8"><button onclick="opener.postMessage({qaGoogle:true},location.origin);close()">Cuenta sintética Google QA</button><button onclick="opener.postMessage({qaGoogle:true,cancel:true},location.origin);close()">Cancelar autenticación</button></html>`);return;}
    if(url.pathname.startsWith('/api/')){
      let body={};for await(const chunk of req){body._raw=(body._raw||'')+chunk;}if(body._raw)body=JSON.parse(body._raw);
      const user={id:1,username:'qa',first_name:'Cliente',last_name:'Sintético',email:'qa@example.com',is_staff:false,is_superuser:false,is_store_owner:false};
      if(url.pathname==='/api/auth/google/'||url.pathname==='/api/auth/login/'){state.auth++;if(state.test.fail)return send(null,401);return send({token:'synthetic-customer-token',user});}
      if(url.pathname==='/api/auth/me/')return send(user);
      if(url.pathname==='/api/auth/captcha/')return send({captcha_token:'synthetic-captcha',captcha_image:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="190" height="56"><text x="12" y="36">QA123</text></svg>')});
      if(url.pathname.includes('disponibilidad'))return send(quote);
      if(url.pathname.startsWith('/api/catalog/productos/')){
        const item={id:productId,slug:'producto-qa',nombre:'Producto sintético QA',descripcion:'Producto de prueba',categoria:'QA',imagen:null,imagenes:[],precio:5000,precio_oferta:null,disponible:true,variantes:[{sku:'QA-AZUL',precio:5000,precio_oferta:null,stock:5,activo:true,atributos_variante:[{clave:'color',etiqueta:'Color',valor:'Azul'}]},{sku:'QA-ROJO',precio:8000,precio_oferta:null,stock:3,activo:true,atributos_variante:[{clave:'color',etiqueta:'Color',valor:'Rojo'}]}]};
        return send(url.pathname==='/api/catalog/productos/'?[item]:item);
      }
      if(url.pathname.startsWith('/api/catalog/carrito/items/')){
        if(req.headers['x-tienda-id'])assert.equal(req.headers['x-tienda-id'],'1');
        if(req.method==='GET')return send(state.products);
        state.mutations.push([req.method,url.pathname,body]);
        if(req.method==='POST'){assert(!state.products.some(item=>item.sku===body.sku),'No se agrega de nuevo una variante existente');const row=productRow(body.cantidad,body.sku);state.products.push(row);return send(row);}
        const id=Number(url.pathname.split('/').filter(Boolean).at(-1)),row=state.products.find(item=>item.id_item_carrito===id);
        if(req.method==='PATCH'){row.cantidad=body.cantidad;return send(row);}
        if(req.method==='DELETE'){state.products=state.products.filter(item=>item!==row);return send({});}
      }
      if(url.pathname.startsWith('/api/landing/carrito-actividades/')){
        if(req.method==='GET')return send({items:state.activities});
        state.mutations.push([req.method,url.pathname,body]);
        if(req.method==='PUT'){assert(body.cantidad<=quote.cupos_disponibles);const row=activityRow(body.cantidad);state.activities=[row];return send(row);}
        if(req.method==='DELETE'){state.activities=[];return send({items:[]});}
      }
      if(url.pathname.includes('recordatorio-carrito'))return send({});
      if(req.method!=='GET'){state.forbidden.push([req.method,url.pathname]);return send(null,400);}
      return send({transfer:{enabled:true,fields:{bank_name:'Banco QA',account_type:'Corriente',account_number:'123',holder_name:'Sintético QA',holder_rut:'12.345.678-5',confirmation_email:'qa@example.com',instructions:''}},paypal:{enabled:false},transbank:{enabled:false}});
    }
    res.setHeader('Content-Type',url.pathname==='/fixture.js'?'application/javascript':'text/html');
    if(url.pathname==='/fixture.js'){res.end(bundle);return;}
    const css=fs.readdirSync(path.join(root,'dist/assets')).filter(name=>/^(index-|Cart-|activities-|activity-purchase-preview-|Marketing-).*\.css$/.test(name)).map(name=>fs.readFileSync(path.join(root,'dist/assets',name),'utf8')).join('\n');
    res.end(`<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,site=`http://localhost:${server.address().port}`;
  const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route,Link}from'react-router-dom';
import{authService}from'./src/features/auth/services/authService';import{AccountNavigation}from'./src/features/storefront/components/store/AccountNavigation';import{FeedbackProvider}from'./src/shared/components/FeedbackProvider';import{CartProvider,useCart}from'./src/features/storefront/context/CartContext';import{useActivityCart}from'./src/features/storefront/context/activityCart';import{fetchPaidQuote}from'./src/features/landing/services/paidActivityService';import Cart from'./src/features/storefront/pages/Cart';import Checkout from'./src/features/storefront/pages/Checkout';import Login from'./src/features/storefront/pages/Login';import{CookieConsentBanner}from'./src/features/storefront/components/store/CookieConsentBanner';import{MinimalLayout}from'./src/features/storefront/components/store/minimal/MinimalLayout';import{useStore}from'./src/features/storefront/context/StoreContext';import{visualConfigToCssVariables}from'./src/features/storefront/visual/cssVariables';
function Controls(){const cart=useCart(),activities=useActivityCart();window.__cart={items:cart.items,activities:cart.activities,subtotal:cart.subtotal,count:cart.count,loading:cart.loading,error:cart.syncError};const add=sku=>cart.addItem({productId:'producto-qa',variantId:sku,sku,name:'Producto sintético QA',quantity:1,price:sku==='QA-AZUL'?5000:8000,maxStock:sku==='QA-AZUL'?5:3,image:'',attributes:{Color:sku==='QA-AZUL'?'Azul':'Rojo'}});return <><button onClick={()=>add('QA-AZUL')}>Agregar producto QA</button><button onClick={()=>add('QA-ROJO')}>Agregar variante QA</button><button onClick={async()=>{const q=await fetchPaidQuote('${activity}');await activities.put('${activity}',q,activities.items[0]?.quantity+1||1,q.version);}}>Agregar taller QA</button><button onClick={()=>window.dispatchEvent(new Event('openmind_open_cookie_banner'))}>Preferencias QA</button><button onClick={()=>authService.setSession('synthetic-customer-token',{id:1,is_staff:false,is_store_owner:false})}>Entrar QA para privacidad</button></>}
function Fixture(){const{visualConfig}=useStore();return <FeedbackProvider><CartProvider><div data-storefront-visual style={visualConfigToCssVariables(visualConfig)}><Controls/><AccountNavigation/><Routes><Route path="/plantilla/:n/carrito" element={<Cart/>}/><Route path="/plantilla/:n/compra" element={<Checkout/>}/><Route path="/plantilla/:n/ingresar" element={<Login/>}/><Route path="/plantilla/:n/cookies" element={<><h1>Cookies QA</h1><CookieConsentBanner/></>}/><Route path="/plantilla/2/mobile" element={<MinimalLayout/>}><Route index element={<div style={{height:2500}}>Contenido de la tienda QA</div>}/></Route><Route path="*" element={<Cart/>}/></Routes></div></CartProvider></FeedbackProvider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);`;
  const built=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({VITE_API_URL:base,VITE_GOOGLE_CLIENT_ID:'synthetic-client'})},plugins:[{name:'qa-boundaries',setup(build){
    build.onLoad({filter:/StoreIdentityContext\.tsx$/},()=>({loader:'js',contents:`const identity={apiBaseUrl:'${base}',storeId:'1'};export const useStoreIdentity=()=>({identity,loading:false,error:''});`}));
    build.onLoad({filter:/[\\/]StoreContext\.tsx$/},()=>({loader:'js',resolveDir:path.join(root,'src/features/storefront/context'),contents:`import{resolveVisualConfig}from'../visual/resolveVisualConfig';import{defaultLegalPages}from'../data/legalContent';import{getStoreConfigKey}from'../visual/storage';const templates=['editorial','minimal','visual','catalog'];export const useStore=()=>{const template=templates[Number(location.pathname.split('/')[2])-1]||'minimal';return{config:{name:'Tienda sintética QA',template,gaId:'G-QATEST1234',pixelId:'123456789012345'},visualConfig:resolveVisualConfig({template}),legalPages:defaultLegalPages,legalLoading:false,legalError:'',legalVerified:true,legalScopeKey:getStoreConfigKey({apiBaseUrl:'${base}',storeId:'1'}),landing:null,landingProducts:[]};};`}));
    build.onLoad({filter:/useOptionalGoogleLogin\.ts$/},()=>({loader:'js',contents:`export const GOOGLE_LOGIN_CONFIGURED=true;export function useOptionalGoogleLogin(options){return()=>{const popup=window.open('/qa-google','qa-google','width=500,height=600');const receive=event=>{if(event.source!==popup||event.origin!==location.origin||!event.data.qaGoogle)return;window.removeEventListener('message',receive);if(event.data.cancel)options.onError?.({error:'access_denied'});else void options.onSuccess?.({access_token:'synthetic-google-access'});};window.addEventListener('message',receive);};}`}));
    build.onLoad({filter:/activityPurchaseMode\.ts$/},()=>({loader:'js',contents:`export const useActivityCheckoutOptions=()=>({mode:'transfer',methods:['Transferencia']});`}));
    build.onLoad({filter:/shippingService\.ts$/},()=>({loader:'js',contents:`export const getDeliveryAlternatives=async()=>({pickup:{enabled:false},chilexpress:{enabled:false},starken:{enabled:false}});export const getShippingQuotes=async()=>({});`}));
  }}]});bundle=built.outputFiles[0].text;
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const pageFor=async(width=1280)=>{const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{errors.push('Diálogo nativo '+dialog.type());await dialog.dismiss();});await page.route('https://**',route=>route.fulfill({contentType:'application/javascript',body:''}));return{context,page,errors};};
    for(const template of [1,2,3,4])for(const test of cases){
      reset(test);const{context,page,errors}=await pageFor();
      await page.goto(site+`/plantilla/${template}/carrito`);
      for(let i=0;i<test.products;i++)await page.getByRole('button',{name:'Agregar producto QA',exact:true}).click();
      if(test.variant)await page.getByRole('button',{name:'Agregar variante QA',exact:true}).click();
      for(let i=0;i<test.activities;i++){await page.getByRole('button',{name:'Agregar taller QA',exact:true}).click();await page.waitForFunction(expected=>window.__cart.activities[0]?.quantity===expected,i+1);}
      await page.waitForFunction(expected=>window.__cart.count===expected,test.products+test.activities+(test.variant?1:0));
      await page.getByRole('button',{name:/Proceder al pago|Continuar al pago|Continuar compra/}).click();
      if(test.password){await page.goto(site+`/plantilla/${template}/ingresar?next=`+encodeURIComponent(`/plantilla/${template}/compra`));await page.getByLabel('Correo electrónico',{exact:true}).fill('qa@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('Sintetica2026!Prueba');await page.getByRole('img',{name:'Código de seguridad CAPTCHA',exact:true}).waitFor();await page.getByLabel('Código de la imagen',{exact:true}).fill('QA123');await page.getByRole('button',{name:/^Ingresar/}).click();}else{
      await page.getByRole('button',{name:'Google',exact:true}).click();
      await page.locator('input[type="tel"]').fill('912345678');
      const popupEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'Continuar con Google',exact:true}).click();const popup=await popupEvent;
      await popup.getByRole('button',{name:test.cancel?'Cancelar autenticación':'Cuenta sintética Google QA',exact:true}).click();
      }
      if(test.cancel||test.fail){
        await page.getByText(test.cancel?'La autenticación con Google fue cancelada o falló.':'No se pudo vincular la cuenta de Google. Tu carrito se conserva; reintenta o continúa como invitado.',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>window.__cart.count),test.products+test.activities);assert.equal(state.mutations.length,0);
      }else{
        await page.waitForFunction(()=>localStorage.getItem('token')==='synthetic-customer-token'&&!window.__cart.loading&&!window.__cart.error&&window.__cart.count>0);
        const products=Math.min(5,test.products+(test.prior?1:test.limited?4:0)),activities=Math.min(8,test.activities+(test.prior?1:test.limited?7:0));
        assert.equal(state.products.find(row=>row.sku==='QA-AZUL')?.cantidad||0,products);assert.equal(state.activities[0]?.quantity||0,activities);
        assert.equal(state.products.length,(products?1:0)+(test.variant?1:0));assert.equal(state.activities.length,activities?1:0);
        if(!test.password)assert.equal(await page.locator('input[type="tel"]').inputValue(),'912345678');assert(page.url().endsWith('/compra'));
        assert.equal(await page.evaluate(()=>window.__cart.subtotal),products*5000+activities*15000+(test.variant?8000:0));
        const mutations=state.mutations.length;await page.reload();await page.waitForFunction(()=>!window.__cart.loading&&!window.__cart.error&&window.__cart.count>0);assert.equal(state.mutations.length,mutations,'Recargar no repite la combinación');
      }
      assert.deepEqual(state.forbidden,[],'Autenticar no crea pedidos, reservas ni pagos');assert.deepEqual(errors,[]);console.log(`OK autenticación simulada, plantilla ${template}: ${test.name}`);await context.close();
    }
    for(const template of [1,2,3,4])for(const width of [375,1280]){
      reset();const{context,page,errors}=await pageFor(width);await page.goto(site+`/plantilla/${template}/carrito`);await page.getByRole('button',{name:'Agregar producto QA',exact:true}).click();await page.getByRole('button',{name:'Agregar taller QA',exact:true}).click();await page.waitForFunction(()=>window.__cart.count===2);
      const cards=page.locator('article[data-cart-kind]');assert.equal(await cards.count(),2);const styles=await cards.evaluateAll(cards=>cards.map(card=>{const css=getComputedStyle(card);return[css.borderRadius,css.borderColor,css.padding,css.fontFamily,css.gridTemplateColumns];}));assert.deepEqual(styles[0],styles[1]);
      await page.getByRole('button',{name:'Eliminar Producto sintético QA',exact:true}).click();await page.getByRole('dialog',{name:'Eliminar producto',exact:true}).getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.evaluate(()=>window.__cart.count),2);
      await page.getByRole('button',{name:'Eliminar Taller sintético QA del carrito',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__cart.count),2);
      await page.screenshot({path:path.join(output,`cart-${template}-${width}.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log(`OK tarjetas plantilla ${template}, ${width}px`);await context.close();
    }
    for(const width of [375,1280]){
      reset();const{context,page,errors}=await pageFor(width);await page.goto(site+'/plantilla/2/mobile');const header=page.locator('.minimal-header-shell');await header.waitFor();await page.evaluate(()=>scrollTo(0,650));assert(Math.abs((await header.boundingBox()).y)<2,'Encabezado sticky');const menu=page.getByRole('button',{name:'Abrir menú de navegación',exact:true});if(width<768){await menu.click();const drawer=page.getByRole('dialog',{name:'Menú de la tienda',exact:true});await drawer.waitFor();assert(await drawer.getByRole('link',{name:'Catálogo',exact:true}).isVisible());await page.keyboard.press('Escape');assert(await menu.evaluate(el=>el===document.activeElement));await menu.press('Enter');await drawer.getByRole('button',{name:'Cerrar',exact:true}).click();}else assert.equal(await menu.isVisible(),false);assert.deepEqual(errors,[]);console.log(`OK plantilla 2: menú y sticky ${width}px`);await context.close();
    }
    for(const template of [1,2,3,4]){
      reset();const{context,page,errors}=await pageFor(375);await page.goto(site+`/plantilla/${template}/cookies`);const banner=page.getByRole('dialog',{name:'Aviso de Cookies',exact:true});await banner.waitFor();assert.equal(await page.locator('#google-analytics-script,#meta-pixel-script').count(),0);
      await banner.getByRole('button',{name:/Aceptar/}).click();await page.waitForFunction(()=>window.__metaPixelConsent==='granted');await page.reload();await page.waitForFunction(()=>window.__metaPixelConsent==='granted');assert.equal(await banner.count(),0);
      await page.getByRole('button',{name:'Preferencias QA',exact:true}).click();const preferences=page.getByRole('dialog',{name:'Preferencias de cookies',exact:true});await preferences.getByRole('checkbox',{name:'Permitir estadísticas y marketing',exact:true}).uncheck();await preferences.getByRole('button',{name:'Guardar preferencias',exact:true}).click();assert.equal(await page.evaluate(()=>window.__metaPixelConsent),'revoked');await page.reload();assert.equal(await page.locator('#google-analytics-script,#meta-pixel-script').count(),0);assert.equal(await banner.count(),0);
      await page.getByRole('button',{name:'Preferencias QA',exact:true}).click();await preferences.getByRole('checkbox',{name:'Permitir estadísticas y marketing',exact:true}).check();await preferences.getByRole('button',{name:'Guardar preferencias',exact:true}).click();await page.waitForFunction(()=>window.__metaPixelConsent==='granted');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('OK cookies: primera visita, persistencia, rechazo y modificación, plantilla '+template);await context.close();
    }
    for(const template of [1,2,3,4]){
      reset();const{context,page,errors}=await pageFor(375);await page.goto(site+`/plantilla/${template}/cookies`);await page.evaluate(()=>localStorage.setItem('qa-unrelated-preference','conservar'));
      const banner=page.getByRole('dialog',{name:'Aviso de Cookies',exact:true});await banner.getByRole('button',{name:/Rechazar|Solo necesarias|No aceptar/}).click();
      assert.equal(await page.locator('#google-analytics-script,#meta-pixel-script').count(),0);await page.reload();await page.getByRole('heading',{name:'Cookies QA'}).waitFor();assert.equal(await banner.count(),0);assert.equal(await page.locator('#google-analytics-script,#meta-pixel-script').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('qa-unrelated-preference')),'conservar');
      assert.deepEqual(errors,[]);console.log('OK rechazo inicial persistido y preferencias ajenas conservadas, plantilla '+template);await context.close();
    }
    reset();const privacy=await pageFor();await privacy.page.goto(site+'/plantilla/1/cookies');const privacyBanner=privacy.page.getByRole('dialog',{name:'Aviso de Cookies',exact:true});await privacyBanner.getByRole('button',{name:/Aceptar/}).click();await privacy.page.waitForFunction(()=>window.__metaPixelConsent==='granted');
    const guestChoice=await privacy.page.evaluate(()=>Object.entries(localStorage).find(([key])=>key.startsWith('openmind:consent:v1:'))[1]);
    await privacy.page.getByRole('button',{name:'Entrar QA para privacidad',exact:true}).click();await privacyBanner.waitFor();assert.equal(await privacy.page.evaluate(()=>window.__metaPixelConsent),'revoked');assert.equal(await privacy.page.evaluate(()=>window['ga-disable-G-QATEST1234']),true);
    assert(await privacy.page.evaluate(choice=>Object.values(localStorage).includes(choice),guestChoice));await privacyBanner.getByRole('button',{name:/Rechazar|Solo necesarias|No aceptar/}).click();
    assert.deepEqual(await privacy.page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('openmind:consent:v1:')).map(([,value])=>JSON.parse(value).choice).sort()),['accepted','essential_only']);assert.deepEqual(privacy.errors,[]);console.log('OK consentimiento aislado entre invitado y cliente, sin rastreo durante el cambio de sesión');await privacy.context.close();
    console.log('CAPTURAS '+output);
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
