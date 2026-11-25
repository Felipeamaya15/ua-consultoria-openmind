import { LoadingState } from '../../../shared/components/states';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { commerceRequest, type CommerceOptions } from '../../landing/services/commerceService';

type Cart = {id: number; email: string; estado: string; elegible: boolean; ultima_actividad: string; items: {nombre: string; cantidad: number}[]};
type History = {destinatario: string; estado: string; creado: string; codigo: string};
type Overview = {opciones: CommerceOptions; permitido: boolean; carritos: Cart[]; historial: History[]; correo: {envio_habilitado: boolean}};

export function CommerceSettings({active}: {active: boolean}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setError('');
    commerceRequest<Overview>('carritos-abandonados', 'GET', undefined, controller.signal).then(setData).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [active]);
  async function update(key: keyof CommerceOptions, value: boolean) {
    if (!data || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const opciones = await commerceRequest<CommerceOptions>('comercio', 'PATCH', {[key]: value});
      setData({...data, opciones}); setNotice('Configuración guardada.');
    } catch (cause) {setError((cause as Error).message);}
    finally {setBusy(false);}
  }
  return <div className="space-y-5 p-4">
    <h2 className="text-lg font-semibold">Carritos abandonados y solicitudes comerciales</h2>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data ? <LoadingState spacing="compact">Cargando configuración…</LoadingState> : <>
      <label className="flex gap-2"><input type="checkbox" checked={data.opciones.recordatorios} disabled={busy || (!data.permitido && !data.opciones.recordatorios)} onChange={e => void update('recordatorios', e.target.checked)} /> Recordatorios de carrito abandonado</label>
      <p className="text-sm">{!data.permitido ? 'El administrador del sistema mantiene deshabilitado el envío automatizado.' : !data.correo.envio_habilitado ? 'Configura y autoriza el correo del negocio antes de enviar.' : 'Envío permitido por el sistema.'} Solo se consideran clientes con consentimiento, después de dos horas sin actividad y sin compras iniciadas. Se respeta la frecuencia del sistema y la baja por correo.</p>
      <label className="flex gap-2"><input type="checkbox" checked={data.opciones.cotizaciones} disabled={busy} onChange={e => void update('cotizaciones', e.target.checked)} /> Recibir cotizaciones por mayor en los productos</label>
      <p className="text-sm">Revísalas y respóndelas en <Link to="/emprendedor/actividades?tipo=consulta" className="underline">Consultas de actividades y productos</Link>.</p>
      <label className="flex gap-2"><input type="checkbox" checked={data.opciones.factura} disabled={busy} onChange={e => void update('factura', e.target.checked)} /> Recibir solicitudes de factura en el checkout</label>
      <p className="text-sm">Los datos quedan asociados al pedido. La emisión se realiza mediante tu sistema tributario autorizado.</p>
      <h3 className="font-semibold">Últimos carritos (hasta 100)</h3>
      {!data.carritos.length && <p>No hay carritos registrados.</p>}
      {data.carritos.map(row => <article key={row.id} className="border rounded p-3"><p>{row.email} · {row.elegible ? 'Elegible' : row.estado}</p><p className="text-sm">{row.items.map(item => `${item.nombre} × ${item.cantidad}`).join(', ')}</p><time>{new Date(row.ultima_actividad).toLocaleString('es-CL')}</time></article>)}
      <h3 className="font-semibold">Historial de recordatorios (hasta 100)</h3>
      {!data.historial.length && <p>No hay envíos registrados.</p>}
      {data.historial.map((row, index) => <p key={index}>{row.destinatario} · {row.estado} · {new Date(row.creado).toLocaleString('es-CL')}</p>)}
    </>}
  </div>;
}
