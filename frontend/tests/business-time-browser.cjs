// Actual app with synthetic HTTP responses. Never sends business mutations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
try { ({chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright')); }
catch (cause) {
 throw new Error('Playwright no está disponible. Define DASHBOARD_PLAYWRIGHT_MODULE con la ruta al módulo compartido o usa una instalación local existente. Consulta el informe de cierre para el comando PowerShell.', {cause});
}
const base=process.env.BUSINESS_TEST_URL||'http://127.0.0.1:5173';
const out=process.env.BUSINESS_EVIDENCE_DIR?path.resolve(process.env.BUSINESS_EVIDENCE_DIR):null;
const envelope=data=>({exito:true,mensaje:'',data});
const orders=[{id_pedido:1,identificador:'QA-OCTUBRE',nombre_contacto:'QA',estado:'pagado',estado_etiqueta:'Pagado',monto_total:'1000.00',fecha_creacion:'2026-11-01T01:30:00Z',metodo_pago:'transferencia'},
 {id_pedido:2,identificador:'QA-NOVIEMBRE',nombre_contacto:'QA',estado:'pagado',estado_etiqueta:'Pagado',monto_total:'2000.00',fecha_creacion:'2026-11-01T03:00:00Z',metodo_pago:'transferencia'}].map(order=>({...order,correo_contacto:'qa@example.test',costo_envio:'0.00',descuento:'0.00',items:[]}));
const metrics={fecha_desde:'2026-10-31',fecha_hasta:'2026-10-31',zona_horaria:'America/Santiago',moneda:'CLP',total_ventas:'1000.00',total_pedidos:1,pedidos_pagados:1,por_despachar:1,ticket_promedio:'1000.00',historico:[{fecha:'2026-10-31',ventas:'1000.00',pedidos:1}],distribucion_estados:[{estado:'pagado',etiqueta:'Pagado',pedidos:1}]};
(async()=>{if(out)fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 for(const timezoneId of ['UTC','Asia/Tokyo','America/Santiago'])for(const width of [375,768,1440]){
  const context=await browser.newContext({timezoneId,viewport:{width,height:950}});
  await context.addInitScript(()=>localStorage.setItem('token','synthetic-period-test'));
  await context.route('**/api/**',route=>{
   assert.equal(route.request().method(),'GET');const p=new URL(route.request().url()).pathname;let data={};
   if(p==='/api/visual-config/plantilla-seleccionada/')data={tienda_id:1,plantilla_seleccionada:'editorial'};
   else if(p==='/api/auth/emprendedor/perfil/')data={email:'qa@example.test',first_name:'QA',last_name:'Local'};
   else if(p==='/api/tienda/configuracion/')data={nombre:'Tienda QA',descripcion:''};
   else if(p==='/api/tienda/dashboard/')data=metrics;
   else if(p==='/api/tienda/pedidos/ultimos/')data=orders;
   else if(p==='/api/tienda/pedidos/')return route.fulfill({json:orders});
   else if(p==='/api/catalog/productos/')data=[];
   else if(p==='/api/tienda/informes/')data={tienda:'Tienda QA',anio:2026,mes:null,anios_disponibles:[2026],fecha_desde:'2026-01-01',fecha_hasta:'2026-12-31',zona_horaria:'America/Santiago',moneda:'CLP',total_ventas:'3000.00',total_pedidos:2,pedidos_pagados:2,ticket_promedio:'1500.00',meses:Array.from({length:12},(_,i)=>({mes:i+1,etiqueta:String(i+1),ventas:i===9?'1000.00':i===10?'2000.00':'0.00',pedidos:[9,10].includes(i)?1:0,pagados:[9,10].includes(i)?1:0})),mejores_meses:{ventas:[11],pedidos:[10,11]},distribucion_estados:[{estado:'pagado',etiqueta:'Pagado',pedidos:2}],nota_fechas:'Datos sintéticos de prueba'};
   return route.fulfill({json:envelope(data)});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/emprendedor');
  await page.getByText('31 oct 2026, 22:30',{exact:true}).waitFor();
  await page.getByText('1 nov 2026, 00:00',{exact:true}).waitFor();
  const sales=page.getByRole('link',{name:'Ventas Totales: ver pedidos del período seleccionado'});
  await sales.click();
  await page.waitForURL('**/emprendedor/pedidos?**');
  await page.getByText('QA-OCTUBRE',{exact:true}).waitFor();assert.equal(await page.getByText('QA-NOVIEMBRE',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Desde',{exact:true}).inputValue(),'2026-10-31');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(out)await page.screenshot({path:path.join(out,`periodos-${timezoneId.replaceAll('/','-')}-${width}.png`),fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));console.log(`OK ${timezoneId}/${width}px: dashboard y filtros mantienen 31 de octubre en Santiago`);await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
