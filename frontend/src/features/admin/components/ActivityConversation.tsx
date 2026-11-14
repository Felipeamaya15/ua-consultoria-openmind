import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Textarea } from './ui';
import { LoadingState } from '../../../shared/components/states';
import { fetchActivityConversation, createActivityReply, sendActivityReply, type ActivityConversation as Conversation, type ActivityReply } from '../../landing/services/activityService';
import { formatBusinessDate } from '../services/businessTime';

const ATTEMPT_CODES: Record<string, string> = { enviado_local: 'Capturada por el correo de pruebas', enviado: 'Aceptada por el transporte', error_de_envio: 'No se confirmó la aceptación', resultado_desconocido: 'Resultado no confirmado', destinatario_invalido: 'Correo no válido', contenido_invalido: 'Asunto o contenido no válido' };
export const REPLY_STATES = { borrador: 'Borrador', enviando: 'En proceso: revisa el resultado antes de reenviar', aceptada: 'Aceptada por el transporte', fallida: 'No enviada: puedes revisar y reintentar', indeterminada: 'Resultado incierto: no reenviar sin revisar el transporte' };

export function ActivityConversation({ id, onClose, onUpdated }: { id: string; onClose: () => void; onUpdated: () => void }) {
  const [data, setData] = useState<Conversation | null>(null);
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [subject, setSubject] = useState(''), [body, setBody] = useState('');
  const [saved, setSaved] = useState<ActivityReply | null>(null);
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const key = useRef<string>(), lock = useRef(false), alive = useRef(true);
  const dirty = !!(subject || body) && (!saved || subject !== saved.asunto || body !== saved.cuerpo);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchActivityConversation(id, page, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message || 'No se pudo cargar la conversación.'); });
    return () => controller.abort();
  }, [id, page, revision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function close() { if (!busy && (!dirty || window.confirm('Hay una respuesta sin guardar. ¿Cerrar y descartarla?'))) onClose(); }
  function edit(field: 'subject' | 'body', value: string) {
    if (saved) { key.current = undefined; setSaved(null); }
    field === 'subject' ? setSubject(value) : setBody(value); setError(''); setNotice('');
  }
  async function persist(openReview = false) {
    if (lock.current) return;
    if (!subject.trim() || !body.trim() || /[\r\n]/.test(subject)) { setError('Completa el asunto en una línea y el contenido de la respuesta.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      key.current ??= crypto.randomUUID();
      const row = saved ?? await createActivityReply(id, { clave: key.current, asunto: subject.trim(), cuerpo: body.trim() });
      if (!alive.current) return;
      setSaved(row); setSubject(row.asunto); setBody(row.cuerpo); setNotice('Borrador guardado. Aún no se ha enviado.'); setRevision(n => n + 1); setReview(openReview);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo guardar. Conservamos tu respuesta.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function send() {
    if (!saved || !data?.envio_habilitado || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await sendActivityReply(id, saved.id);
      if (!alive.current) return;
      setSaved(result); setReview(false); setNotice(REPLY_STATES[result.estado]); setRevision(n => n + 1); onUpdated();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se confirmó el resultado. Actualiza el historial antes de reintentar.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <>
    <Modal open onClose={close} title="Detalle de la consulta" size="xl">
      {!data ? <LoadingState>Cargando conversación…</LoadingState> : <div className="space-y-5">
        <section className="space-y-2 break-words"><h3 className="font-semibold">{data.solicitud.titulo_actividad}</h3><p>{data.solicitud.nombre} {data.solicitud.apellido} · {data.solicitud.email}</p><p className="text-xs">Recibida: {formatBusinessDate(data.solicitud.creado, true)} · Estado: {data.solicitud.estado}{data.solicitud.archivada ? ' · Archivada' : ''}</p>{data.solicitud.telefono && <p>{data.solicitud.telefono}</p>}<p className="whitespace-pre-wrap rounded-lg bg-[var(--muted)] p-3">{data.solicitud.mensaje || 'Sin mensaje adicional.'}</p></section>
        <section className="space-y-3"><h3 className="font-semibold">Preparar respuesta</h3><p className="text-sm">El destinatario proviene de esta solicitud. La respuesta se guarda antes de revisar el envío.</p>
          <Input label="Destinatario de la respuesta" readOnly value={data.solicitud.email} />
          <Input label="Asunto de la respuesta" maxLength={200} value={subject} disabled={busy} onChange={e => edit('subject', e.target.value)} />
          <Textarea label="Respuesta a la consulta" rows={5} maxLength={5000} value={body} disabled={busy} onChange={e => edit('body', e.target.value)} hint="Texto libre. El formato HTML se muestra como texto seguro." persistentHint />
          <p className="text-xs">{body.length}/5000 caracteres. {data.aviso_envio}</p>
          <div className="flex flex-wrap gap-2"><Button disabled={busy || !dirty} onClick={() => void persist()}>Guardar borrador</Button><Button variant="outline" disabled={busy || !data.envio_habilitado || !subject.trim() || !body.trim() || data.solicitud.estado === 'cerrada' || !!saved && !['borrador','fallida'].includes(saved.estado)} onClick={() => void persist(true)}>Revisar envío</Button></div>
        </section>
        <section className="space-y-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Historial de respuestas ({data.total})</h3><Button variant="ghost" disabled={busy} onClick={() => setRevision(n => n + 1)}>Actualizar historial</Button></div>
          {!data.respuestas.length && <p className="text-sm">Aún no hay respuestas guardadas.</p>}
          {data.respuestas.map(row => <article key={row.id} className="rounded-lg border border-[var(--border)] p-3 space-y-2 break-words"><p className="font-semibold">{row.asunto}</p><p className="text-xs">{formatBusinessDate(row.creado, true)} · {REPLY_STATES[row.estado]}</p><p className="whitespace-pre-wrap text-sm">{row.cuerpo}</p>{row.intentos.map(attempt => <p key={attempt.numero} className="text-xs">Intento {attempt.numero}: {REPLY_STATES[attempt.estado as ActivityReply['estado']] || attempt.estado} · {ATTEMPT_CODES[attempt.codigo] || 'Pendiente de resultado'}</p>)}{['borrador','fallida'].includes(row.estado) && <Button variant="outline" disabled={busy} onClick={() => { if (dirty && !window.confirm('¿Cambiar de respuesta y descartar el texto sin guardar?')) return; setSaved(row); key.current = row.clave; setSubject(row.asunto); setBody(row.cuerpo); setNotice('Respuesta recuperada. Puedes revisarla antes de enviar.'); }}>Recuperar respuesta</Button>}</article>)}
          <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" disabled={page <= 1 || busy} onClick={() => setPage(n => n - 1)}>Respuestas anteriores</Button><span className="text-xs">Página {data.pagina} de {data.paginas}</span><Button variant="ghost" disabled={page >= data.paginas || busy} onClick={() => setPage(n => n + 1)}>Más respuestas</Button></div>
        </section>
      </div>}
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}{error && <Alert variant="error">{error}</Alert>}
      {!data && error && <Button onClick={() => setRevision(n => n + 1)}>Reintentar carga</Button>}
    </Modal>
    <Modal open={review} onClose={() => { if (!busy) setReview(false); }} title="Revisar respuesta antes de enviar" size="lg"><div className="space-y-3 break-words"><p><strong>Para:</strong> {saved?.destinatario}</p><p><strong>Asunto:</strong> {saved?.asunto}</p><p className="whitespace-pre-wrap rounded-lg bg-[var(--muted)] p-3">{saved?.cuerpo}</p><p className="text-sm">La aceptación por el transporte de pruebas no confirma entrega al buzón. No se enviará a través de un proveedor real.</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setReview(false)}>Volver a editar</Button><Button disabled={busy || !data?.envio_habilitado} onClick={() => void send()}>{busy ? 'Procesando…' : 'Enviar al correo de pruebas'}</Button></div></div></Modal>
  </>;
}
