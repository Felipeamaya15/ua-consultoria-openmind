// Respuestas artificiales basadas en legal.py, serializers y auth/me del candidato.
const http = require('node:http');
const pages = (store, version=1) => Object.fromEntries(['terms','privacy','refund','cookies'].map(type => [type, {
  title:type, draft:`Vigente tienda ${store} ${type}`, published:`Vigente tienda ${store} ${type}`,
  version,lastPublished:'2026-10-19T12:00:00Z',fecha_vigencia:'2026-10-19T12:00:00Z',
  historial:[],banner:type==='cookies'?{title:'Aviso de Cookies',message:`Cookies tienda ${store}`,acceptText:'Aceptar cookies',declineText:'Solo necesarias',enabled:true}:undefined,
}]));
http.createServer(async(req,res)=>{
  try {
    const route = new URL(req.url,'http://qa.test').pathname.replace(/^\/openmind/,'').replace(/\/$/,'');
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    let state = await pm.state.get('blockers.control') || {store:1,status:200,delay:0,readDelay:0,version:1};
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
    const ok=data=>json(200,{exito:true,data,mensaje:''});
    if(route==='/__qa/state'){
      if(req.method==='POST'){state={...state,...req.body};await pm.state.set('blockers.control',state);}
      return ok(state);
    }
    const token=req.headers.authorization||'';
    const user=token==='Token qa-seven'?7:token==='Token qa-eight'?8:null;
    if(route==='/api/auth/me')return user?ok({id:user,is_store_owner:true,is_staff:false}):json(401,{exito:false});
    if(route==='/api/tienda/configuracion')return ok({nombre:`Tienda ${state.store}`,descripcion:''});
    if(route==='/api/landing/configuracion')return ok({id:state.store,tienda:state.store,logo:null,secciones:{},contenido:{}});
    if(route==='/api/catalog/productos')return ok([]);
    if(route==='/api/legal'||route==='/api/legal/configuracion'||route==='/api/legal/configuracion/publicar'){
      const store=state.store;
      if(route.includes('/configuracion')&&!user)return json(403,{exito:false,mensaje:'Sin permiso'});
      let data=await pm.state.get(`blockers.pages.${store}`)||pages(store,state.version);
      if(state.version!==data.cookies.version){data.cookies.version=state.version;await pm.state.set(`blockers.pages.${store}`,data);}
      const captured=structuredClone(data);
      if(req.method==='GET'){
        if(state.readStatus && route.includes('/configuracion'))return json(state.readStatus,{exito:false,mensaje:'Lectura QA fallida'});
        if(state.readDelay)await new Promise(resolve=>setTimeout(resolve,state.readDelay));
        return ok(captured);
      }
      if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));
      if(state.status!==200){
        if(state.html){res.writeHead(state.status,{'Content-Type':'text/html'});return res.end('<h1>Error QA</h1>');}
        return json(state.status,{exito:false,mensaje:'Error artificial'});
      }
      data=await pm.state.get(`blockers.pages.${store}`)||pages(store,state.version);
      const input=req.body||{},type=input.tipo;
      if(!data[type])return json(400,{exito:false,mensaje:'Tipo inválido'});
      if(route.endsWith('/publicar')){
        if(!input.content?.trim())return json(400,{exito:false,mensaje:'Vacío'});
        data[type]={...data[type],draft:input.content,published:input.content,version:data[type].version+1,lastPublished:'2026-10-19T13:00:00Z'};
        data[type].historial.push({version:data[type].version,content:input.content,fecha_vigencia:'2026-10-19T13:00:00Z'});
      }else data[type].draft=input.accion==='restore'?`Plantilla base ${type}`:input.draft;
      await pm.state.set(`blockers.pages.${store}`,data);
      return ok(data);
    }
    return json(501,{exito:false,mensaje:`Ruta no modelada ${route}`});
  }catch(error){res.writeHead(500);res.end(JSON.stringify({error:String(error)}));}
}).listen(process.env.PORT);
