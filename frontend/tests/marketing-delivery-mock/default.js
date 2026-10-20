// Contratos leídos de serializers/views del repositorio. Datos artificiales; uso local.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const image = fs.readFileSync(path.resolve(__dirname, '../../../docs/marketing-parte1/evidencias/producto-qa.png'));
const initial = () => ({storeId:1,price:30000,offer:24000,deleted:false,missingVariant:false,image:'data',cors:true,failImage:false});
const pid = n => String(n).padStart(24,'0');
http.createServer(async (req,res) => {
  try {
  const url = new URL(req.url,'http://qa.test');
  let route = url.pathname.replace(/^\/openmind/,'');
  if(route.startsWith('/api/')&&!route.endsWith('/'))route+='/';
  let state = await pm.state.get('marketingDelivery.state') || initial();
  if (!(route.startsWith('/media/') && !state.cors)) res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const json = (status,data) => {res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const envelope = data => json(200,{exito:true,mensaje:'',data});
  if(route==='/__qa/state'){
    if(req.method==='POST'){state={...state,...req.body};await pm.state.set('marketingDelivery.state',state);}
    return envelope(state);
  }
  if(route==='/media/externa.png'){
    res.writeHead(state.failImage?404:200,{'Content-Type':'image/png'});return res.end(state.failImage?'':image);
  }
  const token = req.headers.authorization || '', userId = token==='Token qa-owner-seven'?7:token==='Token qa-owner-eight'?8:null;
  if(route==='/api/auth/emprendedor/perfil/')return userId?envelope({email:`qa-${userId}@example.test`,first_name:'QA',last_name:'Marketing',phone:''}):json(401,{exito:false});
  if(route==='/api/auth/me/')return userId?envelope({id:userId,username:`qa${userId}`,is_staff:false,is_store_owner:true}):json(401,{exito:false});
  if(route==='/api/visual-config/plantilla-seleccionada/')return envelope({tienda_id:state.storeId,plantilla_seleccionada:'minimal'});
  if(route==='/api/tienda/configuracion/')return envelope({nombre:`Tienda QA ${state.storeId}`,descripcion:'Datos artificiales'});
  if(route==='/api/landing/configuracion/')return envelope({id:state.storeId,tienda:state.storeId,logo:null,contenido:{},secciones:{}});
  if(route==='/api/catalog/productos/admin/listado/'){
    if(!userId)return json(401,{exito:false});
    const picture=state.image==='none'?[]:state.image==='external'?[`http://127.0.0.1:4912/openmind/media/externa.png`]:['data:image/png;base64,'+image.toString('base64')];
    const variant=(sku,price,offer=null)=>({sku,precio:price,precio_oferta:offer,stock:3,atributos_variante:[{clave:'color',etiqueta:'Color',valor:sku}]});
    return envelope(state.deleted?[]:[{id:pid(state.storeId),nombre:'Mochila real de prueba',descripcion:'Material resistente para acompañarte cada día.',categoria:'Accesorios',activo:true,imagenes:picture,
      variantes:state.missingVariant?[variant('NUEVA',18000)]:[variant('AZUL',state.price,state.offer),variant('ROJO',32000)]}]);
  }
  return json(501,{exito:false,mensaje:`Ruta no definida en simulación: ${route}`});
  } catch(error) { res.writeHead(500,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({error:error.message})); }
}).listen(process.env.PORT);
