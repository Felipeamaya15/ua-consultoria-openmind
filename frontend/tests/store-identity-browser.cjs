// Real React/Vite in Edge; EVERY API response below is simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.IDENTITY_TEST_URL||'http://localhost:5173';
const out=process.env.IDENTITY_EVIDENCE_DIR?path.resolve(process.env.IDENTITY_EVIDENCE_DIR):path.resolve(__dirname,'../../docs/identidad-visual-plantillas');
const envelope=data=>({exito:true,mensaje:'',data});
const logo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="50"><rect width="120" height="50" fill="#157347"/><text x="10" y="30" fill="white">MARCA QA</text></svg>');
const productId='123456789012345678901234', secondId='123456789012345678901235';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of [375,768,1440]){
   const context=await browser.newContext({viewport:{width,height:950}});
   let store=1,mode='full',businessName='Marca comercial A',logoValue=logo,focusRefresh=false;
   const business=()=>({nombre:businessName,descripcion:'Descripción del negocio, no es la portada'});
   const landing=()=>mode==='empty'?null:({id:store,tienda:store,titulo:`Portada exclusiva ${store}`,descripcion:`Descripción editorial ${store}`,texto_boton:'Explorar productos',logo:mode==='no-media'?null:logoValue,imagen_principal:mode==='no-media'?null:logo,
    secciones:{'Productos destacados':true,'Categorías':true,'Beneficios':false,'Información de contacto':true,'Mapa / ubicación':false},
    contenido:{productos_destacados:[productId,secondId],categorias:['Artesanía'],beneficios:[],contacto:{correo:`contacto${store}@example.test`,telefono:'+56 9 1111 2222'},ubicacion:{}}});
   await context.addInitScript(()=>{
    const templates=['editorial','minimal','visual','catalog'];
    for(const apiBaseUrl of ['http://localhost:8000','http://127.0.0.1:8000']) for(const storeId of ['1','2']){
     const config={name:'NOMBRE LOCAL OBSOLETO '+storeId,description:'DESCRIPCIÓN LOCAL OBSOLETA',logo:'/logo-local-antiguo.png',themeEditor:Object.fromEntries(templates.map(template=>[template,{visualConfig:{global:{colors:{primary:storeId==='1'?'#176b5b':'#873560'},typography:{body:'arial'}}},images:{'image-0':{src:'/imagen-heredada-equivocada.png',scale:100}}}]))};
     localStorage.setItem(`ua-entrepreneur-demo-v1:store:${encodeURIComponent(apiBaseUrl)}:${storeId}`,JSON.stringify({version:1,identity:{apiBaseUrl,storeId},config}));
    }
   });
   await context.route('**/api/**',async route=>{
    assert.equal(route.request().method(),'GET','Este recorrido no debe escribir datos');
    const p=new URL(route.request().url()).pathname;
    let data={};
    if(p==='/api/visual-config/plantilla-seleccionada/')data={tienda_id:store,plantilla_seleccionada:'visual'};
    else if(p==='/api/tienda/configuracion/')data=business();
    else if(p==='/api/landing/configuracion/')data=landing();
    else if(p==='/api/catalog/productos/')data=[{id:productId,slug:'producto-del-servidor',nombre:'Producto del servidor',categoria:'Artesanía',imagen:logo,precio:2000,precio_oferta:1500,disponible:true},{id:secondId,slug:'segundo-producto',nombre:'Segundo producto del servidor',categoria:'Artesanía',imagen:logo,precio:2000,precio_oferta:1500,disponible:true}];
    else if(p==='/api/auth/me/')return route.fulfill({status:401,json:{exito:false}});
    return route.fulfill({json:envelope(data)});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const scenario of (process.env.IDENTITY_SCENARIOS?.split(',')||['full','no-media','empty','store-b'])){
    mode=scenario==='store-b'?'full':scenario;store=scenario==='store-b'?2:1;businessName=store===1?'Marca comercial A':'Marca comercial B';
    for(const template of [1,2,3,4]){
     await page.goto(`${base}/plantilla/${template}`);
     const header=page.locator('header[data-visual-section="header"]');
     const brand=header.getByRole('link',{name:`Ir al inicio de ${businessName}`,exact:true});await brand.waitFor();
     if(mode==='empty')await page.getByText('La tienda todavía no tiene configuración de inicio.',{exact:true}).waitFor();
     else await page.getByRole('heading',{level:1,name:`Portada exclusiva ${store}`,exact:true}).waitFor();
     assert.equal(await page.locator('body').getByText('NOMBRE LOCAL OBSOLETO',{exact:false}).count(),0);
     assert(!(await page.locator('body').textContent()).includes('Velta'));
     assert.equal(await brand.locator('img').count(),mode==='no-media'||mode==='empty'?0:1);
     assert.equal(await page.locator('header img[src*="logo-local-antiguo"], header img[src*="imagen-heredada"]').count(),0);
     assert.equal(await page.locator('[data-institutional-bar] [data-institutional-branding]').count(),1);
     assert.equal(await header.locator('[data-institutional-branding]').count(),0);
     assert(!await header.textContent().then(t=>t.includes('Velta')||t.includes('UNIVERSIDAD')));
     const root=page.locator('[data-storefront-visual]');
     assert.equal(await root.evaluate(el=>el.style.getPropertyValue('--primary-desktop')),store===1?'#176b5b':'#873560');
     assert((await root.evaluate(el=>el.style.getPropertyValue('--visual-body-font-desktop'))).includes('Arial'));
     if(mode!=='empty'){
      const hero=page.locator('[data-visual-section="hero"]');
      assert((await hero.locator('[data-visual-part="heroSubtitle"]').textContent()).includes(`Descripción editorial ${store}`));
      assert(await page.locator(`a[href="/plantilla/${template}/producto/producto-del-servidor"]`).count()>0);
      assert((await page.locator('body').textContent()).includes('1.500'),`precio ${scenario}/${template}/${width}`);
      await page.getByText(`contacto${store}@example.test`,{exact:true}).first().waitFor();
      if(template===2){
       await page.getByRole('button',{name:'Explorar productos',exact:true}).click();
       await page.waitForURL(`${base}/plantilla/2/catalogo`);
       await brand.click();await page.getByRole('heading',{level:1,name:`Portada exclusiva ${store}`,exact:true}).waitFor();
      }else{
       const cta=page.getByRole('link',{name:'Explorar productos',exact:false});assert.equal(await cta.getAttribute('href'),`/plantilla/${template}/catalogo`);
      }
      assert.equal(await hero.locator('img[data-landing-image]').count(),mode==='no-media'?0:1);
     }
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${scenario}/${template}/${width}: desbordamiento`);
     await page.reload();await brand.waitFor();
     // Verify a refresh of a mounted provider; the same events are emitted after admin saves.
     if(scenario==='full'&&!focusRefresh){
      businessName='Marca actualizada sin remontar';logoValue=null;
      await page.evaluate(()=>{window.dispatchEvent(new Event('openmind:store-information-changed'));window.dispatchEvent(new Event('openmind:landing-config-changed'));});
      await header.getByRole('link',{name:`Ir al inicio de ${businessName}`,exact:true}).waitFor();
      await page.waitForFunction(()=>document.querySelector('header [data-visual-part="logo"] img')===null);
      focusRefresh=true;businessName='Marca comercial A';logoValue=logo;
     }
     if(scenario==='full'){
      await page.goto(`${base}/plantilla/${template}/ingresar`);
      await page.getByRole('heading',{name:'Bienvenido de nuevo',exact:true}).waitFor();
      assert((await page.locator('body').textContent()).includes(businessName));
      assert(!(await page.locator('body').textContent()).includes('Velta'));
      await page.getByRole('link',{name:`Ir al inicio de ${businessName}`,exact:true}).click();
      await page.getByRole('heading',{name:`Portada exclusiva ${store}`,exact:true}).waitFor();
     }
     if(scenario==='full')await page.screenshot({path:path.join(out,`simulada-${template}-${width}.png`)});
    }
    console.log(`OK API SIMULADA ${scenario}: 4 plantillas ${width}px, identidad/medios/contacto/estilos/precios/rutas/recarga`);
   }
   // No customization and long business names, without reusing any previous store's palette.
   await page.evaluate(()=>localStorage.clear());store=1;mode='full';businessName='Nombre comercial muy extenso '.repeat(5).slice(0,150);
   for(const template of [1,2,3,4]){
    await page.goto(`${base}/plantilla/${template}`);await page.getByRole('link',{name:`Ir al inicio de ${businessName}`,exact:true}).waitFor();
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    if(!fits){console.log(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,100),right:el.getBoundingClientRect().right}))));await page.screenshot({path:path.join(out,`nombre-largo-${template}-${width}.png`)});}
    assert(fits,`nombre largo ${template}/${width}`);
   }
   assert.equal(errors.length,0,errors.join('\n'));await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
