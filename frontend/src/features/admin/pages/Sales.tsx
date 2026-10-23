import { Link, useSearchParams } from 'react-router-dom';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../utils/humanizeError';
import { AdminCard, Button } from '../components/ui';
import { HistoryPagination } from '../components/HistoryControls';
import CommercialFilters from '../components/CommercialFilters';
import { useCommercialHistory, useCommercialExport } from '../hooks/useCommercialHistory';
import { getSalesHistory, historyParams } from '../services/commercialService';
import { formatReportMoney } from '../services/reportFormatting';
import { formatBusinessDate } from '../services/businessTime';

const cell = 'px-3 py-3 text-left align-top text-sm';
const head = 'px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#52617a]';
const period = (value: string) => value.length === 7 ? value.split('-').reverse().join('/') : formatBusinessDate(value);

export default function Sales() {
  const [params, setParams] = useSearchParams();
  const queryKey = historyParams(params).toString();
  const view = params.get('vista') === 'historial' ? 'historial' : 'resumen';
  const result = useCommercialHistory(queryKey, getSalesHistory);
  const file = useCommercialExport(queryKey);
  const data = result.data;
  const update = (next: URLSearchParams) => { next.set('vista', view); setParams(next); };
  const switchView = (nextView: 'resumen' | 'historial') => {
    const next = new URLSearchParams(params);
    next.set('vista', nextView);
    setParams(next);
  };
  const units = data?.productos.reduce((sum, product) => sum + product.cantidad, 0) ?? 0;

  return (
    <section className="commercial-section space-y-4" aria-label="Administración de ventas">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-[#0f1623]">Ventas de tu tienda</h2>
          <p className="mt-1 text-sm text-[#52617a]">Operaciones con pago confirmado y sus productos.</p></div>
        <Button disabled={result.loading || !!result.error || file.busy} onClick={() => void file.download('ventas/exportar/', historyParams(params), 'historico-ventas.xlsx')}>
          {file.busy ? 'Preparando Excel…' : 'Exportar Excel'}
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Vistas de ventas"
        className="flex gap-1 border-b border-[#dce3ef]"
      >
        {(['resumen', 'historial'] as const).map((option, index) => (
          <button
            key={option}
            id={`sales-tab-${option}`}
            type="button"
            role="tab"
            aria-selected={view === option}
            aria-controls={`sales-panel-${option}`}
            tabIndex={view === option ? 0 : -1}
            className={`min-h-11 border-b-2 px-4 text-sm font-semibold
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[#1a3a6b] ${
                view === option
                  ? 'border-[#1a3a6b] text-[#1a3a6b]'
                  : 'border-transparent text-[#52617a] hover:text-[#1a3a6b]'
              }`}
            onClick={() => switchView(option)}
            onKeyDown={(event) => {
              let target = index;

              if (event.key === 'ArrowRight') target = (index + 1) % 2;
              else if (event.key === 'ArrowLeft') target = (index + 1) % 2;
              else if (event.key === 'Home') target = 0;
              else if (event.key === 'End') target = 1;
              else return;

              event.preventDefault();
              const nextView = target === 0 ? 'resumen' : 'historial';
              switchView(nextView);
              requestAnimationFrame(() => {
                document.getElementById(`sales-tab-${nextView}`)?.focus();
              });
            }}
          >
            {option === 'resumen' ? 'Resumen de ventas' : 'Historial de ventas'}
          </button>
        ))}
      </div>

      <CommercialFilters key={queryKey} params={params} onApply={update} />
      {file.message && <p role="status" className="text-sm text-[#1a3a6b]">{file.message}</p>}
      {file.error && <p role="alert" className="text-sm text-red-700">{file.error}</p>}
      {result.loading && <LoadingState size="sm" align="start" spacing="compact">Cargando ventas…</LoadingState>}
      {result.error && <ErrorState onRetry={result.retry}>{humanizeAdminError(result.error)}</ErrorState>}

      {data && (
        <div
          id={`sales-panel-${view}`}
          role="tabpanel"
          aria-labelledby={`sales-tab-${view}`}
          tabIndex={0}
          className="space-y-4"
        >
          {view === 'resumen' ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ['Total vendido', formatReportMoney(data.resumen.total_vendido)],
                  ['Ventas confirmadas', String(data.resumen.cantidad_ventas)],
                  ['Ticket promedio', formatReportMoney(data.resumen.ticket_promedio)],
                ].map(([name, value]) => (
                  <AdminCard key={name}><p className="text-xs font-medium text-[#52617a]">{name}</p><p className="mt-2 text-xl font-bold text-[#152c54]">{value}</p></AdminCard>
                ))}
              </div>
              <AdminCard>
                <div className="mb-3 flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Productos más vendidos</h3><span className="text-xs text-[#52617a]">Hasta 10 productos o SKU</span></div>
                {!data.productos.length ? <EmptyListState align="start" spacing="compact">No hay líneas de productos disponibles para el período.</EmptyListState> : (
                  <div className="overflow-x-auto" role="region" aria-label="Productos más vendidos" tabIndex={0}>
                    <table className="w-full min-w-[440px] border-collapse"><thead className="bg-[#f6f8fc]"><tr><th scope="col" className={head}>Producto</th><th scope="col" className={head}>SKU</th><th scope="col" className={head}>Unidades</th><th scope="col" className={head}>Importe bruto</th></tr></thead>
                      <tbody>{data.productos.map((p, i) => <tr key={`${p.sku}-${i}`} className="border-t border-[#e7eaf1]"><th scope="row" className={`${cell} font-medium`}>{p.nombre}</th><td className={cell}>{p.sku || '—'}</td><td className={cell}>{p.cantidad}</td><td className={`${cell} whitespace-nowrap`}>{formatReportMoney(p.bruto_lineas)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </AdminCard>
              <div className="grid gap-3 lg:grid-cols-2">
                <AdminCard><h3 className="mb-4 font-semibold">Ventas confirmadas por período</h3>
                  {data.serie.length ? <div className="space-y-3">{data.serie.map(item => {
                    const max = Math.max(1, ...data.serie.map(v => Number(v.total_vendido)));
                    const width = Math.max(0, Math.min(100, Number(item.total_vendido) / max * 100));
                    return <div key={item.periodo} className="text-xs"><div className="mb-1 flex justify-between gap-3"><span>{period(item.periodo)}</span><strong>{formatReportMoney(item.total_vendido)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[#edf1f7]" aria-hidden="true"><div className="h-full rounded-full bg-[#44699f]" style={{ width: `${width}%` }} /></div></div>;
                  })}</div> : <EmptyListState align="start" spacing="compact">Sin ventas confirmadas en este período.</EmptyListState>}
                </AdminCard>
                <AdminCard><h3 className="mb-4 font-semibold">Detalle de ingresos</h3>
                  <dl className="space-y-3">{[
                    ['Bruto de productos', data.importes.bruto_productos], ['Descuentos', data.importes.descuentos],
                    ['Neto de productos', data.importes.neto_productos], ['Envíos', data.importes.envio],
                    ['Importe confirmado', data.importes.importe_confirmado],
                  ].map(([label, amount]) => <div key={label} className="flex justify-between gap-3 border-b border-[#edf1f7] pb-2 text-sm"><dt className="text-[#52617a]">{label}</dt><dd className="font-semibold">{formatReportMoney(amount)}</dd></div>)}</dl>
                  <p className="mt-3 text-xs text-[#52617a]">{data.importes.nota_descuentos}</p>
                  <p className="mt-2 text-xs text-[#52617a]">Unidades en los productos destacados: {units}. Para todos los productos consulta el histórico exportado.</p>
                </AdminCard>
              </div>
              <details className="rounded-xl border border-[#dce3ef] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Ver tabla por período</summary>
                <div className="mt-3 overflow-x-auto" role="region" aria-label="Tabla por período" tabIndex={0}><table className="w-full min-w-[400px]"><thead><tr><th className={head} scope="col">Período</th><th className={head} scope="col">Ventas</th><th className={head} scope="col">Total</th></tr></thead><tbody>{data.serie.map(p => <tr key={p.periodo} className="border-t"><th className={`${cell} font-normal`} scope="row">{period(p.periodo)}</th><td className={cell}>{p.cantidad_ventas}</td><td className={cell}>{formatReportMoney(p.total_vendido)}</td></tr>)}</tbody></table></div>
              </details>
            </>
          ) : (
            <AdminCard>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">Historial de ventas</h3><p className="text-xs text-[#52617a]">Fecha de creación del pedido, no fecha bancaria de pago.</p></div>
              {!data.ventas.length ? <EmptyListState>No hay ventas confirmadas para estos filtros.</EmptyListState> : (
                <div className="space-y-2">
                  {data.ventas.map(order => (
                    <details key={order.id_pedido} className="rounded-lg border border-[#e2e8f0] bg-white open:border-[#b7c7df]">
                      <summary className="cursor-pointer list-none p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3a6b] sm:p-4">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
                          <div><span className="font-semibold text-[#1a3a6b]">{order.identificador || `Pedido #${order.id_pedido}`}</span><p className="text-xs text-[#52617a]">{formatBusinessDate(order.fecha_creacion, true)}</p></div>
                          <div className="text-xs"><p>{order.metodo_pago || 'Método no registrado'}</p><p className="mt-1 text-[#52617a]">{order.estado_etiqueta || order.estado} · Pago confirmado</p></div>
                          <strong className="text-sm">{formatReportMoney(order.monto_total)} <span aria-hidden="true" className="ml-1 text-[#52617a]">⌄</span></strong>
                        </div>
                      </summary>
                      <div className="space-y-3 border-t border-[#e7eaf1] px-3 py-4 sm:px-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Descuento del pedido: <strong>{formatReportMoney(order.descuento)}</strong></span><Link className="font-semibold text-[#1a3a6b] underline" to={`/emprendedor/pedidos?pedido=${order.id_pedido}`}>Abrir pedido</Link></div>
                        {order.items.length ? <div className="overflow-x-auto" role="region" aria-label={`Productos del pedido ${order.identificador || order.id_pedido}`} tabIndex={0}><table className="w-full min-w-[580px]"><thead className="bg-[#f6f8fc]"><tr><th scope="col" className={head}>Producto / variante</th><th scope="col" className={head}>SKU</th><th scope="col" className={head}>Cantidad</th><th scope="col" className={head}>Precio</th><th scope="col" className={head}>Subtotal</th></tr></thead><tbody>{order.items.map(item => <tr key={item.id_item_pedido} className="border-t"><th scope="row" className={`${cell} font-normal`}>{item.nombre_producto}<span className="block text-xs text-[#52617a]">{Object.entries(item.atributos || {}).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span></th><td className={cell}>{item.sku || '—'}</td><td className={cell}>{item.cantidad}</td><td className={`${cell} whitespace-nowrap`}>{formatReportMoney(item.precio_unitario)}</td><td className={`${cell} whitespace-nowrap`}>{formatReportMoney(item.total_linea)}</td></tr>)}</tbody></table></div> : <p className="text-sm">Este pedido no tiene líneas históricas registradas.</p>}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              <HistoryPagination page={result.page} disabled={result.loading} onPage={n => { const next = new URLSearchParams(params); next.set('pagina', String(n)); setParams(next); }} />
            </AdminCard>
          )}
          {!!data.importes.pedidos_sin_lineas && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{data.importes.pedidos_sin_lineas} pedidos confirmados no cuentan con líneas históricas disponibles; su importe sigue incluido en el resumen.</p>}
        </div>
      )}
    </section>
  );
}
