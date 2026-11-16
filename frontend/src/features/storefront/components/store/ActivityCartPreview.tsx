import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivityCart,type ActivityCartItem } from '../../context/activityCart';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import { formatPrice } from '../../data/mockData';
import { fetchPaidQuote,canSelectPaidQuote,formatActivityDate,paidStatusLabel,type PaidQuote } from '../../../landing/services/paidActivityService';
import '../../../landing/components/activity-purchase-preview.css';

function ActivityRow({item}:{item:ActivityCartItem}){
  const {put,remove}=useActivityCart();
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
    const qty=item.quantity+delta;if(qty<1)return;
    setBusy(true);setError('');
    try{const fresh=await fetchPaidQuote(item.sectionId);setQuote(fresh);if(!canSelectPaidQuote(fresh,qty,item.version))throw new Error('Cupos, precio o condiciones cambiaron. Vuelve a seleccionar la actividad.');put(item.sectionId,fresh,qty,item.version);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo verificar la actividad.');}finally{setBusy(false);}
  }
  return <article className="paid-activity-preview" data-page-panel>
    <div className="paid-activity-row"><strong>{item.title}</strong><button type="button" aria-label={`Quitar ${item.title}`} onClick={()=>remove(item.sectionId)}>Eliminar</button></div>
    <p>{formatActivityDate(item.start,item.zone)} · Actividad, sin despacho</p>
    <p>{error||(!quote?'Verificando disponibilidad…':quote.version!==item.version?'Las condiciones cambiaron. Elimina y vuelve a seleccionar la actividad.':!valid?`${paidStatusLabel[quote.estado]} · ${quote.cupos_disponibles} cupos. Revisa tu selección.`:`${quote.cupos_disponibles} cupos disponibles (sin reserva)`)}</p>
    <div className="paid-activity-row"><span>Participantes: {item.quantity}</span><span>{formatPrice(item.quantity*item.price)}</span></div>
    <div className="paid-activity-row"><button type="button" disabled={!quote||quote.version!==item.version||item.quantity<=1||busy} onClick={()=>update(-1)}>− Quitar participante</button><button type="button" disabled={!valid||busy||item.quantity>=(quote?.cupos_disponibles??0)} onClick={()=>update(1)}>+ Agregar participante</button></div>
  </article>;
}
export function ActivityCartPreview(){
  const {items}=useActivityCart();const {route}=useStorefrontTemplate();
  if(!items.length)return null;
  return <section className="paid-cart-preview" aria-label="Actividades en el carrito"><h2>Servicios y talleres</h2><p>Selección de prueba local. Estos importes están separados de los productos físicos y todavía no se envían al pago.</p>
    {items.map(item=><ActivityRow key={item.sectionId} item={item}/>)}
    <p><strong>Subtotal estimado de actividades: {formatPrice(items.reduce((sum,i)=>sum+i.price*i.quantity,0))}</strong></p>
    <Link to={route()}>Volver a la tienda</Link>
  </section>;
}
