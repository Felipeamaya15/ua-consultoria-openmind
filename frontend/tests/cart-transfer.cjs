const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./source-loader.cjs');
const crypto=require('node:crypto').webcrypto;
const identity={apiBaseUrl:'http://qa.test',storeId:'1'};
const base='ua-guest-cart-v1:http%3A%2F%2Fqa.test:1';
const activity='11111111-1111-4111-8111-111111111111',version='a'.repeat(64);
function storage(){const map=new Map();return{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),map};}
function harness({products=2,activities=0,prior=0,priorActivities=0,stock=5,cupos=8,fail='',stale=false}={}){
  const localStorage=storage(),sessionStorage=storage();let token=null,userId=1,tail=Promise.resolve();
  const server={rows:prior?[{id_item_carrito:1,producto_mongo_id:'catalog-id',sku:'SKU',cantidad:prior}]:[],activities:priorActivities?[{sectionId:activity,quantity:priorActivities,version}]:[],calls:[],fail};
  const item={productId:'producto-qa',variantId:'SKU',sku:'SKU',name:'Producto QA',image:'',quantity:products,maxStock:10,price:5000,attributes:{}};
  if(products)localStorage.setItem(base+':guest-v2',JSON.stringify([item]));
  if(activities)sessionStorage.setItem(base+':activity-v2:guest-v2',JSON.stringify([{sectionId:activity,title:'Taller QA',quantity:activities,price:15000,version,start:'2037-12-12T12:00:00Z',zone:'UTC'}]));
  const product={id:'producto-qa',catalogId:'catalog-id',variants:[{sku:'SKU',stock,available:true}]};
  const fetch=async(url,options={})=>{
    assert.equal(new URL(url).searchParams.get('tienda_id'),'1');const path=new URL(url).pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;server.calls.push({path,method,body});let data;
    if(path==='/api/auth/me/')data={id:userId};
    else if(path==='/api/catalog/carrito/items/'&&method==='GET')data=server.rows;
    else if(path==='/api/catalog/carrito/items/'&&method==='POST'){
      if(server.fail==='before')throw Error('Red interrumpida antes de llegar');
      data={id_item_carrito:1,producto_mongo_id:'catalog-id',sku:'SKU',cantidad:body.cantidad};server.rows=[data];
      if(server.fail==='after'){server.fail='';throw Error('Respuesta perdida después de guardar');}
    }else if(path==='/api/catalog/carrito/items/1/'&&method==='PATCH'){server.rows[0].cantidad=body.cantidad;data=server.rows[0];}
    else if(path.endsWith('/disponibilidad/'))data={estado:'disponible',version:stale?'b'.repeat(64):version,cupos_disponibles:cupos};
    else if(path==='/api/landing/carrito-actividades/')data={items:server.activities};
    else if(path===`/api/landing/carrito-actividades/${activity}/`&&method==='PUT'){data={sectionId:activity,quantity:body.cantidad,version};server.activities=[data];}
    else throw Error('Operación inesperada '+method+' '+path);
    return{ok:true,status:200,json:async()=>({exito:true,data:structuredClone(data)})};
  };
  const locks={request(name,fn){const task=tail.then(fn);tail=task.catch(()=>{});return task;}};
  const make=(session=sessionStorage)=>load('src/features/storefront/services/cartTransfer.ts',{
    '../context/cartSession':{currentCartToken:()=>token},'./catalogService':{fetchPublicProducts:async()=>[product],fetchPublicProductDetail:async()=>product},
  },{localStorage,sessionStorage:session,fetch,crypto,navigator:{locks},window:{dispatchEvent(){return true;}},Event});
  const api=make();return{api,make,server,localStorage,sessionStorage,item,set token(value){token=value;},set user(value){userId=value;},writes:()=>server.calls.filter(call=>call.method!=='GET')};
}

test('combina variantes y participantes con límites, conserva el previo y no repite al recargar',async()=>{
  const h=harness({products:4,activities:2,prior:3,priorActivities:3,cupos:4});h.api.prepareGuestCartTransfer(identity);h.token='qa-1';
  assert.match(await h.api.transferGuestCart(identity,'qa-1',()=>true),/ajustaron/);
  assert.equal(h.server.rows[0].cantidad,5);assert.equal(h.server.activities[0].quantity,4);assert.equal(h.writes().length,2);
  await h.make().transferGuestCart(identity,'qa-1',()=>true);assert.equal(h.writes().length,2);
  assert.deepEqual(JSON.parse(h.localStorage.getItem(base+':guest-v2')),[]);
});

test('una respuesta perdida se reconcilia mediante lectura sin volver a agregar el producto',async()=>{
  const h=harness({fail:'after'});h.api.prepareGuestCartTransfer(identity);h.token='qa-1';
  await assert.rejects(h.api.transferGuestCart(identity,'qa-1',()=>true),/Respuesta perdida/);
  assert.equal(JSON.parse(h.localStorage.getItem(base+':guest-v2'))[0].quantity,2);
  await h.api.transferGuestCart(identity,'qa-1',()=>true);assert.equal(h.server.rows[0].cantidad,2);assert.equal(h.writes().length,1);
});

test('una escritura incierta sin resultado no se repite y mantiene íntegro el carrito de invitado',async()=>{
  const h=harness({fail:'before'});h.api.prepareGuestCartTransfer(identity);h.token='qa-1';
  await assert.rejects(h.api.transferGuestCart(identity,'qa-1',()=>true));
  await assert.rejects(h.api.transferGuestCart(identity,'qa-1',()=>true),/anterior no está confirmada/);
  assert.equal(h.writes().length,1);assert.equal(JSON.parse(h.localStorage.getItem(base+':guest-v2'))[0].quantity,2);
});

test('dos pestañas comparten el comprobante de productos y no duplican cantidades',async()=>{
  const h=harness(),otherSession=storage(),other=h.make(otherSession);h.api.prepareGuestCartTransfer(identity);other.prepareGuestCartTransfer(identity);h.token='qa-1';
  await Promise.all([h.api.transferGuestCart(identity,'qa-1',()=>true),other.transferGuestCart(identity,'qa-1',()=>true)]);
  assert.equal(h.server.rows[0].cantidad,2);assert.equal(h.writes().length,1);
});

test('otra cuenta y otra tienda no reciben una selección pendiente vinculada al cliente original',async()=>{
  const h=harness({fail:'before'});h.api.prepareGuestCartTransfer(identity);h.token='qa-1';await assert.rejects(h.api.transferGuestCart(identity,'qa-1',()=>true));
  h.token='qa-2';h.user=2;assert.match(await h.api.transferGuestCart(identity,'qa-2',()=>true),/otra cuenta/);
  await h.api.transferGuestCart({...identity,storeId:'2'},'qa-2',()=>true);assert.equal(h.writes().length,1);
});

test('no altera selecciones cuando cambia la sesión o las condiciones del taller',async()=>{
  const h=harness({products:0,activities:2,stale:true});h.api.prepareGuestCartTransfer(identity);h.token='qa-1';
  await assert.rejects(h.api.transferGuestCart(identity,'qa-1',()=>false),/sesión o la tienda cambió/);assert.equal(h.server.calls.length,0);
  await assert.rejects(h.api.transferGuestCart(identity,'qa-1',()=>true),/cambió sus condiciones/);assert.equal(h.writes().length,0);assert.equal(JSON.parse(h.sessionStorage.getItem(base+':activity-v2:guest-v2'))[0].quantity,2);
});
