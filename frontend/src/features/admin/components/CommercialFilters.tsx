import { useState, type FormEvent } from 'react';
import { chileanDateInput, formatBusinessDate } from '../services/businessTime';
import { validOrderDate } from '../services/orderNavigation';

type Props = {
  params: URLSearchParams;
  onApply: (next: URLSearchParams) => void;
  contacts?: boolean;
};

const field = 'w-full min-w-0 rounded-lg border border-[#dce3ef] bg-white px-3 py-2.5 text-sm text-[#0f1623] outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a6b]';

export default function CommercialFilters({ params, onApply, contacts = false }: Props) {
  const [q, setQ] = useState(params.get('q') || '');
  const [from, setFrom] = useState(formatBusinessDate(params.get('fecha_desde') || '') || '');
  const [to, setTo] = useState(formatBusinessDate(params.get('fecha_hasta') || '') || '');
  const [method, setMethod] = useState(params.get('metodo_pago') || '');
  const [consent, setConsent] = useState(params.get('consentimiento') || 'todos');
  const [expanded, setExpanded] = useState(Boolean(params.get('fecha_desde') || params.get('fecha_hasta') || params.get('metodo_pago') || params.get('consentimiento')));
  const [error, setError] = useState('');

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = chileanDateInput(from);
    const end = chileanDateInput(to);
    if ((start && !validOrderDate(start)) || (end && !validOrderDate(end)) || (start && end && start > end)) {
      setError('Indica un período válido en formato DD/MM/AAAA.');
      setExpanded(true);
      return;
    }
    setError('');
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim());
    if (start) next.set('fecha_desde', start);
    if (end) next.set('fecha_hasta', end);
    if (contacts && consent !== 'todos') next.set('consentimiento', consent);
    if (!contacts && method.trim()) next.set('metodo_pago', method.trim());
    onApply(next);
  }
  function clear() {
    setQ(''); setFrom(''); setTo(''); setMethod(''); setConsent('todos'); setError(''); setExpanded(false);
    onApply(new URLSearchParams());
  }
  return (
    <form onSubmit={apply} role="search" aria-label={contacts ? 'Filtrar contactos' : 'Filtrar ventas'} className="rounded-xl border border-[#dce3ef] bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="block min-w-0 flex-1 text-xs font-medium text-[#52617a]">
          {contacts ? 'Buscar contacto' : 'Buscar venta'}
          <input className={`mt-1 ${field}`} value={q} onChange={e => setQ(e.target.value)} maxLength={100} placeholder={contacts ? 'Correo electrónico' : 'Pedido, producto o SKU'} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)} className="min-h-10 rounded-lg border border-[#dce3ef] px-3 text-sm font-medium hover:bg-[#f4f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3a6b]">
            {expanded ? 'Ocultar filtros' : 'Más filtros'}
          </button>
          <button type="submit" className="min-h-10 rounded-lg bg-[#1a3a6b] px-4 text-sm font-semibold text-white hover:bg-[#10294d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3a6b]">Buscar</button>
          <button type="button" onClick={clear} className="min-h-10 rounded-lg px-2 text-sm text-[#52617a] underline-offset-2 hover:underline">Limpiar</button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 grid gap-3 border-t border-[#e7eaf1] pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-medium text-[#52617a]">{contacts ? 'Último pedido desde' : 'Desde'} (DD/MM/AAAA)
            <input className={`mt-1 ${field}`} placeholder="DD/MM/AAAA" inputMode="numeric" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-[#52617a]">{contacts ? 'Último pedido hasta' : 'Hasta'} (DD/MM/AAAA)
            <input className={`mt-1 ${field}`} placeholder="DD/MM/AAAA" inputMode="numeric" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          {contacts ? (
            <label className="block text-xs font-medium text-[#52617a]">Consentimiento comercial
              <select className={`mt-1 ${field}`} value={consent} onChange={e => setConsent(e.target.value)}>
                <option value="todos">Todos los contactos</option><option value="autorizado">Autorizado expresamente</option><option value="retirado">Autorización retirada</option><option value="sin_registro">Sin autorización registrada</option>
              </select>
            </label>
          ) : (
            <label className="block text-xs font-medium text-[#52617a]">Método de pago
              <input className={`mt-1 ${field}`} maxLength={50} value={method} onChange={e => setMethod(e.target.value)} placeholder="Ej.: Transferencia" />
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </form>
  );
}
