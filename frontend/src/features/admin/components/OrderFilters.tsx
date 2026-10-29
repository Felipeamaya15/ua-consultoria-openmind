import { useState } from 'react';
import { Button, Icon, Input, Select } from './ui';
import { chileanDateInput, formatBusinessDate } from '../services/businessTime';
import { ORDER_DATE_PRESETS, orderDateRange, selectedOrderDatePreset, validOrderDate, type OrderDatePreset } from '../services/orderNavigation';

type Change = (values: Record<string, string | null>) => void;

export function OrderFilters({ params, onChange, onClear, exportBusy, exportDisabled, onExport }: {
  params: URLSearchParams; onChange: Change; onClear: () => void;
  exportBusy: boolean; exportDisabled: boolean; onExport: () => void;
}) {
  const [query, setQuery] = useState(params.get('q') || '');
  const [method, setMethod] = useState(params.get('metodo_pago') || '');
  const [payment, setPayment] = useState(params.get('pago') || '');
  const [delivery, setDelivery] = useState(params.get('entrega') || '');
  const from = params.get('fecha_desde') || '', to = params.get('fecha_hasta') || '';
  const selected = selectedOrderDatePreset(from, to);
  const [custom, setCustom] = useState(selected === 'custom');
  const [start, setStart] = useState(formatBusinessDate(from) || from);
  const [end, setEnd] = useState(formatBusinessDate(to) || to);
  const [error, setError] = useState('');

  function apply(preset?: OrderDatePreset) {
    const range = preset ? orderDateRange(preset) : { from: chileanDateInput(start), to: chileanDateInput(end) };
    if ((range.from && !validOrderDate(range.from)) || (range.to && !validOrderDate(range.to)) || (range.from && range.to && range.from > range.to)) {
      setError('Indica un período válido con formato DD/MM/AAAA.'); return;
    }
    setError('');
    onChange({ q: query.trim() || null, metodo_pago: method.trim() || null, pago: payment || null, entrega: delivery || null,
      ...(preset || custom ? { fecha_desde: range.from || null, fecha_hasta: range.to || null, periodo: null } : {}) });
  }

  function clear() {
    setQuery(''); setMethod(''); setPayment(''); setDelivery('');
    setStart(''); setEnd(''); setCustom(false); setError(''); onClear();
  }

  return <form role="search" aria-label="Filtrar pedidos" className="admin-list-panel" onSubmit={event => { event.preventDefault(); apply(); }}>
    <div className="admin-list-panel-heading"><div><h3>Encuentra tus pedidos</h3><p>Busca una compra o elige el período que necesitas revisar.</p></div><Icon name="search" className="h-5 w-5 text-[var(--muted-foreground)]" /></div>
    <div className="orders-search-row">
      <Input id="orders-search" label="Buscar pedido, producto o SKU" icon={<Icon name="search" />} placeholder="Número de pedido, nombre, producto o SKU" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} />
      <Button type="submit" className="min-h-11">Buscar pedidos</Button>
    </div>
    <fieldset className="mt-5 min-w-0"><legend className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">Período del pedido</legend>
      <div className="orders-date-presets">
        {ORDER_DATE_PRESETS.map(preset => <button type="button" key={preset.id} aria-pressed={!custom && selected === preset.id} onClick={() => { setCustom(false); apply(preset.id); }}>{preset.label}</button>)}
        <button type="button" aria-pressed={custom} onClick={() => { setCustom(true); setError(''); }}>Personalizado</button>
      </div>
      {custom && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input id="orders-from" label="Desde (DD/MM/AAAA)" inputMode="numeric" placeholder="DD/MM/AAAA" value={start} onChange={event => setStart(event.target.value)} />
        <Input id="orders-to" label="Hasta (DD/MM/AAAA)" inputMode="numeric" placeholder="DD/MM/AAAA" value={end} onChange={event => setEnd(event.target.value)} />
      </div>}
    </fieldset>
    <div className="orders-advanced-filters">
      <Input id="orders-method" label="Método de pago" placeholder="Ej.: Transferencia" maxLength={50} value={method} onChange={event => setMethod(event.target.value)} />
      <Select label="Estado de pago" value={payment} onChange={event => setPayment(event.target.value)} options={[{ value: '', label: 'Todos los pagos' }, { value: 'confirmado', label: 'Confirmado' }, { value: 'pendiente', label: 'Pendiente' }, { value: 'cancelado', label: 'Cancelado' }]} />
      <Select label="Método de entrega" value={delivery} onChange={event => setDelivery(event.target.value)} options={[{ value: '', label: 'Todas las entregas' }, { value: 'retiro', label: 'Retiro en tienda' }, { value: 'envio', label: 'Envío' }]} />
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="admin-list-panel-footer">
      <div className="flex flex-wrap items-center gap-2"><Button type="submit" className="min-h-11">Aplicar filtros</Button><Button type="button" variant="ghost" className="min-h-11" onClick={clear}>Limpiar filtros</Button></div>
      <Button type="button" variant="outline" className="min-h-11" disabled={exportDisabled || exportBusy} onClick={onExport} icon={<Icon name="file" />}>{exportBusy ? 'Preparando Excel...' : 'Exportar pedidos Excel'}</Button>
    </div>
  </form>;
}
