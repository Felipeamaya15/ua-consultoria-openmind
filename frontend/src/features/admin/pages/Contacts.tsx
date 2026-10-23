import { useEffect, useRef, useState } from 'react';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../utils/humanizeError';
import { useSearchParams } from 'react-router-dom';
import { AdminCard, Button } from '../components/ui';
import { HistoryPagination } from '../components/HistoryControls';
import CommercialFilters from '../components/CommercialFilters';
import { useCommercialHistory, useCommercialExport } from '../hooks/useCommercialHistory';
import { getContacts, type Contact } from '../services/commercialService';
import { formatBusinessDate } from '../services/businessTime';

const consentLabels: Record<Contact['consentimiento'], string> = {
  autorizado: 'Autorizado expresamente',
  retirado: 'Autorización retirada',
  sin_registro: 'Sin autorización registrada',
};

export default function Contacts() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const result = useCommercialHistory(key, getContacts);
  const file = useCommercialExport(key);
  const [menuOpen, setMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const disabled = result.loading || !!result.error || file.busy;

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [menuOpen]);

  function download(marketing: boolean, format: 'xlsx' | 'csv') {
    if (disabled) return;
    setMenuOpen(false);
    const next = new URLSearchParams(params);
    next.set('uso', marketing ? 'marketing' : 'operacional');
    next.set('formato', format);
    void file.download('contactos/exportar/', next, `contactos-${marketing ? 'marketing-autorizado' : 'operacional'}.${format}`, format);
  }

  return (
    <section aria-label="Contactos de clientes" className="commercial-section space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-[#0f1623]">Contactos de clientes</h2>
          <p className="mt-1 text-sm text-[#52617a]">Consulta los compradores de tu tienda y exporta sus contactos.</p></div>
        <div className="relative" ref={exportRef}>
          <Button disabled={disabled} onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-haspopup="true">
            Exportar contactos {menuOpen ? '▴' : '▾'}
          </Button>
          {menuOpen && !disabled && (
            <div className="absolute right-0 top-full z-30 mt-2 w-[min(280px,calc(100vw-36px))] rounded-xl border border-[#dce3ef] bg-white p-2 shadow-lg">
              <p className="px-2 pb-2 text-xs font-semibold text-[#52617a]">Selecciona un formato</p>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => download(false, 'xlsx')} className="min-h-10 rounded-lg px-3 text-left text-sm hover:bg-[#f1f4f9] focus-visible:outline-2 focus-visible:outline-[#1a3a6b]">Excel de contactos</button>
                <button type="button" onClick={() => download(false, 'csv')} className="min-h-10 rounded-lg px-3 text-left text-sm hover:bg-[#f1f4f9] focus-visible:outline-2 focus-visible:outline-[#1a3a6b]">CSV de contactos</button>
                <div className="my-1 border-t border-[#e7eaf1]" />
                <button type="button" onClick={() => download(true, 'xlsx')} className="min-h-10 rounded-lg px-3 text-left text-sm hover:bg-[#f1f4f9] focus-visible:outline-2 focus-visible:outline-[#1a3a6b]">Excel de marketing autorizado</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-[#52617a]">Los datos de pedidos pueden usarse para su gestión. El envío de publicidad requiere autorización comercial expresa.</p>
      <CommercialFilters key={key} params={params} onApply={setParams} contacts />
      {file.busy && <p role="status" className="text-sm">Preparando exportación…</p>}
      {file.message && <p role="status" className="text-sm text-[#1a3a6b]">{file.message}</p>}
      {file.error && <p role="alert" className="text-sm text-red-700">{file.error}</p>}
      {result.loading && <LoadingState size="sm" align="start" spacing="compact">Cargando contactos…</LoadingState>}
      {result.error && <ErrorState onRetry={result.retry}>{humanizeAdminError(result.error)}</ErrorState>}
      {result.data && (
        <AdminCard>
          <div className="mb-4 flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Listado de contactos</h3><span className="text-xs text-[#52617a]">{result.page.total} contactos</span></div>
          {!result.data.length ? <EmptyListState>No hay contactos que coincidan con los filtros.</EmptyListState> : (
            <>
              {/* En móvil: tarjetas sin desplazamiento horizontal */}
              <div className="space-y-2 md:hidden">
                {result.data.map(contact => (
                  <div key={contact.email} className="rounded-lg border border-[#e2e8f0] p-3">
                    <p className="break-all text-sm font-semibold text-[#1a3a6b]">{contact.email}</p>
                    <p className="mt-2 text-xs text-[#52617a]">{contact.cantidad_pedidos} pedidos · Último: {formatBusinessDate(contact.ultimo_pedido, true)}</p>
                    <p className="mt-2 text-xs font-semibold">{consentLabels[contact.consentimiento]}</p>
                    <p className="mt-1 text-xs text-[#52617a]">Consentimiento: {contact.fecha_consentimiento ? formatBusinessDate(contact.fecha_consentimiento, true) : 'Sin fecha registrada'}</p>
                  </div>
                ))}
              </div>
              {/* En escritorio: tabla con ancho suficiente y scroll limitado a ella */}
              <div role="region" aria-label="Tabla de contactos" tabIndex={0} className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <caption className="sr-only">Contactos únicos por correo</caption>
                  <thead className="bg-[#f6f8fc]"><tr>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold text-[#52617a]">Correo</th>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold text-[#52617a]">Pedidos</th>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold text-[#52617a]">Último pedido</th>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold text-[#52617a]">Autorización comercial</th>
                    <th scope="col" className="px-3 py-3 text-xs font-semibold text-[#52617a]">Fecha de consentimiento</th>
                  </tr></thead>
                  <tbody>{result.data.map(contact => (
                    <tr key={contact.email} className="border-t border-[#e7eaf1]">
                      <th scope="row" className="max-w-[220px] break-all px-3 py-3 font-medium text-[#1a3a6b]">{contact.email}</th>
                      <td className="px-3 py-3">{contact.cantidad_pedidos}</td>
                      <td className="whitespace-nowrap px-3 py-3">{formatBusinessDate(contact.ultimo_pedido, true)}</td>
                      <td className="px-3 py-3"><span className={`text-xs font-semibold ${contact.consentimiento === 'autorizado' ? 'text-emerald-800' : contact.consentimiento === 'retirado' ? 'text-red-700' : 'text-[#52617a]'}`}>{consentLabels[contact.consentimiento]}</span></td>
                      <td className="whitespace-nowrap px-3 py-3">{contact.fecha_consentimiento ? formatBusinessDate(contact.fecha_consentimiento, true) : 'Sin registro'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          <HistoryPagination page={result.page} disabled={result.loading} onPage={n => { const next = new URLSearchParams(params); next.set('pagina', String(n)); setParams(next); }} />
        </AdminCard>
      )}
      <details className="rounded-xl border border-[#dce3ef] bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Sobre los contactos y su autorización</summary>
        <div className="mt-3 space-y-2 text-sm text-[#52617a]">
          <p>Cada correo válido aparece una sola vez. La cantidad incluye pedidos pendientes y cancelados; las fechas filtradas corresponden al último pedido.</p>
          <p>Las exportaciones operativas permiten gestionar pedidos. La exportación para marketing incluye exclusivamente autorizaciones expresas vigentes; excluye las retiradas o no registradas.</p>
          <p>La captura de nuevas autorizaciones comerciales aún está pendiente de habilitación. Aceptar cookies no equivale a autorizar publicidad.</p>
        </div>
      </details>
    </section>
  );
}
