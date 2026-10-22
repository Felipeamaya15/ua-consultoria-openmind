import { useEffect, useRef, useState } from 'react';
import { downloadCommercial, emptyPagination, type Pagination } from '../services/commercialService';

export function useCommercialHistory<T>(key: string, load: (params: URLSearchParams, signal?: AbortSignal) => Promise<{ data: T; paginacion: Pagination }>) {
  const [data, setData] = useState<T | null>(null);
  const [page, setPage] = useState(emptyPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setData(null);
    load(new URLSearchParams(key), controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result.data); setPage(result.paginacion); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, load, attempt]);
  return { data, page, loading, error, retry: () => setAttempt(n => n + 1) };
}

export function useCommercialExport(key: string) {
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setBusy(false); setMessage(''); setError(''); return () => { controller.current?.abort(); controller.current = null; }; }, [key]);
  async function download(path: string, params: URLSearchParams, name: string, format: 'xlsx' | 'csv' = 'xlsx') {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setMessage(''); setError('');
    try {
      await downloadCommercial(path, params, name, format, request.signal);
      if (!request.signal.aborted) setMessage(`Archivo ${format.toUpperCase()} descargado con los filtros aplicados.`);
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo descargar el archivo.'); }
    finally { if (!request.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  return { busy, message, error, download };
}
