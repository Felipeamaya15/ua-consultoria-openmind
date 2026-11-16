import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivityCart } from '../../storefront/context/activityCart';
import { useStorefrontTemplate } from '../../storefront/hooks/useStorefrontTemplate';
import { formatPrice } from '../../storefront/data/mockData';
import { fetchPaidQuote,canSelectPaidQuote,formatActivityDate,paidStatusLabel,type PaidQuote } from '../services/paidActivityService';
import './activity-purchase-preview.css';

export function ActivityPurchasePreview({sectionId}:{sectionId:string}){
  const {route}=useStorefrontTemplate();
  const {items,put,ready}=useActivityCart();
  const [quote,setQuote]=useState<PaidQuote|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [quantity,setQuantity]=useState(1),[accepted,setAccepted]=useState(''),[busy,setBusy]=useState(false),[expired,setExpired]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{
      if(request.current)return;
      const controller=new AbortController();request.current=controller;
      try{const q=await fetchPaidQuote(sectionId,controller.signal);if(active){setQuote(q);setError('');setExpired(Date.parse(q.hora_servidor)>=Date.parse(q.cierre));}}
      catch(e){if(active&&!controller.signal.aborted){setQuote(null);setError(e instanceof Error?e.message:'Actividad no disponible.');}}
      finally{if(request.current===controller)request.current=null;}
    };
    void refresh();window.addEventListener('focus',refresh);const timer=window.setInterval(refresh,15000);
    return()=>{active=false;request.current?.abort();request.current=null;window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[sectionId]);
  useEffect(()=>{
    if(!quote)return;
    const ms=Date.parse(quote.cierre)-Date.parse(quote.hora_servidor);
    if(ms<=0){setExpired(true);return;}
    const timer=window.setTimeout(()=>setExpired(true),Math.min(ms,2147483647));
    return()=>window.clearTimeout(timer);
  },[quote]);
  async function add(){
    if(!quote||busy||expired||!ready||!canSelectPaidQuote(quote,quantity,accepted))return;
    setBusy(true);setNotice('');setError('');
    try{
      const fresh=await fetchPaidQuote(sectionId);setQuote(fresh);setExpired(Date.parse(fresh.hora_servidor)>=Date.parse(fresh.cierre));
      if(!canSelectPaidQuote(fresh,quantity,accepted))throw new Error('La disponibilidad o condiciones cambiaron. Revisa nuevamente antes de agregar.');
      put(sectionId,fresh,quantity,accepted);setNotice('Actividad agregada al carrito de prueba. Todavía no reserva cupos ni realiza cobros.');
    }catch(e){setError(e instanceof Error?e.message:'No pudimos agregar la actividad.');}
    finally{setBusy(false);}
  }
  const existing=items.find(i=>i.sectionId===sectionId);
  return <section className="paid-activity-preview" aria-label="Compra de actividad de prueba">
    <strong>Inscripción pagada · prueba local</strong>
    {!quote&&!error&&<p role="status">Consultando disponibilidad…</p>}
    {quote&&<>
      <p><strong>{formatPrice(quote.precio)}</strong> por participante</p>
      <p>{formatActivityDate(quote.inicio,quote.zona_horaria)} — {formatActivityDate(quote.termino,quote.zona_horaria)} ({quote.zona_horaria})</p>
      <p role="status">{expired&&quote.estado==='disponible'?'Inscripciones cerradas':paidStatusLabel[quote.estado]} · {quote.cupos_disponibles} cupos disponibles</p>
      <p>Cierre de ventas: {formatActivityDate(quote.cierre,quote.zona_horaria)}</p>
      {quote.estado==='disponible'&&!expired&&quote.cupos_disponibles>0&&<>
        <label>Participantes <input type="number" min={1} max={quote.cupos_disponibles} value={quantity} onChange={e=>{setQuantity(Number(e.target.value));setNotice('');}} /></label>
        <div className="paid-activity-terms"><strong>Condiciones de participación y devoluciones</strong>
          <p>Tolerancia de atraso: {quote.venta.tolerancia_minutos} minutos.</p>
          <p>{quote.venta.cancelacion==='anticipada'?`Anulación voluntaria anticipada: solicitar al menos ${quote.venta.cancelacion_horas} h antes.`:'Las solicitudes de anulación y devolución se evalúan individualmente.'}</p>
          {quote.condiciones.filter(Boolean).map((text,i)=><p key={`c${i}`}>{text}</p>)}
          {quote.requisitos.filter(Boolean).map((text,i)=><p key={`r${i}`}>{text}</p>)}
          <p>Estas condiciones no limitan los derechos legales del consumidor.</p>
          <label className="paid-activity-accept"><input type="checkbox" checked={accepted===quote.version} onChange={e=>setAccepted(e.target.checked?quote.version:'')} /> He leído y acepto las condiciones.</label>
        </div>
        <p><strong>Total estimado: {formatPrice(quote.precio*(Number.isSafeInteger(quantity)&&quantity>0&&quantity<=quote.cupos_disponibles?quantity:0))}</strong></p>
        <button className="paid-activity-action" type="button" disabled={!ready||busy||!canSelectPaidQuote(quote,quantity,accepted)} onClick={add}>{busy?'Verificando…':existing?'Actualizar participantes en carrito':'Agregar al carrito'}</button>
      </>}
    </>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {existing&&<Link to={route('carrito')}>Ver carrito ({existing.quantity} participantes) →</Link>}
    <small>Prueba local: no se cobra ni se reserva un cupo al agregar.</small>
  </section>;
}
