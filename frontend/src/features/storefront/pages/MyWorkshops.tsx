import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../api';
import { commerceRequest } from '../../landing/services/commerceService';
import { CustomerAccountNavigation } from '../components/store/CustomerAccountNavigation';

type Workshop = {pedido: number; reserva: string; titulo: string; hasta: string; grabacion: string};

export default function MyWorkshops() {
  const [rows, setRows] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Workshop | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    commerceRequest<Workshop[]>('mis-talleres', 'GET', undefined, controller.signal).then(setRows).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    }).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const remaining = Date.parse(selected.hasta) - Date.now();
    if (remaining <= 0) {setSelected(null); return;}
    const timer = window.setInterval(() => {if (Date.now() >= Date.parse(selected.hasta)) setSelected(null);}, 1000);
    return () => clearInterval(timer);
  }, [selected]);
  return <main className="max-w-4xl mx-auto p-5">
    <CustomerAccountNavigation /><h1 className="text-2xl mb-4">Mis talleres grabados</h1>
    {loading && <p role="status">Consultando accesos…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !rows.length && <p>No tienes grabaciones con pago confirmado y acceso vigente en esta tienda.</p>}
    {rows.map(row => <article key={`${row.pedido}-${row.reserva}`} className="border rounded p-4 mb-4"><h2>{row.titulo}</h2><p>Acceso hasta {new Date(row.hasta).toLocaleString('es-CL')}</p><button type="button" className="underline" onClick={() => {setError(''); setSelected(row);}}>Reproducir</button></article>)}
    {selected && <section className="relative" onContextMenu={event => event.preventDefault()}>
      <h2>{selected.titulo}</h2>
      <video key={`${selected.pedido}-${selected.reserva}`} controls controlsList="nodownload noremoteplayback" disablePictureInPicture crossOrigin="use-credentials" preload="metadata" className="w-full"
        src={`${API_BASE_URL}/api/landing/mis-talleres/${selected.pedido}/${selected.reserva}/video/`} onError={() => setError('No se pudo reproducir. Comprueba tu sesión y la vigencia del acceso.')} />
      <span className="absolute top-10 right-4 pointer-events-none text-white bg-black/50 px-2 text-xs">Acceso personal · Pedido {selected.pedido} · {selected.reserva.slice(0, 8)}</span>
      <p className="text-sm">Acceso personal sujeto a vigencia, estado del pago y devoluciones. No compartas tu sesión.</p>
    </section>}
  </main>;
}
