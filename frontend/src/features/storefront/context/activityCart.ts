import { useCallback, useSyncExternalStore } from 'react';
import { useStoreIdentity } from './StoreIdentityContext';
import { useCartSession, currentCartToken } from './cartSession';
import { guestCartKey } from '../services/guestCartStorage';
import { isActiveEditorPreview } from '../visual/pages';
import { validActivityId, canSelectPaidQuote, type PaidQuote } from '../../landing/services/paidActivityService';


export function activityCartPreviewEnabled() {
  return typeof window !== 'undefined' && !isActiveEditorPreview();
}
export interface ActivityCartItem {
  sectionId: string; title: string; quantity: number; price: number; version: string; start: string; zone: string;
}
const EMPTY: ActivityCartItem[] = [];
const cache = new Map<string, ActivityCartItem[]>();
const event = 'openmind-activity-cart-preview';
function validItem(x:unknown):x is ActivityCartItem {
  if (!x || typeof x!=='object') return false;
  const a=x as ActivityCartItem;
  if (typeof a.sectionId!=='string'||!validActivityId(a.sectionId)||typeof a.title!=='string'||typeof a.version!=='string'|| !/^[a-f0-9]{64}$/.test(a.version)||
    !Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>10000||!Number.isSafeInteger(a.price)||a.price<1||a.price>999999999999||
    typeof a.start!=='string'||!Number.isFinite(Date.parse(a.start))||typeof a.zone!=='string')return false;
  try {new Intl.DateTimeFormat('es-CL',{timeZone:a.zone}).format();}catch{return false;}
  return true;
}
function read(key:string|null):ActivityCartItem[] {
  if(!key)return EMPTY;
  if(!cache.has(key)){
    let rows:ActivityCartItem[]=[];
    try{const raw:unknown=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(raw))rows=raw.filter(validItem).filter((item,i,all)=>all.findIndex(x=>x.sectionId===item.sectionId)===i);}catch{}
    cache.set(key,rows);
  }
  return cache.get(key)||EMPTY;
}
function write(key:string,rows:ActivityCartItem[]) {
  cache.set(key,rows);
  try{sessionStorage.setItem(key,JSON.stringify(rows));}catch{}
  window.dispatchEvent(new Event(event));
}
function subscribe(fn:()=>void){window.addEventListener(event,fn);return()=>window.removeEventListener(event,fn);}
export function useActivityCart(){
  const {identity}=useStoreIdentity();
  const base=guestCartKey(identity);
  const {token, scope}=useCartSession();

  const key=activityCartPreviewEnabled()&&base&&scope?`${base}:activity-v2:${scope}`:null;
  const snapshot=useCallback(()=>read(key),[key]);
  const items=useSyncExternalStore(subscribe,snapshot,()=>EMPTY);
  const put=useCallback((sectionId:string,quote:PaidQuote,quantity:number,version:string)=>{
    if(currentCartToken()!==token||!key||!validActivityId(sectionId)||!canSelectPaidQuote(quote,quantity,version))throw new Error('Revisa disponibilidad y condiciones antes de agregar.');
    const item:ActivityCartItem={sectionId,title:quote.titulo,quantity,price:quote.precio,version,start:quote.inicio,zone:quote.zona_horaria};
    write(key,[...read(key).filter(x=>x.sectionId!==sectionId),item]);
  },[key,token]);
  const remove=useCallback((id:string)=>{if(key&&currentCartToken()===token)write(key,read(key).filter(x=>x.sectionId!==id));},[key,token]);

  const reduce=useCallback((id:string)=>{
    if(!key||currentCartToken()!==token)return;
    const rows=read(key);
    write(key,rows.flatMap(row=>row.sectionId!==id?[row]:row.quantity>1?[{...row,quantity:row.quantity-1}]:[]));
  },[key,token]);
  const clear=useCallback(()=>{if(key&&currentCartToken()===token)write(key,[]);},[key,token]);
  return {items,put,remove,reduce,clear,ready:!!key};
}
