import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Select } from '../components/ui';
import RecentOrders from '../components/dashboard/RecentOrders';
import Reports from '../components/dashboard/Reports';
import { DashboardMetrics, type DashboardState } from '../components/dashboard/DashboardMetrics';
import { getDashboard, type DashboardPeriod } from '../services/dashboardService';
export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const periodValue = params.get('periodo');
  const period: DashboardPeriod = periodValue === '7' || periodValue === 'year' ? periodValue : '30';
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getDashboard(period, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: 'ready', data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'No se pudieron consultar las estadísticas.' });
    });
    return () => controller.abort();
  }, [period, attempt]);
  return <div className="space-y-6 animate-fade-in">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2">Análisis comercial</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">Resumen de la Tienda</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Ventas, pedidos y actividad de tu negocio en un solo lugar.</p></div>
      <div className="w-full sm:w-52"><Select label="Período" value={period}
        onChange={event => {
          setState({ status: 'loading' });
          setParams(previous => { const next = new URLSearchParams(previous); next.set('periodo', event.target.value); return next; });
        }}
        options={[{ value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }, { value: 'year', label: 'Este año' }]} /></div>
    </div>
    <DashboardMetrics state={state} period={period} onRetry={() => setAttempt(value => value + 1)} />
    <RecentOrders />
    <Reports />
  </div>;
}
