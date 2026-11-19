import { useEffect,useState } from 'react';
import { useActivityCart,type ActivityCartItem } from '../../context/activityCart';
import { formatPrice } from '../../data/mockData';
import { fetchPaidQuote,canSelectPaidQuote,formatActivityDate,paidStatusLabel,type PaidQuote } from '../../../landing/services/paidActivityService';
import '../../../landing/components/activity-purchase-preview.css';

function ActivityRow({item}:{item:ActivityCartItem}){
  const {put,remove,reduce}=useActivityCart();
  const [quote,setQuote]=useState<PaidQuote|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;let current:AbortController|null=null;
    const refresh=()=>{current?.abort();const c=new AbortController();current=c;fetchPaidQuote(item.sectionId,c.signal).then(q=>{if(active&&!c.signal.aborted){setQuote(q);setError('');}}).catch(()=>{if(active&&!c.signal.aborted){setQuote(null);setError('No se pudo verificar esta actividad.');}});};
    refresh();const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);
    return()=>{active=false;current?.abort();window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[item.sectionId]);
  const valid=!!quote&&canSelectPaidQuote(quote,item.quantity,item.version);
  async function update(delta:number){
    if(busy)return;
    if(delta<0){reduce(item.sectionId);return;}
    const qty=item.quantity+delta;if(qty<1)return;
    setBusy(true);setError('');
    try{const fresh=await fetchPaidQuote(item.sectionId);setQuote(fresh);if(!canSelectPaidQuote(fresh,qty,item.version))throw new Error('Cupos, precio o condiciones cambiaron. Vuelve a seleccionar la actividad.');put(item.sectionId,fresh,qty,item.version);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo verificar la actividad.');}finally{setBusy(false);}
  }
  return <article className="paid-activity-preview paid-cart-item rounded-xl border border-[var(--border)] p-4" data-page-panel>
    <header className="paid-cart-head">
      <div className="paid-cart-symbol" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h3m3 0h3"/></svg></div>
      <div className="paid-cart-title"><span className="paid-cart-kind">{quote?.tipo==='servicio'?'Servicio':quote?.tipo==='taller'?'Taller':'Actividad'} · Sin despacho</span><strong>{item.title}</strong><p>{formatActivityDate(item.start,item.zone)}</p></div>
      <button className="paid-cart-remove" type="button" disabled={busy} aria-label={`Eliminar ${item.title} del carrito`} onClick={()=>remove(item.sectionId)}>Eliminar</button>
    </header>
    <p className="paid-cart-status" role="status">{error||(!quote?'Verificando disponibilidad…':quote.version!==item.version?'Las condiciones cambiaron. Elimina y vuelve a seleccionar la actividad.':!valid?`${paidStatusLabel[quote.estado]} · ${quote.cupos_disponibles} cupos. Revisa tu selección.`:`${quote.cupos_disponibles} cupos disponibles · Se confirman al finalizar la compra`)}</p>
    <div className="paid-cart-bottom">
      <div><span className="paid-cart-label">Participantes</span><div className="paid-cart-stepper" aria-label={`Participantes de ${item.title}`}><button type="button" aria-label={item.quantity===1?'Quitar último participante y eliminar actividad':'Quitar un participante'} disabled={busy} onClick={()=>update(-1)}>−</button><output aria-live="polite">{item.quantity}</output><button type="button" aria-label="Agregar participante" disabled={!valid||busy||item.quantity>=(quote?.cupos_disponibles??0)} onClick={()=>update(1)}>+</button></div></div>
      <div className="paid-cart-price"><strong>{formatPrice(item.quantity*item.price)}</strong><small>{formatPrice(item.price)} por participante</small></div>
    </div>
    <small>Si quitas el último participante, la actividad se elimina del carrito.</small>
  </article>;
}

export function ActivityCartRows({items}:{items:ActivityCartItem[]}){
  return <>{items.map(item=><ActivityRow key={item.sectionId} item={item}/>)}</>;
}
