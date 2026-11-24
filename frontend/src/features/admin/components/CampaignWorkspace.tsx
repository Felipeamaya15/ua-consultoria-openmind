import { useFeedback } from '../../../shared/components/FeedbackProvider';
import { LoadingState } from '../../../shared/components/states';
import { MailConnectionPanel } from './MailConnectionPanel';
import { useEffect, useRef, useState } from 'react';
import { AdminCard, Alert, Button, Input, Modal, Select, Textarea } from './ui';
import { campaignService, type Campaign, type CampaignForm, type CampaignList, type CampaignAudience, type CampaignHistory } from '../services/campaignService';
import { PublishedContentPicker } from '../../marketing/components/PublishedContentPicker';
import { fetchMediaLibrary } from '../../marketing/services/mediaLibraryService';
import { MediaPreview } from '../../marketing/components/MediaPreview';
import type { MediaPage } from '../../marketing/domain/mediaLibrary';
import { TEMPLATES } from '../../marketing/domain/editor';
import { formatBusinessDate } from '../services/businessTime';

const blank = (): CampaignForm => ({ nombre: '', asunto: '', cuerpo: '', destinatarios: [], producto_id: '', diseno: { imagen: '', boton_texto: '', boton_url: '' } });
export const CAMPAIGN_STATES: Record<string, string> = { borrador: 'Borrador', seleccionado: 'Seleccionado', pendiente: 'Pendiente', procesando: 'Procesando: revisa antes de reenviar', aceptada: 'Aceptada por el proveedor', parcial: 'Parcialmente aceptada', fallida: 'Fallida', cancelada: 'Cancelada', excluido: 'Excluido por consentimiento', indeterminada: 'Resultado incierto: requiere revisión' };
export function CampaignWorkspace({home='',onDirty=()=>{}}:{home?:string;onDirty?:(dirty:boolean)=>void}) {
  const uiFeedback = useFeedback();

  const [form, setForm] = useState<CampaignForm>(blank), [baseline, setBaseline] = useState<CampaignForm>(blank);
  const [current, setCurrent] = useState<Campaign | null>(null), [history, setHistory] = useState<CampaignList | null>(null);
  const [audience, setAudience] = useState<CampaignAudience | null>(null), [query, setQuery] = useState('');
  const [media, setMedia] = useState<MediaPage|null>(null), [mediaPage, setMediaPage] = useState(1), [mediaOpen, setMediaOpen] = useState(false), [mediaError, setMediaError] = useState('');
  const [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [deliveryReview, setDeliveryReview] = useState<'enviar' | 'reintentar' | 'cancelar' | null>(null);
  const [sendHistory, setSendHistory] = useState<CampaignHistory | null>(null), [historyOpen, setHistoryOpen] = useState(false);
  const stop = useRef(false), testKey = useRef<string>();
  const key = useRef<string>(), lock = useRef(false), alive = useRef(true);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    campaignService.list(page, controller.signal).then(value => { if (!controller.signal.aborted) setHistory(value); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [page, reload]);
  useEffect(() => {
    const controller = new AbortController(); setAudience(null);
    const timer = setTimeout(() => { campaignService.audience(query, controller.signal).then(value => { if (!controller.signal.aborted) setAudience(value); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, reload]);
  useEffect(() => {
    if(!mediaOpen)return;
    const controller=new AbortController();setMedia(null);setMediaError('');
    fetchMediaLibrary(mediaPage,controller.signal,{tipo:'imagen',estado:'activo'}).then(value=>{if(!controller.signal.aborted)setMedia(value);}).catch(cause=>{if(!controller.signal.aborted)setMediaError(cause instanceof Error?cause.message:'No se pudo cargar la biblioteca.');});
    return()=>controller.abort();
  },[mediaOpen,mediaPage]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  function edit(values: Partial<CampaignForm>) { setForm(old => ({ ...old, ...values })); setError(''); setNotice(''); }
  function choose(id: number, checked: boolean) { edit({ destinatarios: checked ? [...new Set([...form.destinatarios, id])] : form.destinatarios.filter(value => value !== id) }); }
  async function save(openPreview = false) {
    if (lock.current) return;
    if (!form.nombre.trim()) { setError('Dale un nombre al borrador para encontrarlo después.'); return; }
    if (form.destinatarios.length > 1000) { setError('Elige hasta 1000 contactos por borrador.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      key.current ??= crypto.randomUUID();
      const row = await campaignService.save(form, key.current, current);
      if (!alive.current) return;
      const stored = { nombre: row.nombre, asunto: row.asunto, cuerpo: row.cuerpo, producto_id: row.producto.tipo==='seccion'?'':row.producto.id || '', contenido:row.producto.seleccion||null, diseno: row.diseno || blank().diseno, destinatarios: row.destinatarios?.map(item => item.id) || [] };
      setCurrent(row); setForm(stored); setBaseline(stored); setNotice('Borrador guardado. No se enviaron correos.'); setReload(n => n + 1); if (openPreview) await showPreview(row);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo guardar. Tu borrador se conserva.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function open(id: string) {
    if (dirty && !(await uiFeedback.confirm({title:"Descartar borrador",confirmLabel:"Descartar cambios",message:'¿Descartar el texto sin guardar y abrir otro borrador?'}))) return;
    setBusy(true); setError('');
    try { const row = await campaignService.get(id); if (!alive.current) return; const stored = { nombre: row.nombre, asunto: row.asunto, cuerpo: row.cuerpo, producto_id: row.producto.tipo==='seccion'?'':row.producto.id || '', contenido:row.producto.seleccion||null, diseno: row.diseno || blank().diseno, destinatarios: row.destinatarios?.map(item => item.id) || [] }; setCurrent(row); key.current = row.clave; setForm(stored); setBaseline(stored); setNotice('Campaña recuperada. Revisa el estado y los contactos que siguen autorizados.'); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo abrir el borrador.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function showPreview(row: Campaign) {
    setError('');
    try { const result = await campaignService.preview(row.id); if (alive.current) { setCurrent(result.campana); setPreviewHtml(result.html); setPreview(true); } }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la vista previa.'); }
  }
  async function sendTest() {
    if (!current || lock.current || dirty) return;
    lock.current = true; setBusy(true); setError('');
    try { testKey.current ??= crypto.randomUUID(); const result = await campaignService.test(current.id, testKey.current); if (alive.current) setNotice(result.estado === 'aceptada' ? 'Prueba aceptada por el proveedor. Revisa el buzón de pruebas en modo Mailpit.' : 'No se confirmó la prueba. Revisa la conexión antes de repetir.'); if (['aceptada','fallida'].includes(result.estado)) testKey.current = undefined; }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se confirmó la prueba.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function openSendHistory(page = 1) {
    if (!current || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const rows = await campaignService.history(current.id, page); if (alive.current) { setSendHistory(rows); setHistoryOpen(true); } }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el registro de envíos.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function delivery(action: 'enviar' | 'procesar' | 'reintentar' | 'cancelar') {
    if (!current || lock.current || dirty) return;
    if (action !== 'procesar' && deliveryReview !== action) return;
    setDeliveryReview(null);
    lock.current = true; stop.current = false; setBusy(true); setError(''); setNotice(''); setPreview(false);
    try {
      let row = action === 'procesar' ? current : await campaignService.action(current, action);
      if (alive.current) setCurrent(row);
      for (let index = 0; action !== 'cancelar' && index < 20 && row.resultados?.pendiente && !stop.current && alive.current; index++) {
        row = await campaignService.action(row, 'procesar');
        if (alive.current) setCurrent(row);
      }
      if (alive.current) { setReload(n => n + 1); setNotice(row.resultados?.pendiente ? 'Los pendientes se conservan. Pulsa Continuar pendientes cuando corresponda.' : 'Resultado actualizado. Revisa el detalle de cada destinatario.'); }
    } catch (cause) { if (alive.current) { setError(cause instanceof Error ? cause.message : 'No se confirmó el resultado. Actualiza el historial.'); setReload(n => n + 1); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <div className="campaign-workspace space-y-5">
    <MailConnectionPanel summary />
    <Alert variant="info">Envía una promoción puntual (por ejemplo, un descuento exclusivo) o una campaña temática (Navidad, aniversario, temporada) desde el mismo formulario. Solo se incluyen destinatarios con autorización comercial vigente y verificada. Guardar y previsualizar no envía correos. Mailpit captura las pruebas locales; el envío externo requiere habilitación del administrador.</Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{current ? current.estado === 'borrador' ? 'Editar borrador de campaña' : 'Detalle de campaña' : 'Preparar campaña'}</h3><Button variant="outline" disabled={busy} onClick={async () => { if (dirty && !(await uiFeedback.confirm({title:"Descartar borrador",confirmLabel:"Descartar cambios",message:'¿Descartar el borrador sin guardar?'}))) return; const next = blank(); setForm(next); setBaseline(next); setCurrent(null); key.current = undefined; setNotice(''); setError(''); }}>Nuevo borrador</Button></div>
    {error && <Alert variant="error">{error}</Alert>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <fieldset disabled={busy || !!current && current.estado !== 'borrador'} className="grid gap-5 lg:grid-cols-2">
      <AdminCard className="space-y-3 min-w-0"><h4 className="font-semibold">Destinatarios autorizados</h4><Input label="Filtrar contactos autorizados" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Buscar por correo" />
        {!audience ? <LoadingState align="start" spacing="compact">Cargando contactos autorizados…</LoadingState> : <>
          <p className="text-sm">{audience.total} elegibles con este filtro · {form.destinatarios.length} seleccionados. Máximo {audience.limite} por borrador.</p>
          {audience.limite_excedido && <p className="text-sm">Hay más contactos que el límite. Acota el filtro para seleccionar todo el grupo.</p>}
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={audience.limite_excedido || !audience.resultados.length} onClick={() => edit({ destinatarios: [...new Set([...form.destinatarios, ...audience.resultados.map(row => row.id)])] })}>Seleccionar todos los elegibles del filtro</Button><Button variant="ghost" onClick={() => edit({ destinatarios: [] })}>Limpiar selección</Button></div>
          {!audience.resultados.length && <p>No hay contactos con autorización válida y verificada en este filtro.</p>}
          <div className="max-h-80 overflow-y-auto space-y-2 p-1">{audience.resultados.map(row => <label key={row.id} className="flex min-h-11 items-center gap-3 break-all text-sm"><input type="checkbox" checked={form.destinatarios.includes(row.id)} onChange={event => choose(row.id, event.target.checked)} />{row.email}</label>)}</div>
        </>}
        <p className="text-xs">Las bajas y autorizaciones se vuelven a comprobar al confirmar e inmediatamente antes de cada envío. Tener pedidos o aceptar cookies no autoriza publicidad.</p>
      </AdminCard>
      <AdminCard className="space-y-3 min-w-0"><h4 className="font-semibold">Correo promocional o campaña temática</h4><p className="text-xs">Puedes elegir una sola persona autorizada para una oferta puntual o varios contactos para una campaña, con asunto, texto e imagen. Revisa la vista previa y realiza primero un envío de prueba.</p><Input label="Nombre del borrador" maxLength={150} value={form.nombre} onChange={event => edit({ nombre: event.target.value })} /><Input label="Asunto de la campaña" maxLength={200} value={form.asunto} onChange={event => edit({ asunto: event.target.value })} /><Textarea label="Contenido de la campaña" rows={7} maxLength={5000} value={form.cuerpo} onChange={event => edit({ cuerpo: event.target.value })} /><PublishedContentPicker home={home} selection={form.contenido||undefined} onSelect={(selection)=>edit({contenido:selection,producto_id:selection.kind==='product'?selection.id:''})} />
        {(form.contenido||form.producto_id)&&<Button variant="ghost" onClick={()=>edit({contenido:null,producto_id:''})}>Quitar contenido de la campaña</Button>}
        {current?.producto.nombre&&<p className="text-sm">Contenido guardado: {current.producto.nombre}. Se conserva su imagen y precio históricos.</p>}
        <Select label="Plantilla del correo" value={form.diseno?.plantilla||'photo'} options={TEMPLATES.map(template=>({value:template.id,label:template.name}))} onChange={event=>edit({diseno:{...form.diseno,plantilla:event.target.value}})} />
        <div className="campaign-library"><div className="flex flex-wrap gap-2"><Button variant="outline" aria-expanded={mediaOpen} onClick={()=>setMediaOpen(value=>!value)}>Elegir imagen de biblioteca</Button>{form.diseno?.imagen&&<Button variant="ghost" onClick={()=>edit({diseno:{...form.diseno,imagen:'',recurso_id:''}})}>Quitar imagen adicional</Button>}</div>
          {form.diseno?.recurso_id&&<p role="status">Imagen de biblioteca seleccionada. Se adjuntará una copia al correo.</p>}
          {mediaOpen&&<>{mediaError?<p role="alert">{mediaError}</p>:!media?<LoadingState spacing="compact">Cargando biblioteca…</LoadingState>:<><div className="campaign-library-grid">{media.resultados.map(resource=><button type="button" key={resource.id} aria-pressed={form.diseno?.recurso_id===resource.id} onClick={()=>{edit({diseno:{...form.diseno,recurso_id:resource.id,imagen:''}});setMediaOpen(false);}}><MediaPreview resource={resource}/><span>{resource.titulo}</span></button>)}</div>{!media.resultados.length&&<p>No hay imágenes activas en la biblioteca.</p>}<div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={mediaPage<=1} onClick={()=>setMediaPage(value=>value-1)}>Imágenes anteriores</Button><span>Página {mediaPage}</span><Button variant="ghost" disabled={mediaPage*24>=media.total} onClick={()=>setMediaPage(value=>value+1)}>Más imágenes</Button></div></>}</>}
        </div>
        <details><summary>Imagen y enlace personalizados (opcional)</summary><Input label="Imagen de campaña (URL HTTP o HTTPS)" maxLength={2000} value={form.diseno?.recurso_id?'':form.diseno?.imagen||''} onChange={event=>edit({diseno:{...form.diseno,imagen:event.target.value,recurso_id:''}})} />
<Input label="Texto del botón" maxLength={80} value={form.diseno?.boton_texto || ''} onChange={event => edit({ diseno: { ...form.diseno, boton_texto: event.target.value } })} /><Input label="Enlace a una página de la tienda (opcional)" maxLength={2000} placeholder="Sin enlace personalizado se utiliza el catálogo" value={form.diseno?.boton_url || ''} onChange={event => edit({ diseno: { ...form.diseno, boton_url: event.target.value } })} /></details><p className="text-xs">Puedes usar una imagen publicada o la imagen del producto seleccionado. El contenido se trata como texto seguro; el diseño del correo se genera en el servidor.</p><div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={busy || !dirty}>Guardar borrador de campaña</Button><Button variant="outline" disabled={busy || !form.nombre.trim()} onClick={() => void save(true)}>Guardar y previsualizar</Button></div>
      </AdminCard>
    </fieldset>
    <AdminCard className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Historial de campañas</h3><Button variant="outline" disabled={busy} onClick={() => { setError(''); setReload(n => n + 1); }}>Actualizar contactos e historial</Button></div>{!history ? <LoadingState align="start" spacing="compact">Cargando borradores…</LoadingState> : <>{!history.resultados.length && <p>Aún no hay campañas guardadas.</p>}{history.resultados.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] py-3"><div className="min-w-0 break-words"><strong>{row.nombre}</strong><p className="text-xs">{CAMPAIGN_STATES[row.estado]} · Revisión {row.revision} · {formatBusinessDate(row.actualizado, true)}</p></div><Button variant="outline" disabled={busy} onClick={() => void open(row.id)}>Abrir campaña</Button></div>)}<div className="flex flex-wrap items-center gap-3"><Button variant="ghost" disabled={page <= 1 || busy} onClick={() => setPage(n => n - 1)}>Campañas anteriores</Button><span className="text-xs">Página {history.pagina} de {history.paginas}</span><Button variant="ghost" disabled={page >= history.paginas || busy} onClick={() => setPage(n => n + 1)}>Más campañas</Button></div></>}</AdminCard>
    {current && <AdminCard className="space-y-3"><h3 className="font-semibold">Resultado de {current.nombre}</h3><p>{CAMPAIGN_STATES[current.estado]} · {current.aviso_envio}</p><div className="flex flex-wrap gap-3">{Object.entries(current.resultados || {}).map(([state, total]) => <span key={state}>{CAMPAIGN_STATES[state] || 'Pendiente de revisión'}: {total}</span>)}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || dirty} onClick={() => void showPreview(current)}>Previsualizar campaña guardada</Button><Button variant="outline" disabled={busy || dirty || !current.envio_habilitado} onClick={() => void sendTest()}>{busy ? 'Procesando…' : 'Enviar prueba al propietario'}</Button>
        {current.estado === 'borrador' && <Button disabled={busy || dirty || !current.envio_habilitado || !current.asunto.trim() || !current.cuerpo.trim()} onClick={() => void showPreview(current)}>Revisar y enviar campaña</Button>}
        {!!current.resultados?.pendiente && <Button disabled={busy} onClick={() => void delivery('procesar')}>Continuar pendientes (hasta 20)</Button>}
        {['fallida','parcial'].includes(current.estado) && !!current.resultados?.fallida && <Button disabled={busy || !current.envio_habilitado} onClick={() => setDeliveryReview('reintentar')}>Revisar y reintentar fallos definitivos</Button>}
        {['borrador','pendiente','procesando'].includes(current.estado) && <Button variant="outline" disabled={busy} onClick={() => setDeliveryReview('cancelar')}>Cancelar campaña</Button>}
        {busy && <Button variant="outline" onClick={() => { stop.current = true; }}>Pausar después del mensaje actual</Button>}
      </div><p className="text-xs">Aceptada significa que el proveedor admitió el mensaje; no acredita entrega, apertura o lectura. Los resultados inciertos requieren revisión y no se reenvían automáticamente. Los pendientes se conservan al cerrar esta página.</p>
      <Button variant="outline" disabled={busy} onClick={() => void openSendHistory()}>Ver registro de intentos</Button>
      <div className="max-h-64 overflow-auto">{current.destinatarios?.map(row => <p key={row.id} className="text-sm break-all py-1">{row.email} · {CAMPAIGN_STATES[row.estado || 'seleccionado']} · {row.intentos} intentos{row.finalizado ? ` · ${formatBusinessDate(row.finalizado, true)}` : ''}</p>)}</div>
    </AdminCard>}
    <Modal open={preview} onClose={() => { if (!busy) setPreview(false); }} title="Vista previa de campaña" size="lg"><div className="space-y-4"><p>{current?.elegibles || 0} elegibles · {current?.excluidos || 0} excluidos. El enlace personal de baja se incorpora en cada envío.</p><iframe title="Correo promocional generado por el servidor" sandbox="" srcDoc={previewHtml} className="w-full min-h-[520px] rounded-lg border border-[var(--border)]" /><p className="text-sm">{current?.aviso_envio}</p>{current?.estado === 'borrador' && <Button disabled={busy || dirty || !current.envio_habilitado || !current.asunto.trim() || !current.cuerpo.trim()} onClick={() => setDeliveryReview('enviar')}>Confirmar envío promocional</Button>}</div></Modal>
    <Modal open={deliveryReview !== null} onClose={() => { if (!busy) setDeliveryReview(null); }} title={deliveryReview === 'cancelar' ? 'Confirmar cancelación de campaña' : 'Confirmar envío de campaña'} size="sm"><div className="space-y-4"><p>{deliveryReview === 'cancelar' ? 'Se cancelarán los mensajes pendientes. Los mensajes ya aceptados y su historial se conservan.' : `Confirma el envío promocional de «${current?.nombre || ''}» a los contactos que siguen autorizados y verificados. Las bajas se comprobarán de nuevo antes de cada mensaje.`}</p><p>{current?.aviso_envio}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeliveryReview(null)}>Volver sin confirmar</Button><Button disabled={busy} onClick={() => { if (deliveryReview) void delivery(deliveryReview); }}>{deliveryReview === 'cancelar' ? 'Sí, cancelar pendientes' : 'Sí, confirmar envío'}</Button></div></div></Modal>
    <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Registro de envíos de la campaña" size="lg"><div className="space-y-3">{sendHistory && <><p>{sendHistory.total} intentos registrados. No hay métricas de apertura o lectura.</p>{!sendHistory.resultados.length && <p>Aún no hay intentos de envío.</p>}{sendHistory.resultados.map((row, index) => <article key={index} className="border-b border-[var(--border)] py-2 text-sm break-all"><p>{row.destinatario} · {CAMPAIGN_STATES[row.estado] || 'Pendiente de revisión'}</p><p>{formatBusinessDate(row.creado, true)} · {row.proveedor === 'mailpit' ? 'Buzón de pruebas' : 'Gmail'} · {row.categoria === 'prueba_campana' ? 'Prueba controlada' : 'Promoción'}</p></article>)}<div className="flex flex-wrap gap-2"><Button disabled={busy || sendHistory.pagina <= 1} onClick={() => void openSendHistory(sendHistory.pagina - 1)}>Anteriores</Button><span>Página {sendHistory.pagina} de {sendHistory.paginas}</span><Button disabled={busy || sendHistory.pagina >= sendHistory.paginas} onClick={() => void openSendHistory(sendHistory.pagina + 1)}>Más intentos</Button></div></>}</div></Modal>

  </div>;
}
