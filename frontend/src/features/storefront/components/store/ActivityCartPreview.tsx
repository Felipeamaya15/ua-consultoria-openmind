import { CartLineItem } from './CartLineItem';
import { QuantityControl } from './QuantityControl';
import { useFeedback } from '../../../../shared/components/FeedbackProvider';
import { useEffect,useState } from 'react';
import { useActivityCart,type ActivityCartItem } from '../../context/activityCart';
import { fetchPaidQuote,canSelectPaidQuote,formatActivityDate,paidStatusLabel,type PaidQuote } from '../../../landing/services/paidActivityService';
import '../../../landing/components/activity-purchase-preview.css';

function ActivityRow({item}:{item:ActivityCartItem}){
  const uiFeedback = useFeedback();

  const {put,remove,reduce}=useActivityCart();
  const [quote,setQuote]=useState<PaidQuote|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;let current:AbortController|null=null;
    const refresh=()=>{current?.abort();const c=new AbortController();current=c;fetchPaidQuote(item.sectionId,c.signal).then(q=>{if(active&&!c.signal.aborted){setQuote(q);setError('');}}).catch(()=>{if(active&&!c.signal.aborted){setQuote(null);setError('No se pudo verificar esta actividad.');}});};
    refresh();const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);
    return()=>{active=false;current?.abort();window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[item.sectionId]);
  const valid=!!quote&&canSelectPaidQuote(quote,item.quantity,item.version);
  const requestRemoval=async ()=>{if((await uiFeedback.confirm({title:"Quitar taller o servicio",confirmLabel:"Quitar del carrito",message:`¿Eliminar ${item.title} del carrito?`})))remove(item.sectionId);};
  async function update(delta:number){
    if(busy)return;
    if(delta<0){if(item.quantity===1)requestRemoval();else reduce(item.sectionId);return;}
    const qty=item.quantity+delta;if(qty<1)return;
    setBusy(true);setError('');
    try{const fresh=await fetchPaidQuote(item.sectionId);setQuote(fresh);if(!canSelectPaidQuote(fresh,qty,item.version))throw new Error('Cupos, precio o condiciones cambiaron. Vuelve a seleccionar la actividad.');await put(item.sectionId,fresh,qty,item.version);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo verificar la actividad.');}finally{setBusy(false);}
  }
  return <CartLineItem kind="activity" label={(quote?.tipo==='servicio'?'Servicio':quote?.tipo==='taller'?'Taller':'Actividad')+' · Sin despacho'} title={item.title} media={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/></svg>} details={<p>{item.recorded?`Grabación · ${item.accessDays} días de acceso desde el pago`:formatActivityDate(item.start,item.zone)}</p>} status={<><p className="cart-line-status" role="status">{error||(!quote?'Verificando disponibilidad…':quote.version!==item.version?'Las condiciones cambiaron. Elimina y vuelve a seleccionar la actividad.':!valid?`${paidStatusLabel[quote.estado]} · ${quote.cupos_disponibles} cupos. Revisa tu selección.`:`${quote.cupos_disponibles} cupos disponibles · Se confirman al finalizar la compra`)}</p><small>Si quitas el último participante, la actividad se elimina del carrito.</small></>} controls={<><span className="cart-line-label">Participantes</span><QuantityControl className="cart-line-quantity" value={item.quantity} label={`Participantes de ${item.title}`} allowRemoval disabled={busy} decreaseLabel={item.quantity===1?'Quitar último participante y eliminar actividad':'Quitar un participante'} increaseLabel="Agregar participante" onDecrease={()=>update(-1)} onIncrease={()=>update(1)} increaseDisabled={!valid||item.quantity>=(quote?.cupos_disponibles??0)}/></>} price={item.quantity*item.price} unitPrice={item.price} unitLabel="participante" onRemove={requestRemoval} removeLabel={`Eliminar ${item.title} del carrito`} disabled={busy}/>;
}

export function ActivityCartRows({items}:{items:ActivityCartItem[]}){
  return <>{items.map(item=><ActivityRow key={item.sectionId} item={item}/>)}</>;
}
