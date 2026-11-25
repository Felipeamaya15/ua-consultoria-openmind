import { useState } from 'react';
import { Button, Input, Select } from './ui';
import { chileanDateInput, formatBusinessDate } from '../services/businessTime';
import { validOrderDate } from '../services/orderNavigation';
import type { Pagination } from '../services/commercialService';

export function HistoryPagination({ page, onPage, disabled = false }: { page: Pagination; onPage: (n: number) => void; disabled?: boolean }) {
  return <nav aria-label="Paginación del historial" className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
    <p role="status">{page.total} registros · Página {page.pagina} de {Math.max(1, page.total_paginas)}</p>
    <div className="flex gap-2"><Button variant="outline" disabled={disabled || page.pagina <= 1} onClick={() => onPage(page.pagina - 1)}>Anterior</Button>
      <Button variant="outline" disabled={disabled || page.pagina >= page.total_paginas} onClick={() => onPage(page.pagina + 1)}>Siguiente</Button></div>
  </nav>;
}

export function HistoryFilterForm({ params, onApply, contacts = false }: { params: URLSearchParams; onApply: (params: URLSearchParams) => void; contacts?: boolean }) {
  const [query, setQuery] = useState(params.get('q') || '');
  const [from, setFrom] = useState(formatBusinessDate(params.get('fecha_desde') || '') || '');
  const [to, setTo] = useState(formatBusinessDate(params.get('fecha_hasta') || '') || '');
  const [method, setMethod] = useState(params.get('metodo_pago') || '');
  const [consent, setConsent] = useState(params.get('consentimiento') || 'todos');
  const [error, setError] = useState('');
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault(); const start = chileanDateInput(from), end = chileanDateInput(to);
    if (start && !validOrderDate(start) || end && !validOrderDate(end) || start && end && start > end) { setError('Indica un período válido con formato DD/MM/AAAA.'); return; }
    setError(''); const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim()); if (start) next.set('fecha_desde', start); if (end) next.set('fecha_hasta', end);
    if (contacts && consent !== 'todos') next.set('consentimiento', consent); if (!contacts && method) next.set('metodo_pago', method);
    onApply(next);
  }}>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <Input id="history-search" label={contacts ? 'Buscar por email' : 'Buscar pedido, producto o SKU'} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} />
      <Input id="history-from" label={contacts ? 'Último pedido desde (DD/MM/AAAA)' : 'Desde (DD/MM/AAAA)'} placeholder="DD/MM/AAAA" inputMode="numeric" value={from} onChange={e => setFrom(e.target.value)} />
      <Input id="history-to" label={contacts ? 'Último pedido hasta (DD/MM/AAAA)' : 'Hasta (DD/MM/AAAA)'} placeholder="DD/MM/AAAA" inputMode="numeric" value={to} onChange={e => setTo(e.target.value)} />
      {contacts ? <Select label="Consentimiento comercial" value={consent} onChange={e => setConsent(e.target.value)} options={[{ value: 'todos', label: 'Todos los contactos' }, { value: 'autorizado', label: 'Autorizado expresamente' }, { value: 'retirado', label: 'Autorización retirada' }, { value: 'sin_registro', label: 'Sin autorización registrada' }]} />
        : <Input id="history-payment-method" label="Método de pago (opcional)" placeholder="Ej.: Transferencia" maxLength={50} value={method} onChange={e => setMethod(e.target.value)} />}
    </div>
    <div className="flex gap-2"><Button type="submit">Aplicar filtros</Button><Button type="button" variant="outline" onClick={() => { setQuery(''); setFrom(''); setTo(''); setMethod(''); setConsent('todos'); setError(''); onApply(new URLSearchParams()); }}>Limpiar filtros</Button></div>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
  </form>;
}
