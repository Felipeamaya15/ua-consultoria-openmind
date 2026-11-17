import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Modal, Textarea } from '../../admin/components/ui';
import { instagramService, INSTAGRAM_STATES, type InstagramConnection, type InstagramPublication } from '../services/instagramService';
import { downloadPublication } from '../services/exportPublication';

export function InstagramPublisher({disabled, square, revision, initialCaption, generate}: {
  disabled: boolean; square: boolean; revision: string; initialCaption: string; generate: () => Promise<File>;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null), [url, setUrl] = useState('');
  const [state, setState] = useState<InstagramConnection | null>(null), [saved, setSaved] = useState<InstagramPublication | null>(null);
  const [history, setHistory] = useState<InstagramPublication[]>([]), [error, setError] = useState('');
  const [statusError, setStatusError] = useState(''), [historyError, setHistoryError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const key = useRef<string>(), lock = useRef(false), alive = useRef(true), signature = useRef(revision);
  signature.current = revision;
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  useEffect(() => {setFile(null); setSaved(null); key.current = undefined; setOpen(false);}, [revision]);
  useEffect(() => {if (!file) {setUrl(''); return;} const object = URL.createObjectURL(file); setUrl(object); return () => URL.revokeObjectURL(object);}, [file]);
  async function refresh(expected = signature.current) {
    const [connection, records] = await Promise.allSettled([instagramService.status(), instagramService.history()]);
    if (!alive.current || expected !== signature.current) return;
    if (connection.status === 'fulfilled') {setState(connection.value); setStatusError('');}
    else {setState(null); setStatusError(connection.reason instanceof Error ? connection.reason.message : 'No se pudo consultar la conexión.');}
    if (records.status === 'fulfilled') {setHistory(records.value); setHistoryError('');}
    else {setHistory([]); setHistoryError('No se pudo consultar el historial de publicaciones.');}
  }
  async function start() {
    if (lock.current || disabled || !square) return;
    lock.current = true; setBusy(true); setError(''); setStatusError(''); setHistoryError(''); setState(null); setHistory([]); setFile(null); setCaption(Array.from(initialCaption).slice(0, 2200).join('')); setSaved(null); key.current = undefined;
    const initial = signature.current;
    setOpen(true);
    try {
      const imageTask = Promise.resolve().then(generate).then(image => {
        if (alive.current && initial === signature.current) setFile(image);
      }).catch(cause => {if (alive.current && initial === signature.current) setError(cause instanceof Error ? cause.message : 'No se pudo preparar la imagen.');});
      await Promise.all([imageTask, refresh(initial)]);
    } finally {lock.current = false; if (alive.current) setBusy(false);}
  }
  async function action(kind: 'prepare' | 'confirm' | 'update') {
    if (lock.current || !file || (kind !== 'update' && !state?.publicacion_habilitada)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      key.current ??= crypto.randomUUID();
      const result = kind === 'prepare' ? await instagramService.prepare(file, caption, key.current)
        : saved ? await (kind === 'confirm' ? instagramService.confirm(saved.id) : instagramService.update(saved.id)) : null;
      if (alive.current && result) {setSaved(result); await refresh();}
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'No se confirmó el resultado. Consulta el historial antes de repetir.');}
    finally {lock.current = false; if (alive.current) setBusy(false);}
  }
  return <>
    <Button type="button" size="sm" disabled={disabled || busy || !square} onClick={() => void start()}>Publicar en Instagram</Button>
    <Modal open={open} onClose={() => {if (!busy) setOpen(false);}} title="Publicación individual en Instagram" size="lg">
      <div className="instagram-publish-review">
        {url && <img src={url} alt="JPG cuadrado preparado por el editor para Instagram" className="w-full max-w-sm mx-auto rounded-xl" />}
        <p className="text-sm">Cuenta: {state?.conectado ? `@${state.usuario}` : state ? 'Sin autorización activa' : 'Estado aún no confirmado'} · JPG cuadrado 1080 × 1080</p>
        {busy && !file && !error && <p role="status">Preparando imagen y consultando Instagram…</p>}
        {statusError && <Alert variant="error">No se pudo verificar la conexión: {statusError}</Alert>}
        {state && !state.conectado && <Alert variant="info">Registrar el enlace de tu perfil no autoriza a OpenMind a publicar. Conecta o vuelve a autorizar tu cuenta profesional.</Alert>}
        {state && !state.oauth_configurado && <Alert variant="info">La autorización de Meta requiere configuración del servidor por el administrador técnico.</Alert>}
        {state && !state.publicacion_externa_permitida && <Alert variant="info">La publicación externa está deshabilitada por el administrador.</Alert>}
        {state && !state.media_https_configurada && <p className="text-sm">Falta configurar el alojamiento HTTPS público de la imagen temporal en el servidor.</p>}
        {state?.conectado && !state.publicacion_habilitada && <p role="status">La cuenta está conectada, pero la publicación directa todavía no está habilitada. Revisa la configuración.</p>}
        {state?.publicacion_habilitada && <p role="status">Publicación directa habilitada. Revisa la imagen y confirma el envío.</p>}
        {!state?.publicacion_habilitada && <p className="text-sm"><Link className="marketing-text-link" to="/emprendedor/landing#contacto-horarios">Revisar conexión en Contacto y horarios ↗</Link></p>}
        {!state?.publicacion_habilitada && <section aria-label="Publicar sin conexión de Meta" className="rounded-xl border border-[var(--border)] p-4 space-y-3">
          <h3 className="font-semibold">Completa tu publicación manualmente</h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>Descarga la imagen preparada.</li>
            <li>Copia la descripción de abajo.</li>
            <li>Abre Instagram, elige Crear, sube la imagen, pega la descripción y confirma allí.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !file} onClick={() => { if (file) downloadPublication(file, file.name); }}>Descargar imagen preparada</Button>
            <Button variant="outline" disabled={busy} onClick={async () => {
              try { await navigator.clipboard.writeText(caption); setCopyNotice('Descripción copiada. Pégala en Instagram.'); }
              catch { setCopyNotice('Selecciona y copia la descripción del campo inferior.'); }
            }}>Copiar descripción para Instagram</Button>
            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="marketing-text-link self-center">Abrir Instagram ↗</a>
          </div>
          <p className="text-xs">No requiere conectar Meta. Descargar la imagen no la publica; Instagram confirma la publicación.</p>
          {copyNotice && <p role="status" className="text-sm">{copyNotice}</p>}
        </section>}
        {historyError && <p role="status" className="text-sm">{historyError} Si ya intentaste publicar, verifica Instagram antes de repetir.</p>}
        <Textarea label="Descripción de la publicación en Instagram" rows={5} maxLength={4400} value={caption} disabled={busy || !!saved && saved.estado !== 'preparada'} onChange={event => {setCaption(Array.from(event.target.value).slice(0, 2200).join('')); setSaved(null); key.current = undefined;}} />
        <p className="text-xs">{Array.from(caption).length}/2200 caracteres. Guardar la preparación no publica la imagen.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={busy || !file || !state?.publicacion_habilitada || !!saved} variant="outline" onClick={() => void action('prepare')}>Preparar publicación</Button>
          {saved?.estado === 'preparada' && <Button disabled={busy || !state?.publicacion_habilitada} onClick={() => void action('confirm')}>Confirmar publicación en Instagram</Button>}
          {saved && ['creando', 'procesando', 'publicando', 'indeterminada'].includes(saved.estado) && <Button disabled={busy} variant="outline" onClick={() => void action('update')}>Consultar resultado en Instagram</Button>}
          <Button disabled={busy} variant="ghost" onClick={() => setOpen(false)}>Cerrar revisión</Button></div>
        {saved && <p role="status">{INSTAGRAM_STATES[saved.estado]}{saved.media_id ? ` · ID ${saved.media_id}` : ''}</p>}
        {error && <Alert variant="error">{error}</Alert>}
        {!!history.length && <details><summary>Historial de publicaciones de Instagram</summary><ul className="space-y-3 mt-3">{history.map(row => <li key={row.id} className="border-b border-[var(--border)] pb-2"><p className="text-sm">{INSTAGRAM_STATES[row.estado]}</p><p className="text-xs break-words">{row.descripcion.slice(0, 140)}</p><small>{new Date(row.creada_en).toLocaleString('es-CL', {timeZone: 'America/Santiago'})}</small></li>)}</ul></details>}
      </div>
    </Modal>
  </>;
}
