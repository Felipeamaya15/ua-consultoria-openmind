import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingState } from '../../../shared/components/states';
import { Link, useBlocker, useSearchParams } from 'react-router-dom';
import { Alert, Button, Input } from '../../admin/components/ui';
import { buildPublication, productProblem } from '../domain/content';
import { useMarketingSources } from '../hooks/useMarketingSources';
import { ContentPicker } from '../components/ContentPicker';
import { FormatPicker } from '../components/FormatPicker';
import { DesignStudio } from '../components/DesignStudio';
import { DraftPanel } from '../components/DraftPanel';
import { useMarketingOwner } from '../hooks/useMarketingOwner';
import { initialTemplateHistory, templateHistory } from '../domain/editor';
import { restoreSession, snapshot, type DraftScope, type MarketingDraft } from '../domain/drafts';
import { draftRepository } from '../services/draftStorage';
import { downloadPublication, publicationFilename, renderPublication, type ExportType } from '../services/exportPublication';
import type { ContentSource, PublicationDesign } from '../domain/types';
import '../marketing.css';
import '../editor.css';

export default function Marketing() {
  const owner = useMarketingOwner();
  if (!owner.scope) return <section className="marketing-module" aria-label="Generador de publicaciones"><p role={owner.error ? 'alert' : 'status'}>{owner.error || 'Confirmando tu sesión para Marketing...'}</p>{owner.error && <Button type="button" onClick={owner.retry}>Reintentar identidad</Button>}</section>;
  return <MarketingWorkspace key={`${owner.scope.apiBaseUrl}:${owner.scope.storeId}:${owner.scope.userId}:${owner.sessionKey}`} scope={owner.scope} isCurrent={owner.isCurrent} />;
}

function MarketingWorkspace({ scope, isCurrent }: { scope: DraftScope; isCurrent: () => boolean }) {
  const [params] = useSearchParams();
  const [productId, setProductId] = useState(() => params.get('producto') || '');
  const [sku, setSku] = useState('');
  const [source, setSource] = useState<ContentSource>('product');
  const [design, setDesign] = useState<PublicationDesign>({ format: 'square', layout: 'product-spotlight' });
  const [session, setSession] = useState(initialTemplateHistory);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [pickerVersion, setPickerVersion] = useState(0);
  const [name, setName] = useState(''), [opened, setOpened] = useState<MarketingDraft | null>(null);
  const [showDrafts, setShowDrafts] = useState(false), [drafts, setDrafts] = useState<MarketingDraft[]>([]);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const repository = useMemo(() => draftRepository(scope), [scope.apiBaseUrl, scope.storeId, scope.userId]);
  const previewRef = useRef<HTMLDivElement>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = snapshot(productId, sku, source, design.format, session);
  const serialized = JSON.stringify(current);
  const revision = useRef(serialized); revision.current = serialized;
  const [baseline, setBaseline] = useState(() => JSON.stringify({ publication: current, name: '' }));
  const dirty = !!productId && JSON.stringify({ publication: current, name: name.trim() }) !== baseline;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('Tienes cambios sin guardar en Marketing. ¿Salir y descartarlos?')) blocker.proceed(); else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const loadList = () => { try { setDrafts(repository.list()); setError(''); } catch (error) { setError(message(error)); } };
  useEffect(() => {
    loadList();
    const storage = (event: StorageEvent) => { if (event.key === repository.key || event.key === null) loadList(); };
    window.addEventListener('storage', storage); return () => window.removeEventListener('storage', storage);
  }, [repository]);
  const discard = () => !dirty || window.confirm('Tienes cambios sin guardar. ¿Descartarlos y continuar?');
  function message(error: unknown) { return error instanceof DOMException && error.name === 'SecurityError' ? 'El navegador bloqueó la imagen por sus permisos de seguridad. Revisa las imágenes o prueba otra fuente.' : error instanceof Error ? error.message : 'No pudimos completar la operación. Reintenta.'; }
  const run = (operation: () => void) => {
    try { if (!isCurrent()) throw new Error('Tu sesión cambió. Vuelve a abrir Marketing.'); operation(); setError(''); return true; }
    catch (error) { setError(message(error)); return false; }
  };
  const sources = useMarketingSources();
  const product = sources.products.find(p => p.id === productId);
  const problem = product ? productProblem(product, source) : productId && !sources.loading && !sources.productError ? 'Este producto ya no está disponible en tu catálogo. Selecciona otro.' : null;
  const content = product && !sources.loading ? buildPublication(product, source, sku) : null;
  revision.current = JSON.stringify([current, content, sources.brand, product?.images]);
  const missingVariant = !!product && !problem && !!sku && !content && !sources.loading;
  const changeProduct = (id: string) => { if (id !== productId && !discard()) return; setProductId(id); setSku(''); if (id !== productId) { setSession(initialTemplateHistory()); setSessionVersion(n => n + 1); setOpened(null); if (productId) setName(''); } };
  const refresh = () => { setSku(''); sources.refresh(); };
  const openDraft = (row: MarketingDraft) => {
    if (!discard()) return;
    run(() => {
      const draft = repository.list().find(d => d.id === row.id);
      if (!draft) throw new Error('El borrador ya no está disponible.');
      const p = draft.publication;
      setProductId(p.productId); setSku(p.sku); setSource(p.source); setDesign({ format: p.format, layout: 'product-spotlight' });
      setSession(restoreSession(p)); setSessionVersion(n => n + 1); setPickerVersion(n => n + 1); setOpened(draft); setName(draft.name);
      setBaseline(JSON.stringify({ publication: p, name: draft.name })); setNotice('Borrador abierto. Se consultan de nuevo los productos, precios e identidad de tu tienda.');
      setShowDrafts(false); sources.refresh();
    });
  };
  const saveDraft = () => run(() => {
    const draft = repository.save(name, current, opened?.id, opened?.updatedAt);
    setOpened(draft); setName(draft.name); setBaseline(JSON.stringify({ publication: draft.publication, name: draft.name }));
    setDrafts(repository.list()); setNotice('Borrador guardado en este navegador.');
  });
  const newPublication = () => {
    if (!discard()) return;
    const nextSession = initialTemplateHistory();
    setProductId(''); setSku(''); setSource('product'); setDesign({ format: 'square', layout: 'product-spotlight' }); setSession(nextSession);
    setSessionVersion(n => n + 1); setPickerVersion(n => n + 1); setOpened(null); setName(''); setError(''); setNotice('Nueva publicación. Los borradores anteriores se conservan.');
    setBaseline(JSON.stringify({ publication: snapshot('', '', 'product', 'square', nextSession), name: '' }));
  };
  const exportImage = async (type: ExportType) => {
    const art = previewRef.current?.querySelector<HTMLElement>('.marketing-art');
    if (!art || !content) { setError('Selecciona un producto y una variante disponibles antes de descargar.'); return; }
    setError(''); setBusy(true); const start = revision.current;
    try {
      const blob = await renderPublication(art, design.format, type, () => mounted.current && isCurrent() && revision.current === start);
      downloadPublication(blob, publicationFilename(session.active, design.format, type));
      if (mounted.current) setNotice(`Publicación ${type.toUpperCase()} descargada.`);
    } catch (error) { if (mounted.current) setError(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className="marketing-module" aria-label="Generador de publicaciones">
    <div className="marketing-publication-actions" aria-label="Borradores y descargas" aria-busy={busy}>
      <Input label="Nombre del borrador" value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Ej.: Colección de primavera" />
      <div className="marketing-editor-actions">
        <Button type="button" size="sm" disabled={busy || !productId} onClick={saveDraft}>Guardar borrador</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} aria-expanded={showDrafts} onClick={() => { loadList(); setShowDrafts(value => !value); }}>Mis borradores</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={newPublication}>Nueva publicación</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !content || !sources.brand} onClick={() => void exportImage('png')}>Descargar PNG</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !content || !sources.brand} onClick={() => void exportImage('jpg')}>Descargar JPG</Button>
      </div>
      <p role="status" className="marketing-hint">{busy ? 'Preparando imágenes y fuentes para descargar...' : dirty ? 'Cambios sin guardar.' : opened ? `Borrador «${opened.name}» guardado.` : 'Publicación nueva.'} Los borradores se guardan solo en este navegador.</p>
      {notice && <p role="status" className="marketing-hint">{notice}</p>}
      {error && <p role="alert" className="marketing-editor-warning">{error}</p>}
    </div>
    {showDrafts && <DraftPanel drafts={drafts} onOpen={openDraft} onRename={(draft, nextName) => run(() => {
      const next = repository.rename(draft.id, nextName, draft.updatedAt);
      if (opened?.id === draft.id) {
        setOpened(next); setName(next.name);
        setBaseline(JSON.stringify({ publication: opened.publication, name: next.name }));
      }
      setDrafts(repository.list()); setNotice('Nombre actualizado.');
    })} onDuplicate={draft => run(() => { repository.duplicate(draft.id); setDrafts(repository.list()); setNotice('Copia creada. El original se conserva.'); })}
      onDelete={draft => run(() => { repository.remove(draft.id, draft.updatedAt); if (opened?.id === draft.id) { setOpened(null); setBaseline(''); } setDrafts(repository.list()); setNotice('Borrador eliminado.'); })} />}
    <div className="marketing-intro"><p>Elige un producto y su formato. Tu publicación se compone con los datos y colores de tu tienda.</p>
      <Button type="button" variant="outline" size="sm" disabled={busy || sources.loading} onClick={refresh}>Actualizar datos</Button></div>
    {sources.loading && <LoadingState align="start" spacing="none" className="marketing-loading">Cargando productos e identidad de tu tienda...</LoadingState>}
    {sources.productError && <div role="alert"><Alert variant="error">{sources.productError}</Alert></div>}
    {sources.brandError && <div role="alert"><Alert variant="error">{sources.brandError}</Alert></div>}
    {!sources.loading && (sources.productError || sources.brandError) && <Button type="button" onClick={refresh}>Reintentar carga</Button>}
    <DesignStudio sourceKey={`${sessionVersion}:${productId}:${source}`} sourceData={content} brandData={sources.brand} design={design} images={product?.images || []}
      session={session} onAction={action => setSession(value => templateHistory(value, action))} previewRef={previewRef} busy={busy} selection={
      <div className="marketing-controls"><fieldset disabled={sources.loading || !!sources.productError} className="marketing-control-group">
        <ContentPicker key={pickerVersion} catalogReady={!sources.loading && !sources.productError} source={source} products={sources.products} productId={productId} sku={sku}
          onSource={next => { if (discard()) { setSource(next); setProductId(''); setSku(''); setSession(initialTemplateHistory()); setSessionVersion(n => n + 1); setOpened(null); if (productId) setName(''); } }} onProduct={changeProduct} onSku={setSku} />
      </fieldset><FormatPicker value={design.format} onChange={format => setDesign({ ...design, format })} />
        <p className="marketing-hint">Puedes probar los formatos sin cambiar tu catálogo. Guarda un borrador para continuar después.</p>
        <Link to="/emprendedor/productos" className="marketing-text-link">Administrar productos →</Link>
      </div>} notices={<>
        {sources.brandWarning && <p role="status" className="marketing-notice">{sources.brandWarning}</p>}
        {problem && <div role="status" className="marketing-notice">{problem}</div>}
        {missingVariant && <div role="status" className="marketing-notice">La variante guardada ya no está disponible. Selecciona otra para continuar. <Button type="button" size="sm" onClick={() => setSku('')}>Usar una variante disponible</Button></div>}
        </>} empty={<div className="marketing-preview-empty"><span className="marketing-empty-mark" aria-hidden="true">↗</span><h3>Tu próxima publicación empieza aquí</h3><p>{sources.loading ? 'Estamos consultando los datos de tu tienda.' : sources.brandError ? 'Carga la identidad de tu tienda para generar la vista previa.' : 'Selecciona un producto disponible para ver su composición.'}</p></div>} />
  </section>;
}
