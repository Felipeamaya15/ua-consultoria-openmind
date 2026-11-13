import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { IMAGE_ACCEPT } from '../../../shared/services/imageUpload';
import { AdminCard, Alert, Button, Input, Select, Textarea, Toggle } from '../../admin/components/ui';
import { humanizeAdminError } from '../../admin/utils/humanizeError';
import { validateVideoFile } from '../domain/videoUpload';
import { MEDIA_TYPES, emptyMediaDraft, mediaProblem, type MediaDraft, type MediaKind, type MediaPage, type MediaResource } from '../domain/mediaLibrary';
import { deleteMediaResource, fetchMediaLibrary, saveMediaResource, setMediaActive } from '../services/mediaLibraryService';
import { MediaPreview } from './MediaPreview';
import './mediaLibrary.css';

const errorMessage = (cause: unknown) => humanizeAdminError(cause instanceof Error ? cause.message : 'No pudimos completar la operación. Intenta nuevamente.');
function ResourceForm({ initial, busy, onSave, onCancel, onDirty }: {
  initial: MediaResource | null; busy: boolean;
  onSave: (draft: MediaDraft, file: File | null, preserve: boolean) => Promise<void>;
  onCancel: () => void; onDirty: (dirty: boolean) => void;
}) {
  const baseline: MediaDraft = initial ? { titulo: initial.titulo, descripcion: initial.descripcion, tipo: initial.tipo, url: initial.url, activo: initial.activo } : emptyMediaDraft();
  const [draft, setDraft] = useState(baseline), [file, setFile] = useState<File | null>(null), [error, setError] = useState('');
  const [source, setSource] = useState<'file' | 'url'>(initial?.archivo || !initial ? 'file' : 'url');
  const dirty = !!file || JSON.stringify(draft) !== JSON.stringify(baseline) || (!!initial?.archivo && source === 'url');
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const preserve = !!initial?.archivo && source === 'file' && ['imagen', 'video'].includes(draft.tipo) && draft.tipo === initial?.tipo && !file;
  const edit = (next: Partial<MediaDraft>) => { setDraft(old => ({ ...old, ...next })); setError(''); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = mediaProblem(draft, file, preserve);
    if (problem) { setError(problem); return; }
    if (file && draft.tipo === 'video') {
      try { await validateVideoFile(file); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Video no válido.'); return; }
    }
    void onSave(draft, file, preserve);
  }
  return <AdminCard className="media-form-card"><form aria-label={initial ? 'Editar recurso multimedia' : 'Agregar recurso multimedia'} onSubmit={submit} noValidate>
    <h3>{initial ? 'Editar recurso' : 'Agregar recurso'}</h3>
    <fieldset disabled={busy} className="media-form-fields">
      <Input label="Título del recurso" value={draft.titulo} maxLength={180} required onChange={event => edit({ titulo: event.target.value })} />
      <Textarea label="Descripción del recurso" value={draft.descripcion} maxLength={2000} rows={3} onChange={event => edit({ descripcion: event.target.value })} />
      <Select label="Tipo de contenido" value={draft.tipo} options={Object.entries(MEDIA_TYPES).map(([value, label]) => ({ value, label }))} onChange={event => { edit({ tipo: event.target.value as MediaKind, url: '' }); setFile(null); }} />
      {draft.tipo === 'imagen' && <Select label="Origen de la imagen" value={source} options={[{ value: 'file', label: 'Subir archivo' }, { value: 'url', label: 'Usar URL de imagen' }]} onChange={event => { setSource(event.target.value as 'file' | 'url'); setFile(null); edit({ url: '' }); }} />}
      {(draft.tipo === 'video' || draft.tipo === 'imagen' && source === 'file') ? <div><Input label={draft.tipo === 'video' ? 'Archivo de video' : 'Archivo de imagen'} type="file" accept={draft.tipo === 'video' ? 'video/mp4,video/webm,.mp4,.webm' : IMAGE_ACCEPT} onChange={event => { setFile(event.target.files?.[0] || null); setError(''); }} hint={draft.tipo === 'video' ? 'MP4 (H.264) o WebM, hasta 20 segundos y 8 MB. Se valida también en el servidor.' : 'JPG, PNG, WebP, HEIC o HEIF. Hasta 2 MB. Se valida en el servidor al guardar.'} persistentHint />{preserve && <p className="media-help">Se conservará la imagen guardada si no eliges otro archivo.</p>}{file && <p className="media-help">Seleccionado: {file.name}</p>}</div>
        : <Input label="URL del contenido" type="url" value={draft.url} required maxLength={2000} placeholder="https://…" onChange={event => edit({ url: event.target.value })} hint={draft.tipo === 'enlace' ? 'Se mostrará como enlace; no se incrustan páginas arbitrarias.' : 'Usa la URL completa y pública del contenido, no código HTML ni enlaces de perfil.'} persistentHint />}
      <Toggle label="Recurso activo" checked={draft.activo} onChange={activo => edit({ activo })} />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="media-actions"><Button type="submit" disabled={busy || (!!initial && !dirty)}>{busy ? 'Guardando…' : 'Guardar recurso'}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancelar cambios</Button></div>
      {dirty && <p className="media-help">Cambios sin guardar</p>}
    </fieldset>
  </form></AdminCard>;
}

export function MediaLibrary({ active, isCurrent, onDirty }: { active: boolean; isCurrent: () => boolean; onDirty: (dirty: boolean) => void }) {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [data, setData] = useState<MediaPage | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [mutationError, setMutationError] = useState(''), [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ item: MediaResource | null; key: number } | null>(null), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState<string | null>(null);
  const editorSequence = useRef(0);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); setLoading(true); setError('');
    fetchMediaLibrary(page, controller.signal).then(next => { if (!controller.signal.aborted && isCurrent()) setData(next); }).catch(cause => { if (!controller.signal.aborted && isCurrent()) setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, page, revision, isCurrent]);
  async function mutate(operation: (signal: AbortSignal) => Promise<unknown>, success: string, closeEditor = false) {
    if (mutation.current) return;
    if (!isCurrent()) { setMutationError('Tu sesión cambió. Vuelve a abrir Marketing.'); return; }
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setMutationError(''); setNotice('');
    try {
      await operation(controller.signal);
      if (controller.signal.aborted || !isCurrent()) return;
      if (closeEditor) { setEditor(null); setDirty(false); }
      setDeleting(null); setNotice(success); setRevision(old => old + 1);
    } catch (cause) { if (!controller.signal.aborted && isCurrent()) setMutationError(errorMessage(cause)); }
    finally { mutation.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  function openEditor(item: MediaResource | null) {
    if (dirty && !window.confirm('Tienes cambios sin guardar en este recurso. ¿Descartarlos?')) return;
    setEditor({ item, key: ++editorSequence.current }); setMutationError(''); setNotice(''); setDeleting(null);
  }
  return <div className="media-library">
    <header className="media-library-heading"><div><h2>Biblioteca multimedia</h2><p>Guarda imágenes y contenido público para reutilizarlo más adelante en las secciones de tu tienda.</p></div><Button type="button" disabled={busy} onClick={() => openEditor(null)}>Agregar recurso</Button></header>
    <p className="media-help">Guardar aquí no publica contenido en tu tienda. Puedes reutilizar imágenes, videos propios de hasta 20 segundos y 8 MB, y enlaces públicos.</p>
    {editor && <ResourceForm key={editor.key} initial={editor.item} busy={busy} onDirty={setDirty} onCancel={() => { setEditor(null); setMutationError(''); }} onSave={(draft, file, preserve) => mutate(signal => saveMediaResource(editor.item?.id || null, draft, file, preserve, signal), 'Recurso guardado.', true)} />}
    {mutationError && <Alert variant="error">{mutationError}</Alert>}
    <p role="status">{notice}</p>
    {loading && <LoadingState>Cargando biblioteca multimedia…</LoadingState>}
    {error && <ErrorState onRetry={() => setRevision(old => old + 1)}>{error}</ErrorState>}
    {!loading && !error && data?.total === 0 && <EmptyListState title="Tu biblioteca está vacía">Agrega una imagen, un video de YouTube, una publicación pública o un enlace externo.</EmptyListState>}
    {data && <><p className="media-help">{data.total} recursos guardados · Página {data.pagina}</p><div className="media-library-grid">{data.resultados.map(item => <AdminCard key={item.id} className="media-resource-card">
      <div className="media-resource-heading"><span>{MEDIA_TYPES[item.tipo]}</span><span>{item.activo ? 'Activo' : 'Desactivado'}</span></div><h3>{item.titulo}</h3>{item.descripcion && <p className="media-resource-description">{item.descripcion}</p>}
      {item.archivo && <p className="media-help">{item.archivo.ancho} × {item.archivo.alto} px · {Math.ceil(item.archivo.tamano / 1024)} KB</p>}
      <MediaPreview key={`${item.id}:${item.actualizado}`} resource={item} />
      <div className="media-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => openEditor(item)} aria-label={`Editar ${item.titulo}`}>Editar</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void mutate(signal => setMediaActive(item.id, !item.activo, signal), item.activo ? 'Recurso desactivado.' : 'Recurso activado.')} aria-label={`${item.activo ? 'Desactivar' : 'Activar'} ${item.titulo}`}>{item.activo ? 'Desactivar' : 'Activar'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleting(item.id)} aria-label={`Eliminar ${item.titulo}`}>Eliminar</Button></div>
      {deleting === item.id && <div className="media-delete"><p>¿Eliminar «{item.titulo}» de la biblioteca? No se elimina el contenido en su proveedor.</p><Button type="button" variant="outline" disabled={busy} onClick={() => void mutate(signal => deleteMediaResource(item.id, signal), 'Recurso eliminado.')}>Confirmar eliminación</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button></div>}
    </AdminCard>)}</div>
    <nav aria-label="Páginas de la biblioteca" className="media-actions"><Button type="button" variant="outline" disabled={busy || loading || page <= 1} onClick={() => setPage(old => old - 1)}>Anterior</Button><Button type="button" variant="outline" disabled={busy || loading || page * 24 >= data.total} onClick={() => setPage(old => old + 1)}>Siguiente</Button></nav></>}
  </div>;
}
