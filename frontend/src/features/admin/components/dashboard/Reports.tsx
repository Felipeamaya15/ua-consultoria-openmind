import { useEffect, useRef, useState } from 'react';
import { ErrorState } from '../../../../shared/components/states';
import { humanizeAdminError } from '../../utils/humanizeError';
import { AdminCard, Alert, Button, Select } from '../ui';
import { formatReportMoney } from '../../services/reportFormatting';
import { downloadReport, getReport, reportFilename, type SalesReport } from '../../services/reportService';
import { useCommercialExport } from '../../hooks/useCommercialHistory';
import { Link } from 'react-router-dom';

const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function Bars({ data, sales }: { data: SalesReport; sales: boolean }) {
  const maximum = Math.max(1, ...data.meses.map(r => sales ? Number(r.ventas) : r.pedidos));
  return <figure className="min-w-0"><figcaption className="font-semibold mb-4">{sales ? 'Ingresos confirmados (CLP)' : 'Cantidad de pedidos'}</figcaption>
    <div className="space-y-3">{data.meses.map(row => {
      const value = sales ? Number(row.ventas) : row.pedidos;
      return <div key={row.mes} className="text-xs"><div className="flex justify-between gap-2 mb-1"><span>{row.etiqueta}</span><strong>{sales ? formatReportMoney(row.ventas) : value}</strong></div>
        <div aria-hidden="true" className="h-2 rounded bg-[var(--muted)]"><div className="h-full rounded bg-[var(--primary)]" style={{ width: `${value / maximum * 100}%` }} /></div></div>;
    })}</div></figure>;
}
export function ReportResults({ data }: { data: SalesReport }) {
  return <div className="space-y-5">
    {!data.total_pedidos && <Alert variant="info">No hay pedidos en este período. Los importes y cantidades se muestran en cero.</Alert>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[
      ['Ingresos confirmados', formatReportMoney(data.total_ventas)], ['Total de pedidos', data.total_pedidos],
      ['Ticket promedio confirmado', data.ticket_promedio === null ? 'Sin pagos confirmados' : formatReportMoney(data.ticket_promedio)],
      ['Pedidos con pago confirmado', data.pedidos_pagados],
    ].map(([label, value]) => <AdminCard key={label}><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className="text-lg font-bold mt-2 break-words">{value}</p></AdminCard>)}</div>
    <AdminCard><div className="grid md:grid-cols-2" style={{ gap: '2rem' }}><Bars data={data} sales /><Bars data={data} sales={false} /></div></AdminCard>
    <AdminCard><h3 className="font-semibold mb-4">Distribución de pedidos por estado</h3><dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3">{data.distribucion_estados.map(row => <div key={row.estado} className="flex justify-between gap-3 text-sm"><dt>{row.etiqueta}</dt><dd className="font-semibold">{row.pedidos}</dd></div>)}</dl></AdminCard>
    {!data.mes && <AdminCard><h3 className="font-semibold mb-3">Actividad destacada</h3>{(['ventas', 'pedidos'] as const).map(key => <p key={key} className="text-sm mb-2">Meses con más {key}: <strong>{data.mejores_meses[key].map(m => months[m - 1]).join(', ') || 'Sin actividad'}</strong></p>)}<p className="text-xs text-[var(--muted-foreground)]">Se muestran todos los meses empatados en el máximo.</p></AdminCard>}
    <AdminCard><div role="region" aria-label="Evolución mensual de ventas y pedidos" tabIndex={0} className="overflow-x-auto">
      <table className="w-full text-sm text-left"><caption className="text-left font-semibold mb-4">Evolución mensual · {data.anio}</caption>
        <thead><tr><th scope="col" className="p-2">Mes</th><th scope="col" className="p-2 text-right">Ventas (CLP)</th><th scope="col" className="p-2 text-right">Pedidos</th></tr></thead>
        <tbody>{data.meses.map(row => <tr key={row.mes} className="border-t border-[var(--border)]"><th scope="row" className="p-2 font-normal">{row.etiqueta}</th><td className="p-2 text-right whitespace-nowrap">{formatReportMoney(row.ventas)}</td><td className="p-2 text-right">{row.pedidos}</td></tr>)}</tbody>
        <tfoot><tr className="border-t font-bold"><th scope="row" className="p-2">Total</th><td className="p-2 text-right whitespace-nowrap">{formatReportMoney(data.total_ventas)}</td><td className="p-2 text-right">{data.total_pedidos}</td></tr></tfoot>
      </table></div></AdminCard>
    <p className="text-xs text-[var(--muted-foreground)]">{data.nota_fechas} Informe comercial; no constituye un documento tributario oficial.</p>
  </div>;
}
export default function Reports() {
  const [year, setYear] = useState<number>();
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<SalesReport | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const downloadController = useRef<AbortController | null>(null);
  const excel = useCommercialExport(`${year ?? ''}:${month ?? ''}:${attempt}`);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setDownloaded(false); setDownloadError('');
    getReport(year, month, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setYears(result.anios_disponibles); }
    }).catch(() => { if (!controller.signal.aborted) setError('No se pudo cargar el historial. Comprueba tu sesión y la conexión.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); downloadController.current?.abort(); };
  }, [year, month, attempt]);
  async function download() {
    if (!data) return;
    const controller = new AbortController(); downloadController.current = controller;
    setDownloading(true); setDownloadError(''); setDownloaded(false);
    try { await downloadReport(data.anio, data.mes, controller.signal); if (!controller.signal.aborted) setDownloaded(true); }
    catch { if (!controller.signal.aborted) setDownloadError('No se pudo descargar el PDF. Intenta nuevamente.'); }
    finally { if (!controller.signal.aborted) setDownloading(false); }
  }
  return <section aria-labelledby="reports-title" className="commercial-section space-y-5 border-t border-[var(--border)] pt-6">
    <div><h2 id="reports-title" className="text-xl font-bold">Historial e informes</h2><p className="text-sm mt-2 text-[var(--muted-foreground)]">Consulta años anteriores y descarga informes comerciales de tu tienda.</p></div>
    <AdminCard><div className="flex flex-wrap items-end gap-4">
      <div className="w-full sm:w-40"><Select label="Año del informe" value={String(year ?? data?.anio ?? '')} disabled={!years.length || downloading || excel.busy} options={years.map(y => ({ value: String(y), label: String(y) }))} onChange={e => setYear(Number(e.target.value))} /></div>
      <div className="w-full sm:w-52"><Select label="Mes (opcional)" value={month ? String(month) : ''} disabled={downloading || excel.busy} options={[{ value: '', label: 'Todo el año' }, ...months.map((m, i) => ({ value: String(i + 1), label: m }))]} onChange={e => setMonth(e.target.value ? Number(e.target.value) : null)} /></div>
      <Button type="button" disabled={loading || !!error || !data || downloading || excel.busy} onClick={() => void download()}>{downloading ? 'Generando PDF...' : 'Descargar informe PDF'}</Button>
      <Button type="button" variant="outline" disabled={loading || !!error || !data || downloading || excel.busy} onClick={() => { if (data) { const p = new URLSearchParams({ anio: String(data.anio) }); if (data.mes) p.set('mes', String(data.mes)); void excel.download('informes/xlsx/', p, reportFilename(data.anio, data.mes).replace(/\.pdf$/, '.xlsx')); } }}>{excel.busy ? 'Generando Excel...' : 'Descargar informe Excel'}</Button>
    </div></AdminCard>
    <nav aria-label="Consultar históricos detallados" className="flex flex-wrap gap-5 text-sm underline"><Link to="/emprendedor/pedidos">Ver pedidos</Link><Link to="/emprendedor/ventas">Ver ventas</Link><Link to="/emprendedor/contactos">Contactos de clientes</Link></nav>
    {loading ? <p role="status">Consultando historial...</p> : error ? <ErrorState onRetry={() => setAttempt(n => n + 1)} retryLabel="Reintentar historial">{humanizeAdminError(error)}</ErrorState> : data && <ReportResults data={data} />}
    {downloadError && <div role="alert"><Alert variant="error">{downloadError}</Alert></div>}
    {downloaded && <p role="status" className="text-sm">Informe PDF descargado.</p>}
    {excel.message && <p role="status" className="text-sm">{excel.message}</p>}
    {excel.error && <p role="alert" className="text-red-700">{excel.error}</p>}
  </section>;
}
