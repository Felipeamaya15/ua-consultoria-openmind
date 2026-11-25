import { readJsonResponse } from '../../../shared/services/apiRequest';
import type { StoreIdentity } from '../visual/storage';
import { guestCartKey, readGuestCart } from './guestCartStorage';
import { fetchPublicProducts, fetchPublicProductDetail } from './catalogService';
import { currentCartToken } from '../context/cartSession';

type Entry = {kind:'product'|'activity'; id:string; sku:string; quantity:number; version?:string; target?:number; requested?:number; status?:'writing'|'done'};
type Transfer = {version:1; owner?:number; receipt?:string; entries:Entry[]};
const running = new Map<string,Promise<string>>();
const transferKey = (base:string) => `${base}:login-transfer-v1`;
const activityKey = (base:string) => `${base}:activity-v2:guest-v2`;

async function timed<T>(operation:(signal:AbortSignal)=>Promise<T>):Promise<T> {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try{return await operation(controller.signal);}
  catch(error){
    if((error as {name?:string})?.name==='AbortError')throw new Error('La sincronización tardó demasiado. Tu selección permanece protegida; actualiza para consultar su estado.');
    if((error as {name?:string})?.name==='TypeError')throw new Error('No se pudo confirmar la sincronización. Tu selección permanece protegida; comprueba la conexión y actualiza.');
    throw error;
  }finally{clearTimeout(timer);}
}

function readTransfer(base:string):Transfer|null {
  try {
    const value=JSON.parse(sessionStorage.getItem(transferKey(base))||'null');
    if(value?.version!==1||!Array.isArray(value.entries))return null;
    if(value.entries.some((row:Entry)=>!['product','activity'].includes(row.kind)||typeof row.id!=='string'||typeof row.sku!=='string'||!Number.isSafeInteger(row.quantity)||row.quantity<1))return null;
    return value;
  } catch {return null;}
}

export function prepareGuestCartTransfer(identity:StoreIdentity|null) {
  const base=guestCartKey(identity);
  if(!base||currentCartToken())return;
  const previous=readTransfer(base);
  if(previous?.owner&&previous.entries.some(row=>row.status!=='done'))return;
  const entries:Entry[]=readGuestCart(`${base}:guest-v2`).map(item=>({kind:'product',id:item.productId,sku:item.sku,quantity:item.quantity}));
  try {
    let receipt:string|undefined;
    if(entries.length){
      const fingerprint=JSON.stringify(entries);
      const last=localStorage.getItem(base+':login-products-current');
      let saved:any=null;try{saved=JSON.parse(last?localStorage.getItem(last)||'null':'null');}catch{}
      if(saved?.fingerprint===fingerprint&&saved.entries.some((row:Entry)=>row.status!=='done'))receipt=last!;
      else{receipt=base+':login-products:'+crypto.randomUUID();localStorage.setItem(receipt,JSON.stringify({version:1,fingerprint,entries}));localStorage.setItem(base+':login-products-current',receipt);}
    }
    const activities:unknown=JSON.parse(sessionStorage.getItem(activityKey(base))||'[]');
    if(Array.isArray(activities))for(const row of activities)if(typeof row?.sectionId==='string'&&Number.isSafeInteger(row.quantity)&&row.quantity>0&&typeof row.version==='string')entries.push({kind:'activity',id:row.sectionId,sku:'',quantity:row.quantity,version:row.version});
    if(entries.length)sessionStorage.setItem(transferKey(base),JSON.stringify({version:1,receipt,entries}));
  } catch {throw new Error('El navegador no permite proteger el carrito antes de iniciar sesión.');}
}

export function hasGuestCartTransfer(identity:StoreIdentity|null) {
  const base=guestCartKey(identity);return !!base&&!!readTransfer(base)?.entries.some(row=>row.status!=='done');
}

export function transferGuestCart(identity:StoreIdentity,token:string,isCurrent:()=>boolean):Promise<string> {
  const base=guestCartKey(identity)!;
  const key=`${base}:${token}`;
  const previous=running.get(key);if(previous)return previous;
  const execute=async()=>{
    const transfer=readTransfer(base);if(!transfer||transfer.entries.every(row=>row.status==='done'))return '';
    const assertCurrent=()=>{if(currentCartToken()!==token||!isCurrent())throw new Error('La sesión o la tienda cambió. El carrito anterior permanece protegido.');};
    let receipt:any=null;
    if(transfer.receipt){try{receipt=JSON.parse(localStorage.getItem(transfer.receipt)||'null');}catch{}if(!receipt||!Array.isArray(receipt.entries))throw new Error('No se pudo recuperar la protección del carrito de productos.');}
    if(receipt)transfer.entries=[...receipt.entries,...transfer.entries.filter(row=>row.kind==='activity')];
    const persist=()=>{sessionStorage.setItem(transferKey(base),JSON.stringify(transfer));if(receipt&&transfer.receipt){receipt.owner=transfer.owner;receipt.entries=transfer.entries.filter(row=>row.kind==='product');localStorage.setItem(transfer.receipt,JSON.stringify(receipt));}};
    const request=async(path:string,method='GET',body?:unknown)=>timed(async signal=>{
      assertCurrent();
      const url=new URL(`${identity.apiBaseUrl.replace(/\/+$/,'')}${path}`);url.searchParams.set('tienda_id',identity.storeId);
      const response=await fetch(url.toString(),{method,signal,credentials:'include',cache:'no-store',headers:{Authorization:`Token ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const data=await readJsonResponse(response,'No pudimos sincronizar el carrito. Conservamos tu selección; actualiza para consultar su estado.');assertCurrent();
      if(!response.ok||data.exito===false){const error=new Error(data.mensaje||'No se pudo combinar el carrito. Tu selección permanece protegida.');Object.assign(error,{definitive:response.status>=400&&response.status<500});throw error;}
      return data.data;
    });
    const user=await request('/api/auth/me/');
    if(!Number.isSafeInteger(user?.id)||user.id<1)throw new Error('No se pudo confirmar la cuenta. Tu selección permanece protegida.');
    if (user.is_staff || user.is_superuser || user.is_store_owner) {
      return 'La cuenta administradora no puede recibir un carrito de comprador. La selección de invitado sigue guardada; inicia sesión con una cuenta de cliente para continuar.';
    }
    if(transfer.owner&&transfer.owner!==user.id||receipt?.owner&&receipt.owner!==user.id)return 'La selección de invitado está vinculada a otra cuenta. Se cargó únicamente el carrito de tu cuenta actual.';
    transfer.owner=user.id;persist();
    const products=transfer.entries.some(row=>row.kind==='product'&&row.status!=='done')?await timed(signal=>fetchPublicProducts({cache:'no-store',signal})):[];
    assertCurrent();
    const acknowledge=(entry:Entry)=>{
      if(entry.kind==='product'){
        const source=readGuestCart(`${base}:guest-v2`);
        localStorage.setItem(`${base}:guest-v2`,JSON.stringify(source.flatMap(row=>row.productId===entry.id&&row.sku.toUpperCase()===entry.sku.toUpperCase()?row.quantity>entry.quantity?[{...row,quantity:row.quantity-entry.quantity}]:[]:[row])));
      }else{
        const source=JSON.parse(sessionStorage.getItem(activityKey(base))||'[]');
        sessionStorage.setItem(activityKey(base),JSON.stringify(source.flatMap((row:any)=>row.sectionId===entry.id&&row.version===entry.version?row.quantity>entry.quantity?[{...row,quantity:row.quantity-entry.quantity}]:[]:[row])));
      }
      entry.status='done';persist();
    };
    let adjusted=false;
    for(const entry of transfer.entries){
      if(entry.status==='done')continue;
      assertCurrent();
      if(entry.kind==='product'){
        const summary=products.find(product=>product.id===entry.id||product.catalogId===entry.id);
        const catalog=summary?await timed(signal=>fetchPublicProductDetail(summary.id,{cache:'no-store',signal})):null;
        const variant=catalog?.variants.find(variant=>variant.sku.toUpperCase()===entry.sku.toUpperCase());
        const stock=variant?.available?variant.stock:0;
        if(!catalog||!variant||!stock)throw new Error('Un producto ya no está disponible. Conservamos tu selección para revisarla antes de continuar.');
        const data=await request('/api/catalog/carrito/items/');
        const rows=Array.isArray(data)?data:data?.items;
        if(!Array.isArray(rows))throw new Error('No se pudo verificar el carrito guardado.');
        const saved=rows.find(row=>[entry.id,catalog.id,catalog.catalogId].includes(row.producto_mongo_id||row.slug||String(row.id_producto))&&String(row.sku||'').toUpperCase()===entry.sku.toUpperCase());
        if(entry.target===undefined){entry.requested=Number(saved?.cantidad||0)+entry.quantity;entry.target=Math.min(entry.requested,stock);persist();}
        adjusted ||= entry.target<(entry.requested||entry.target);
        if(saved&&(Number(saved.cantidad)===entry.target||entry.status==='writing'&&Number(saved.cantidad)>=entry.target)){acknowledge(entry);continue;}
        if(entry.status==='writing')throw new Error('La sincronización anterior no está confirmada. Tu selección permanece protegida; actualiza el carrito para consultar el resultado sin repetir la operación.');
        entry.status='writing';persist();
        try {
          const result=saved?await request(`/api/catalog/carrito/items/${saved.id_item_carrito}/`,'PATCH',{cantidad:entry.target}):await request('/api/catalog/carrito/items/','POST',{[/^\d+$/.test(entry.id)?'id_producto':'slug']:/^\d+$/.test(entry.id)?Number(entry.id):entry.id,cantidad:entry.target,sku:entry.sku||undefined});
          if(!Number.isSafeInteger(result?.id_item_carrito)||Number(result.cantidad)!==entry.target)throw new Error('No se confirmó la cantidad combinada. Tu selección permanece protegida.');
          acknowledge(entry);
        } catch(error){if((error as {definitive?:boolean}).definitive){delete entry.status;persist();}throw error;}
      }else{
        const quote=await request(`/api/landing/actividades/${encodeURIComponent(entry.id)}/disponibilidad/`);
        if(quote.estado!=='disponible'||quote.version!==entry.version)throw new Error('Un taller cambió sus condiciones. Conservamos la selección para que puedas revisarla.');
        const data=await request('/api/landing/carrito-actividades/');
        if(!Array.isArray(data?.items))throw new Error('No se pudo verificar el carrito de talleres.');
        const saved=data.items.find((row:any)=>row.sectionId===entry.id);
        if(entry.target===undefined){entry.requested=Number(saved?.quantity||0)+entry.quantity;entry.target=Math.min(entry.requested,quote.cupos_disponibles);persist();}
        if(!entry.target)throw new Error('No quedan cupos para el taller. Conservamos tu selección para revisarla.');
        adjusted ||= entry.target<(entry.requested||entry.target);
        if(!saved||saved.quantity<entry.target||saved.version!==entry.version){const result=await request(`/api/landing/carrito-actividades/${encodeURIComponent(entry.id)}/`,'PUT',{cantidad:entry.target,version:entry.version});if(result?.sectionId!==entry.id||result.quantity!==entry.target||result.version!==entry.version)throw new Error('No se confirmó la selección del taller. Tu selección permanece protegida.');}
        acknowledge(entry);
      }
    }
    window.dispatchEvent(new Event('openmind-cart-merged'));
    return adjusted?'El carrito se combinó y se ajustaron cantidades al stock o a los cupos disponibles.':'';
  };
  const work=(async()=>{if(!navigator.locks)throw new Error('El carrito está protegido. Usa una conexión segura y un navegador actualizado para combinarlo sin duplicar operaciones.');return await navigator.locks.request(`${base}:login-transfer`,execute);})().finally(()=>running.delete(key));
  running.set(key,work);return work;
}
