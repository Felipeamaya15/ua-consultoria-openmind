import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivityCart } from '../../storefront/context/activityCart';
import { useStorefrontTemplate } from '../../storefront/hooks/useStorefrontTemplate';
import { formatPrice } from '../../storefront/data/mockData';
import { fetchPaidQuote,canSelectPaidQuote,formatActivityDate,paidStatusLabel,type PaidQuote } from '../services/paidActivityService';
import './activity-purchase-preview.css';
import {useActivityPurchaseMode} from '../services/activityPurchaseMode';

export function ActivityPurchasePreview({sectionId}:{sectionId:string}){
  const {route}=useStorefrontTemplate();
  const mode=useActivityPurchaseMode();
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
    if(mode==='disabled'||!quote||busy||expired||!ready||!canSelectPaidQuote(quote,quantity,accepted))return;
    setBusy(true);setNotice('');setError('');
    try{
      const fresh=await fetchPaidQuote(sectionId);setQuote(fresh);setExpired(Date.parse(fresh.hora_servidor)>=Date.parse(fresh.cierre));
      if(!canSelectPaidQuote(fresh,quantity,accepted))throw new Error('La disponibilidad o condiciones cambiaron. Revisa nuevamente antes de agregar.');
      put(sectionId,fresh,quantity,accepted);setNotice('Actividad agregada a tu carrito. Los cupos aún no están reservados.');
    }catch(e){setError(e instanceof Error?e.message:'No pudimos agregar la actividad.');}
    finally{setBusy(false);}
  }
  const existing=items.find(i=>i.sectionId===sectionId);
  useEffect(()=>{setQuantity(existing?.quantity??1);},[sectionId,existing?.quantity]);
  const available=!!quote&&quote.estado==='disponible'&&!expired&&quote.cupos_disponibles>0;
  const validQuantity=!!quote&&Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=quote.cupos_disponibles;
  const typeLabel=quote?.tipo==='servicio'?'Servicio':'Taller';
  const countLabel=quote?.tipo==='servicio'?'Selecciona la cantidad de participantes':'¿Cuántas personas asistirán?';
  if(mode==='disabled')return null;
  return <section className="paid-activity-preview paid-purchase-card" aria-label="Reserva de actividad">
    <header className="paid-purchase-heading">
      <span className="paid-purchase-eyebrow">{typeLabel} · Reserva online</span>
      <h3>{quote?.tipo==='servicio'?'Reserva tu servicio':'Reserva tu cupo'}</h3>
      <p>Selecciona los participantes y agrega la actividad a tu carrito.</p>
    </header>
    {!quote&&!error&&<p role="status">Consultando disponibilidad…</p>}
    {quote&&<>
      <div className="paid-purchase-overview">
        <div className="paid-purchase-cost"><span>Precio por participante</span><strong>{formatPrice(quote.precio)}</strong><small>Sin despacho</small></div>
        <div className={`paid-purchase-stock ${available?'is-available':'is-unavailable'}`} role="status"><span>{expired&&quote.estado==='disponible'?'Inscripciones cerradas':paidStatusLabel[quote.estado]}</span><strong>{quote.cupos_disponibles} {quote.cupos_disponibles===1?'cupo disponible':'cupos disponibles'}</strong></div>
      </div>
      <div className="paid-purchase-dates">
        <div><span>Inicio</span><strong>{formatActivityDate(quote.inicio,quote.zona_horaria)}</strong></div>
        <div><span>Término</span><strong>{formatActivityDate(quote.termino,quote.zona_horaria)}</strong></div>
        <div className="paid-purchase-deadline"><span>Cierre de ventas</span><strong>{formatActivityDate(quote.cierre,quote.zona_horaria)}</strong><small>{quote.zona_horaria}</small></div>
      </div>
      {available&&<>
        <div className="paid-purchase-select"><div><strong>Participantes</strong><small>{countLabel}</small></div>
          <div className="paid-cart-stepper" aria-label="Cantidad de participantes">
            <button type="button" aria-label="Disminuir participantes" disabled={busy||quantity<=1} onClick={()=>{setQuantity(n=>Math.max(1,n-1));setNotice('');}}>−</button>
            <output aria-live="polite">{quantity}</output>
            <button type="button" aria-label="Aumentar participantes" disabled={busy||quantity>=quote.cupos_disponibles} onClick={()=>{setQuantity(n=>Math.min(quote.cupos_disponibles,n+1));setNotice('');}}>+</button>
          </div>
        </div>
        {!validQuantity&&<p role="alert">La disponibilidad cambió. Ajusta la cantidad de participantes.</p>}
        <div className="paid-activity-terms paid-purchase-terms"><strong>Condiciones de participación y devoluciones</strong>
          <p>Tolerancia de atraso: {quote.venta.tolerancia_minutos} minutos.</p>
          <p>{quote.venta.cancelacion==='anticipada'?`Anulación voluntaria anticipada: solicitar al menos ${quote.venta.cancelacion_horas} h antes.`:'Las solicitudes de anulación y devolución se evalúan individualmente.'}</p>
          {quote.condiciones.filter(Boolean).map((text,i)=><p key={`c${i}`}>{text}</p>)}
          {quote.requisitos.filter(Boolean).map((text,i)=><p key={`r${i}`}>{text}</p>)}
          <p>Estas condiciones no limitan los derechos legales del consumidor.</p>
          <label className="paid-activity-accept"><input type="checkbox" checked={accepted===quote.version} onChange={e=>setAccepted(e.target.checked?quote.version:'')} /> He leído y acepto las condiciones.</label>
        </div>
        <div className="paid-purchase-total"><div><span>Total estimado</span><small>{quantity} {quantity===1?'participante':'participantes'}</small></div><strong>{formatPrice(quote.precio*(validQuantity?quantity:0))}</strong></div>
        <button className="paid-activity-action" type="button" disabled={!ready||busy||!validQuantity||!canSelectPaidQuote(quote,quantity,accepted)} onClick={add}>{busy?'Verificando…':existing?'Actualizar carrito':'Agregar al carrito'}</button>
      </>}
    </>}
    {error&&<p role="alert">{error}</p>}{notice&&<p className="paid-purchase-notice" role="status">{notice}</p>}
    {existing&&<Link className="paid-purchase-cart-link" to={route('carrito')}>Ver carrito ({existing.quantity} {existing.quantity===1?'participante':'participantes'}) →</Link>}
    <small className="paid-purchase-test-note">Agregar al carrito no reserva cupos ni realiza cobros. La disponibilidad se verifica al registrar el pedido.</small>
  </section>;
}
