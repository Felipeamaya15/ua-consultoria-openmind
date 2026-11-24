import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import { requestJson } from '../../../shared/services/apiRequest';
import { commerceRequest } from '../../landing/services/commerceService';

type Recording = {id: string; titulo: string; bytes: number};
export function PrivateRecordingField({value, onChange}: {value?: string; onChange: (id: string) => void}) {
  const [rows, setRows] = useState<Recording[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    commerceRequest<Recording[]>('grabaciones', 'GET', undefined, controller.signal).then(setRows).catch(cause => {
      if (!controller.signal.aborted) setError(`${cause.message} Si hay una actualización pendiente, debe aplicarla el administrador.`);
    });
    return () => controller.abort();
  }, []);
  return <div className="space-y-3">
    <label className="block">Video privado<select value={value || ''} onChange={e => onChange(e.target.value)} className="block w-full border rounded p-2" aria-invalid={!value}>
      <option value="">Selecciona una grabación</option>{rows.map(row => <option key={row.id} value={row.id}>{row.titulo}</option>)}
    </select></label>
    <label className="block">Subir grabación MP4 (H.264, hasta 100 MB)<input type="file" accept="video/mp4" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return;
      event.target.value = '';
      if (file.size > 100 * 1024 * 1024) {setError('El video no puede superar 100 MB.'); return;}
      const token = authService.getToken();
      const form = new FormData(); form.set('video', file); form.set('titulo', file.name.slice(0, 200));
      setBusy(true); setError('');
      try {
        const row = await requestJson(`${API_BASE_URL}/api/landing/grabaciones/`, {method: 'POST', credentials: 'include', headers: token ? {Authorization: `Token ${token}`} : {}, body: form}) as Recording;
        setRows(previous => [row, ...previous]); onChange(row.id);
      } catch (cause) {setError((cause as Error).message);}
      finally {setBusy(false);}
    }} /></label>
    <p className="text-sm">El original se guarda fuera de los medios públicos. Solo el comprador autenticado con pago confirmado y acceso vigente puede reproducirlo. Requiere el almacenamiento privado y la actualización del módulo disponibles.</p>
    {busy && <p role="status">Subiendo grabación…</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
