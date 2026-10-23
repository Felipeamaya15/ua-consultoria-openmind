import { useEffect, useState } from 'react';
import { EmptyListState, ErrorState, LoadingState } from '../../../../shared/components/states';
import { humanizeAdminError } from '../../utils/humanizeError';
import { Link } from 'react-router-dom';
import { formatPrice } from '../../data/mockAdminData';
import { displayDashboardDate } from '../../services/dashboardAnalytics';
import { getDailyHistory, type DailyRow } from '../../services/dailyHistoryService';
import { ordersDestination } from '../../services/orderNavigation';

export type DailyHistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: DailyRow[] };

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] rounded';
const panel = 'bg-white border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm min-w-0';

/** Tabla diaria de ventas y pedidos. */
export function DailyHistoryView({ state, period, onRetry }: { state: DailyHistoryState; period: string; onRetry: () => void }) {
  if (state.status === 'loading') return <LoadingState spacing="none" className="py-5">Cargando el historial…</LoadingState>;
  if (state.status === 'error') return <ErrorState className="mt-4" onRetry={onRetry} retryLabel="Reintentar historial">{humanizeAdminError(state.message)}</ErrorState>;
  if (state.rows.every(row => row.pedidos === 0 && Number(row.ventas) === 0)) return <EmptyListState align="start" spacing="none" className="py-5">No hay pedidos en el período seleccionado.</EmptyListState>;
  return <div className="overflow-x-auto max-h-96 mt-4" tabIndex={0} role="region" aria-label="Histórico diario">
    <table className="w-full text-left border-collapse text-sm"><caption className="sr-only">Ventas confirmadas y pedidos registrados por día</caption>
      <thead><tr className="border-b border-[var(--border)]"><th scope="col" className="p-3">Fecha</th><th scope="col" className="p-3 text-right">Ventas (CLP)</th><th scope="col" className="p-3 text-right">Pedidos</th></tr></thead>
      <tbody className="divide-y divide-[var(--border)]">{state.rows.map(row => <tr key={row.fecha}><td className="p-3 whitespace-nowrap"><Link to={ordersDestination(row.fecha, row.fecha, 'all', period)} aria-label={`Ver pedidos del ${displayDashboardDate(row.fecha)}`} className={`text-[var(--primary)] hover:underline ${focus}`}>{displayDashboardDate(row.fecha)} <span aria-hidden="true">→</span></Link></td><td className="p-3 text-right whitespace-nowrap">{formatPrice(Number(row.ventas))}</td><td className="p-3 text-right">{row.pedidos}</td></tr>)}</tbody>
    </table></div>;
}

/** Trae el histórico de los endpoints de ventas y pedidos solo cuando se abre el detalle. */
export default function DailyHistoryTable({ from, to, period }: { from: string; to: string; period: string }) {
  const [opened, setOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DailyHistoryState>({ status: 'loading' });
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    getDailyHistory(from, to, controller.signal)
      .then(rows => { if (!controller.signal.aborted) setState({ status: 'ready', rows }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'No se pudo consultar el historial.' }); });
    return () => controller.abort();
  }, [opened, from, to, attempt]);
  return <details className={panel} onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className={`cursor-pointer font-semibold text-sm ${focus}`}>Ver tabla diaria de ventas y pedidos</summary>
    <p className="text-xs text-[var(--muted-foreground)] mt-3">{displayDashboardDate(from)} al {displayDashboardDate(to)} · Hora de Chile · Fecha de registro del pedido</p>
    {opened && <DailyHistoryView state={state} period={period} onRetry={() => setAttempt(value => value + 1)} />}
  </details>;
}
