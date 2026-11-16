import {useEffect,useState} from 'react';
import {useStoreIdentity} from '../../storefront/context/StoreIdentityContext';
export type ActivityMode='qa'|'transfer'|'webpay'|'both'|'commercial'|'disabled';
const empty={mode:'disabled' as ActivityMode,methods:[] as string[]};
export function useActivityCheckoutOptions(enabled=true,mixed=false){
 const {identity}=useStoreIdentity();
 const [options,setOptions]=useState(empty);
 useEffect(()=>{
   setOptions(empty); if(!enabled||!identity)return;
   const controller=new AbortController();
   const base=identity.apiBaseUrl.replace(/\/+$/,'');
   fetch(`${base}/api/landing/modo-compra-actividades/${mixed?'?mixta=1':''}`,{cache:'no-store',signal:controller.signal})
    .then(r=>r.ok?r.json():null).then(b=>{if(controller.signal.aborted||b?.exito!==true)return;const mode=b.data?.modo;if(!['qa','transfer','webpay','both','commercial'].includes(mode))return;const fallback=mode==='both'?['Transbank','Transferencia']:mode==='webpay'?['Transbank']:mode==='qa'||mode==='transfer'?['Transferencia']:[]; const methods=Array.isArray(b.data?.medios_pago)?b.data.medios_pago.filter((m:unknown)=>typeof m==='string'&&['Transbank','Transferencia','MercadoPago','PayPal','TUU','Linkify'].includes(m)):fallback;setOptions({mode,methods});}).catch(()=>{});
   return()=>controller.abort();
 },[enabled,identity,mixed]);
 return options;
}
export function useActivityPurchaseMode(enabled=true,mixed=false){return useActivityCheckoutOptions(enabled,mixed).mode;}
