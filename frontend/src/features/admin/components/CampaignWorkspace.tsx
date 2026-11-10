import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { AdminCard, Alert, Button, Input, Modal, Select, Textarea } from './ui';
import { useAdmin } from '../context/AdminContext';
import { templatePaths } from '../config/navigation';
import { campaignService, type Campaign, type CampaignForm, type CampaignList, type CampaignAudience } from '../services/campaignService';
import { fetchAdminProducts, type AdminProduct } from '../services/productService';
import { formatPrice } from '../data/mockAdminData';
import { formatBusinessDate } from '../services/businessTime';

const blank = (): CampaignForm => ({ nombre: '', asunto: '', cuerpo: '', destinatarios: [], producto_id: '' });
export function CampaignWorkspace() {
  const { config } = useAdmin();
  const [form, setForm] = useState<CampaignForm>(blank), [baseline, setBaseline] = useState<CampaignForm>(blank);
  const [current, setCurrent] = useState<Campaign | null>(null), [history, setHistory] = useState<CampaignList | null>(null);
  const [audience, setAudience] = useState<CampaignAudience | null>(null), [query, setQuery] = useState('');
  const [products, setProducts] = useState<AdminProduct[]>([]), [productError, setProductError] = useState('');
  const [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const key = useRef<string>(), lock = useRef(false), alive = useRef(true);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const blocker = useBlocker(dirty);
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
  useEffect(() => { let active = true; fetchAdminProducts().then(value => { if (active) setProducts(value); }).catch(() => { if (active) setProductError('No se pudo cargar el catálogo. Puedes guardar la campaña sin agregar otro producto.'); }); return () => { active = false; }; }, []);
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
      const stored = { nombre: row.nombre, asunto: row.asunto, cuerpo: row.cuerpo, producto_id: row.producto.id || '', destinatarios: row.destinatarios?.map(item => item.id) || [] };
      setCurrent(row); setForm(stored); setBaseline(stored); setNotice('Borrador guardado. No se enviaron correos.'); setPreview(openPreview); setReload(n => n + 1);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo guardar. Tu borrador se conserva.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function open(id: string) {
    if (dirty && !window.confirm('¿Descartar el texto sin guardar y abrir otro borrador?')) return;
    setBusy(true); setError('');
    try { const row = await campaignService.get(id); if (!alive.current) return; const stored = { nombre: row.nombre, asunto: row.asunto, cuerpo: row.cuerpo, producto_id: row.producto.id || '', destinatarios: row.destinatarios?.map(item => item.id) || [] }; setCurrent(row); key.current = row.clave; setForm(stored); setBaseline(stored); setNotice('Borrador recuperado. Revisa los contactos que siguen autorizados.'); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo abrir el borrador.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className="space-y-5">
    <Alert variant="info">Prepara comunicaciones para personas que autorizaron publicidad. El envío de campañas está deshabilitado: guardar y previsualizar no envía correos.</Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{current ? 'Editar borrador de campaña' : 'Preparar campaña'}</h3><Button variant="outline" disabled={busy} onClick={() => { if (dirty && !window.confirm('¿Descartar el borrador sin guardar?')) return; const next = blank(); setForm(next); setBaseline(next); setCurrent(null); key.current = undefined; setNotice(''); setError(''); }}>Nuevo borrador</Button></div>
    {error && <Alert variant="error">{error}</Alert>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <fieldset disabled={busy} className="grid gap-5 lg:grid-cols-2">
      <AdminCard className="space-y-3 min-w-0"><h4 className="font-semibold">Destinatarios autorizados</h4><Input label="Filtrar contactos autorizados" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Buscar por correo" />
        {!audience ? <p role="status">Cargando contactos autorizados…</p> : <>
          <p className="text-sm">{audience.total} elegibles con este filtro · {form.destinatarios.length} seleccionados. Máximo {audience.limite} por borrador.</p>
          {audience.limite_excedido && <p className="text-sm">Hay más contactos que el límite. Acota el filtro para seleccionar todo el grupo.</p>}
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={audience.limite_excedido || !audience.resultados.length} onClick={() => edit({ destinatarios: [...new Set([...form.destinatarios, ...audience.resultados.map(row => row.id)])] })}>Seleccionar todos los elegibles del filtro</Button><Button variant="ghost" onClick={() => edit({ destinatarios: [] })}>Limpiar selección</Button></div>
          {!audience.resultados.length && <p>No hay contactos con autorización válida y verificada en este filtro.</p>}
          <div className="max-h-80 overflow-y-auto space-y-2 p-1">{audience.resultados.map(row => <label key={row.id} className="flex min-h-11 items-center gap-3 break-all text-sm"><input type="checkbox" checked={form.destinatarios.includes(row.id)} onChange={event => choose(row.id, event.target.checked)} />{row.email}</label>)}</div>
        </>}
        <p className="text-xs">Las bajas y autorizaciones se vuelven a comprobar al guardar la vista previa. Tener pedidos o aceptar cookies no autoriza publicidad.</p>
      </AdminCard>
      <AdminCard className="space-y-3 min-w-0"><h4 className="font-semibold">Contenido de la campaña</h4><Input label="Nombre del borrador" maxLength={150} value={form.nombre} onChange={event => edit({ nombre: event.target.value })} /><Input label="Asunto de la campaña" maxLength={200} value={form.asunto} onChange={event => edit({ asunto: event.target.value })} /><Textarea label="Contenido de la campaña" rows={7} maxLength={5000} value={form.cuerpo} onChange={event => edit({ cuerpo: event.target.value })} /><Select label="Producto de la tienda (opcional)" value={form.producto_id} onChange={event => edit({ producto_id: event.target.value })} options={[{ value: '', label: 'Sin producto' }, ...products.filter(product => product.status === 'active').map(product => ({ value: product.id, label: `${product.name} · ${formatPrice(product.basePrice)}` })), ...(current?.producto.id && !products.some(product => product.id === current.producto.id) ? [{ value: current.producto.id, label: `${current.producto.nombre} · Producto del borrador` }] : [])]} />{productError && <p className="text-sm">{productError}</p>}
        <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={busy || !dirty}>Guardar borrador de campaña</Button><Button variant="outline" disabled={busy || !form.nombre.trim()} onClick={() => void save(true)}>Guardar y previsualizar</Button></div><Button disabled title="Disponible después de habilitar el servicio de campañas y sus controles de baja.">Envío de campañas no habilitado</Button>
      </AdminCard>
    </fieldset>
    <AdminCard className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Historial de campañas</h3><Button variant="outline" disabled={busy} onClick={() => { setError(''); setReload(n => n + 1); }}>Actualizar contactos e historial</Button></div>{!history ? <p>Cargando borradores…</p> : <>{!history.resultados.length && <p>Aún no hay campañas guardadas.</p>}{history.resultados.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] py-3"><div className="min-w-0 break-words"><strong>{row.nombre}</strong><p className="text-xs">Borrador · Revisión {row.revision} · {formatBusinessDate(row.actualizado, true)}</p></div><Button variant="outline" disabled={busy} onClick={() => void open(row.id)}>Abrir campaña</Button></div>)}<div className="flex flex-wrap items-center gap-3"><Button variant="ghost" disabled={page <= 1 || busy} onClick={() => setPage(n => n - 1)}>Campañas anteriores</Button><span className="text-xs">Página {history.pagina} de {history.paginas}</span><Button variant="ghost" disabled={page >= history.paginas || busy} onClick={() => setPage(n => n + 1)}>Más campañas</Button></div></>}</AdminCard>
    <Modal open={preview} onClose={() => setPreview(false)} title="Vista previa de campaña" size="lg"><div className="space-y-4 break-words"><p>{current?.elegibles || 0} destinatarios elegibles · {current?.excluidos || 0} excluidos por consentimiento no vigente o cambiado.</p><h3 className="font-semibold">{current?.asunto || 'Sin asunto todavía'}</h3><p className="whitespace-pre-wrap">{current?.cuerpo || 'Completa el contenido antes de un futuro envío.'}</p>{current?.producto.id && <article className="rounded-lg border border-[var(--border)] p-3">{current.producto.imagen && <img className="max-h-40 max-w-full rounded-lg object-contain" src={current.producto.imagen} alt={current.producto.nombre || 'Producto'} />}<strong>{current.producto.nombre}</strong><p>{current.producto.precio ? formatPrice(Number(current.producto.precio)) : 'Consulta el precio del producto'}</p></article>}<a className="underline inline-flex min-h-11 items-center" target="_blank" rel="noopener noreferrer" href={`${templatePaths[config.template]}/preferencias-comerciales`}>Consultar o retirar autorización comercial</a><p className="text-xs">Este enlace abre las preferencias de publicidad de la tienda. Los enlaces personales de baja se habilitarán junto con el envío. Esta previsualización no envía mensajes.</p><p>{current?.aviso_envio}</p></div></Modal>
    <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Campaña sin guardar" size="sm"><p>Hay cambios pendientes en la campaña.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => blocker.reset?.()}>Seguir editando</Button><Button onClick={() => blocker.proceed?.()}>Descartar y salir</Button></div></Modal>
  </div>;
}
