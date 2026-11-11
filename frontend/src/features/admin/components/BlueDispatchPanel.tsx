import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';

type Package = {weight: string; length: string; width: string; height: string};
type Shipment = {referencia?: string; estado: string; tracking: string; etiquetas: number; seguimiento?: {estado?: string; eventos?: {fecha_hora: string; descripcion: string}[]}};
const emptyPackage = (): Package => ({weight: '', length: '', width: '', height: ''});

export default function BlueDispatchPanel({orderId, paid}: {orderId: number; paid: boolean}) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [packages, setPackages] = useState<Package[]>([emptyPackage()]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState('');
  const endpoint = `${API_BASE_URL.replace(/\/+$/, '')}/api/logistica/blue/pedidos/${orderId}/`;
  function headers() {
    const token = authService.getToken();
    if (!token) throw new Error('Inicia sesión como propietario.');
    return {Authorization: `Token ${token}`, 'Content-Type':'application/json'};
  }
  async function request(body?: object, signal?: AbortSignal): Promise<Shipment> {
    const response = await fetch(endpoint, {method: body ? 'POST' : 'GET', headers:headers(), cache:'no-store', signal,
      ...(body ? {body:JSON.stringify(body)} : {})});
    let json;
    try {json = await response.json();} catch {throw new Error('Respuesta inválida del servidor.');}
    if (!response.ok || json.exito !== true) throw new Error(json.mensaje || 'No se pudo completar la operación.');
    if (!json.data || typeof json.data.estado !== 'string' || typeof json.data.tracking !== 'string'
      || !Number.isSafeInteger(json.data.etiquetas)) throw new Error('Respuesta de despacho inválida.');
    return json.data;
  }
  useEffect(() => {
    const controller = new AbortController();
    request(undefined, controller.signal).then(setShipment).catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el despacho.');});
    return () => controller.abort();
  }, [orderId]);
  async function action(accion: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {setShipment(await request({accion, ...(accion === 'emitir' ? {bultos:packages} : {}), ...(accion === 'conciliar' ? {tracking} : {})}));}
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
      try {setShipment(await request());} catch { /* Conservar el mensaje original. */ }
    } finally {setBusy(false);}
  }
  async function download(index: number) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${endpoint}etiquetas/${index}/`, {headers:headers(),cache:'no-store'});
      if (!response.ok || !response.headers.get('Content-Type')?.includes('application/pdf')) throw new Error('No se pudo descargar la etiqueta.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');link.href=url;link.download=`blue-${shipment?.tracking}-${index+1}.pdf`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'No se pudo descargar la etiqueta.');}
    finally {setBusy(false);}
  }
  const canPrepare = shipment && ['sin_emitir','draft'].includes(shipment.estado);
  const valid = packages.every(row=>Object.values(row).every(v=>v.trim()!=='' && Number.isFinite(Number(v)) && Number(v)>0));
  return <section className="border rounded-lg p-3 space-y-3" aria-label="Despacho Blue Express">
    <h3 className="font-semibold">Despacho Blue Express</h3>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!shipment && <button type="button" onClick={()=>{setError('');request().then(setShipment).catch(cause=>setError(String(cause)));}}>Volver a cargar despacho</button>}
    {canPrepare && <>
      {!paid && <p>Primero confirma el pago del pedido.</p>}
      <p className="text-sm">Declara las medidas reales de los bultos preparados. La emisión no incluye cobertura extendida ni cobro al destinatario.</p>
      {packages.map((row,index)=><fieldset key={index} disabled={busy || !paid} className="grid grid-cols-2 gap-2 border p-2">
        <legend>Bulto {index+1}</legend>
        {(['weight','length','width','height'] as const).map(key=><label key={key} className="text-sm">
          {{weight:'Peso (kg)',length:'Largo (cm)',width:'Ancho (cm)',height:'Alto (cm)'}[key]}
          <input className="border rounded p-1 w-full" type="number" min="0.001" step="any" value={row[key]} onChange={event=>setPackages(current=>current.map((item,i)=>i===index?{...item,[key]:event.target.value}:item))}/>
        </label>)}
        {packages.length>1 && <button type="button" onClick={()=>setPackages(current=>current.filter((_,i)=>i!==index))}>Quitar bulto</button>}
      </fieldset>)}
      <button type="button" disabled={busy || !paid || packages.length>=100} onClick={()=>setPackages(current=>[...current,emptyPackage()])}>Agregar bulto</button>
      <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy || !paid}/> Confirmo que el embalaje, la dirección y el teléfono del pedido son correctos.</label>
      <button type="button" className="border rounded p-2 disabled:opacity-50" disabled={busy || !paid || !confirmed || !valid} onClick={()=>void action('emitir')}>{busy?'Procesando…':'Emitir despacho en Blue'}</button>
    </>}
    {shipment && ['unknown','submitting'].includes(shipment.estado) && <>
      <p>Referencia que debes buscar en Blue: <strong>{shipment.referencia}</strong></p>
      <p>La emisión está pendiente de confirmación. Revisa Blue antes de actuar; no se enviará una segunda orden automáticamente.</p>
      <label className="block">Tracking encontrado en Blue<input className="border p-1 w-full" value={tracking} onChange={e=>setTracking(e.target.value)} inputMode="numeric"/></label>
      <button type="button" disabled={busy || !/^\d{1,30}$/.test(tracking)} onClick={()=>void action('conciliar')}>Verificar y asociar despacho existente</button>
    </>}
    {shipment?.estado==='emitted' && <>
      <p>Tracking: <strong>{shipment.tracking}</strong></p>
      {Array.from({length:shipment.etiquetas},(_,i)=><button key={i} type="button" disabled={busy} onClick={()=>void download(i)} className="block underline">Descargar etiqueta {i+1}</button>)}
      <button type="button" disabled={busy} onClick={()=>void action('etiquetas')}>Recuperar etiquetas</button>{' '}
      <button type="button" disabled={busy} onClick={()=>void action('seguimiento')}>Actualizar seguimiento</button>
      {shipment.seguimiento?.estado && <p>Estado en Blue: {shipment.seguimiento.estado}</p>}
      <ul>{shipment.seguimiento?.eventos?.map((event,i)=><li key={i}>{event.fecha_hora} — {event.descripcion}</li>)}</ul>
    </>}
  </section>;
}
