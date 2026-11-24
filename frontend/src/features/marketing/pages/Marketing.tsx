import { useFeedback } from '../../../shared/components/FeedbackProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingState } from '../../../shared/components/states';
import { Link, useBlocker, useSearchParams } from 'react-router-dom';
import { Alert, Button, Input } from '../../admin/components/ui';
import { buildPublication, productProblem, publicationImages, formatMarketingMoney } from '../domain/content';
import type { CatalogSelection } from '../components/CatalogMedia';
import { useMarketingSources } from '../hooks/useMarketingSources';
import { PublishedContentPicker } from '../components/PublishedContentPicker';
import { ContentPicker } from '../components/ContentPicker';
import { FormatPicker } from '../components/FormatPicker';
import { DesignStudio } from '../components/DesignStudio';
import { InstagramPublisher } from '../components/InstagramPublisher';
import { DraftPanel } from '../components/DraftPanel';
import { MarketingSections } from '../components/MarketingSections';
import { useMarketingOwner } from '../hooks/useMarketingOwner';
import { initialTemplateHistory, templateHistory } from '../domain/editor';
import { restoreSession, snapshot, type DraftScope, type MarketingDraft } from '../domain/drafts';
import { draftRepository } from '../services/draftStorage';
import { downloadPublication, publicationFilename, renderPublication, type ExportType } from '../services/exportPublication';
import type { ContentSource, PublicationDesign } from '../domain/types';
import { useAdmin } from '../../admin/context/AdminContext';
import { templatePaths } from '../../admin/config/navigation';
import { resolveSharingItem } from '../services/sharingService';
import { sharingKey, type SharingItem, type SharingReference } from '../domain/sharing';
import type { PublicationFormat } from '../domain/types';
import '../marketing.css';
import '../editor.css';

export default function Marketing() {
  const owner = useMarketingOwner();
  if (!owner.scope) return <section className="marketing-module" aria-label="Generador de publicaciones"><p role={owner.error ? 'alert' : 'status'}>{owner.error || 'Confirmando tu sesión para Marketing...'}</p>{owner.error && <Button type="button" onClick={owner.retry}>Reintentar identidad</Button>}</section>;
  return <MarketingWorkspace key={`${owner.scope.apiBaseUrl}:${owner.scope.storeId}:${owner.scope.userId}:${owner.sessionKey}`} scope={owner.scope} isCurrent={owner.isCurrent} />;
}

function MarketingWorkspace({ scope, isCurrent }: { scope: DraftScope; isCurrent: () => boolean }) {
  const uiFeedback = useFeedback();

  const [params] = useSearchParams();
  const {config}=useAdmin();
  const home=window.location.origin+templatePaths[config.template];
  const [sharingReference,setSharingReference]=useState<SharingReference>();
  const [sharingItem,setSharingItem]=useState<SharingItem|null>(null);
  const [sharingLoading,setSharingLoading]=useState(false);
  const [sharingAttempt,setSharingAttempt]=useState(0);
  const [productId, setProductId] = useState(() => params.get('producto') || '');
  const [sku, setSku] = useState('');
  const [source, setSource] = useState<ContentSource>('product');
  const [design, setDesign] = useState<PublicationDesign>({ format: 'square', layout: 'product-spotlight' });
  const [session, setSession] = useState(initialTemplateHistory);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [pickerVersion, setPickerVersion] = useState(0);
  const [name, setName] = useState(''), [opened, setOpened] = useState<MarketingDraft | null>(null);
  const [showDrafts, setShowDrafts] = useState(false), [drafts, setDrafts] = useState<MarketingDraft[]>([]);
  const draftsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showDrafts) {
      draftsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      draftsRef.current?.focus({ preventScroll: true });
    }
  }, [showDrafts]);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const savingRef = useRef(false);
  const [preparedInstagram, setPreparedInstagram] =
    useState<{ file: File; revision: string } | null>(null);
  const repository = useMemo(() => draftRepository(scope), [scope.apiBaseUrl, scope.storeId, scope.userId]);
  const previewRef = useRef<HTMLDivElement>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = snapshot(productId, sku, source, design.format, session, sharingReference);
  const serialized = JSON.stringify(current);
  const revision = useRef(serialized); revision.current = serialized;
  const [baseline, setBaseline] = useState(() => JSON.stringify({ publication: current, name: '' }));
  const dirty = (!!productId||!!sharingReference) && JSON.stringify({ publication: current, name: name.trim() }) !== baseline;
  const [campaignDirty, setCampaignDirty] = useState(false);
  const [mediaDirty, setMediaDirty] = useState(false);
  const hasUnsavedChanges = dirty || campaignDirty || mediaDirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => hasUnsavedChanges && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if(blocker.state!=='blocked')return;
    let current=true;
    void uiFeedback.confirm({title:'Salir de Marketing',message:'Tienes cambios sin guardar en Marketing. ¿Salir y descartarlos?',confirmLabel:'Salir y descartar'}).then(accepted=>{if(current){if(accepted)blocker.proceed();else blocker.reset();}});
    return()=>{current=false;};
  }, [blocker,uiFeedback]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [hasUnsavedChanges]);
  const loadList = () => { try { setDrafts(repository.list()); setError(''); } catch (error) { setError(message(error)); } };
  useEffect(() => {
    loadList();
    const storage = (event: StorageEvent) => { if (event.key === repository.key || event.key === null) loadList(); };
    window.addEventListener('storage', storage); return () => window.removeEventListener('storage', storage);
  }, [repository]);
  const discard = async () => !dirty || (await uiFeedback.confirm({title:"Descartar cambios",confirmLabel:"Descartar cambios",message:'Tienes cambios sin guardar. ¿Descartarlos y continuar?'}));
  function message(error: unknown) { return error instanceof DOMException && error.name === 'SecurityError' ? 'El navegador bloqueó la imagen por sus permisos de seguridad. Revisa las imágenes o prueba otra fuente.' : error instanceof Error ? error.message : 'No pudimos completar la operación. Reintenta.'; }
  const run = (operation: () => void) => {
    setNotice('');
    try { if (!isCurrent()) throw new Error('Tu sesión cambió. Vuelve a abrir Marketing.'); operation(); setError(''); return true; }
    catch (error) { setError(message(error)); return false; }
  };
  const sources = useMarketingSources();
  const product = sources.products.find(p => p.id === productId);
  const problem = product ? productProblem(product, source) : productId && !sources.loading && !sources.productError ? 'Este producto ya no está disponible en tu catálogo. Selecciona otro.' : null;
  const content = sharingReference ? sharingItem?.content||null : product && !sources.loading ? buildPublication(product, source, sku) : null;
  const images=sharingReference?sharingItem?.images||[]:product?publicationImages(product,sku,source):[];
  const sharingKeyValue=sharingReference?sharingKey(sharingReference):'';
  useEffect(()=>{
    if(!sharingReference){setSharingItem(null);return;}
    const controller=new AbortController();setSharingLoading(true);setSharingItem(null);
    resolveSharingItem(sharingReference,home,controller.signal).then(item=>{if(!controller.signal.aborted&&isCurrent())setSharingItem(item);}).catch(cause=>{if(!controller.signal.aborted&&isCurrent())setError(message(cause));}).finally(()=>{if(!controller.signal.aborted&&isCurrent())setSharingLoading(false);});
    return()=>controller.abort();
  },[sharingKeyValue,home,sharingAttempt]);
  revision.current = JSON.stringify([current, content, sources.brand, images]);

  const readyInstagram = preparedInstagram?.revision === revision.current
    ? preparedInstagram : null;

  const instagramCaption = content ? Array.from([
    content.productName,
    sharingItem?.description || content.description || '',
    !content.hidePrice
      ? `${content.fromPrice ? 'Desde ' : ''}${formatMarketingMoney(content.price)} CLP`
      : '',
    sources.brand?.name || ''
  ].filter(Boolean).join('\n\n')).slice(0, 2200).join('') : '';

  function canShareInstagram(file: File): boolean {
    try {
      return typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  async function copyInstagramCaption() {
    if (!instagramCaption || !isCurrent()) return;
    setError('');
    try {
      await navigator.clipboard.writeText(instagramCaption);
      setNotice('Descripci\u00f3n copiada. Puedes pegarla en Instagram.');
    } catch {
      setNotice('Abre Ver descripci\u00f3n y copia el texto manualmente.');
    }
  }

  async function sharePreparedInstagram() {
    if (!readyInstagram || !isCurrent() || busy || savingRef.current) return;
    setError('');

    if (!canShareInstagram(readyInstagram.file)) {
      downloadPublication(readyInstagram.file, readyInstagram.file.name);
      setNotice('Abre Instagram y selecciona la imagen descargada.');
      return;
    }

    savingRef.current = true;
    setBusy(true);

    try {
      await navigator.share({ files: [readyInstagram.file] });
      if (mounted.current)
        setNotice('Imagen compartida con la aplicaci\u00f3n elegida. Revisa y confirma all\u00ed tu publicaci\u00f3n.');
    } catch (cause) {
      if (mounted.current && !(cause instanceof DOMException && cause.name === 'AbortError'))
        setError('No se pudo compartir. Puedes descargar el JPG manualmente.');
    } finally {
      savingRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const missingVariant = !!product && !problem && !!sku && !content && !sources.loading;
  const changeProduct = async (id: string) => { if (id !== productId && !(await discard())) return; setNotice(''); setProductId(id); setSku(''); if (id !== productId) { setSession(initialTemplateHistory()); setSessionVersion(n => n + 1); setOpened(null); if (productId) setName(''); } };
  const refresh = () => { setSku(''); sources.refresh();setSharingAttempt(value=>value+1); };
  const openDraft = async (row: MarketingDraft) => {
    if (!(await discard())) return;
    run(() => {
      const draft = repository.list().find(d => d.id === row.id);
      if (!draft) throw new Error('El borrador ya no está disponible.');
      const p = draft.publication;
      setSharingReference(p.sharingReference);setSharingItem(null);
      setSharingAttempt(value => value + 1);
      setProductId(p.productId); setSku(p.sku); setSource(p.source); setDesign({ format: p.format, layout: 'product-spotlight' });
      setSession(restoreSession(p)); setSessionVersion(n => n + 1); setPickerVersion(n => n + 1); setOpened(draft); setName(draft.name);
      setBaseline(JSON.stringify({ publication: p, name: draft.name })); setNotice('Borrador abierto. Se consultan de nuevo los productos, precios e identidad de tu tienda.');
      setShowDrafts(false); sources.refresh();
    });
  };
  const saveDraft = async () => {
    if (savingRef.current || busy || !dirty || (!productId&&!sharingReference)) return;
    savingRef.current = true; setSavingDraft(true); setBusy(true);
    try {
      run(() => {
        const draft = repository.save(name, current, opened?.id, opened?.updatedAt);
        setOpened(draft); setName(draft.name); setBaseline(JSON.stringify({ publication: draft.publication, name: draft.name }));
        setNotice('Borrador guardado correctamente en este navegador. No está publicado.');
        setDrafts(repository.list());
      });
    } finally { savingRef.current = false; setSavingDraft(false); setBusy(false); }
  };
  const newPublication = async () => {
    if (!(await discard())) return;
    const nextSession = initialTemplateHistory();
    setSharingReference(undefined);setSharingItem(null);
    setProductId(''); setSku(''); setSource('product'); setDesign({ format: 'square', layout: 'product-spotlight' }); setSession(nextSession);
    setSessionVersion(n => n + 1); setPickerVersion(n => n + 1); setOpened(null); setName(''); setError(''); setNotice('Nueva publicación. Los borradores anteriores se conservan.');
    setBaseline(JSON.stringify({ publication: snapshot('', '', 'product', 'square', nextSession), name: '' }));
  };
  const exportImage = async (type: ExportType, forInstagram = false) => {
    if (busy || savingRef.current) return;
    const art = previewRef.current?.querySelector<HTMLElement>('.marketing-art');
    if (!art || !content) { setError('Selecciona un producto y una variante disponibles antes de descargar.'); return; }
    savingRef.current = true;
    setError(''); setNotice(''); setBusy(true); const start = revision.current;
    try {
      if(sharingReference){const fresh=await resolveSharingItem(sharingReference,home,new AbortController().signal);if(JSON.stringify([fresh.content,fresh.images])!==JSON.stringify([sharingItem?.content,sharingItem?.images])){setSharingItem(fresh);throw new Error('El contenido cambió. Revisa la vista previa actualizada y vuelve a descargar.');}}
      const blob = await renderPublication(art, design.format, type, () => mounted.current && isCurrent() && revision.current === start);
      if (forInstagram) {
        if (!mounted.current || !isCurrent() || revision.current !== start) return;

        const file = new File(
          [blob],
          publicationFilename(session.active, design.format, 'jpg'),
          { type: 'image/jpeg' }
        );

        setPreparedInstagram({ file, revision: start });

        if (canShareInstagram(file)) {
          setNotice('Imagen preparada. Presiona Compartir imagen y elige Instagram si aparece.');
        } else {
          downloadPublication(file, file.name);
          setNotice('Imagen descargada. Copia la descripci\u00f3n y abre Instagram para publicarla.');
        }
        return;
      }

      downloadPublication(blob, publicationFilename(session.active, design.format, type));
      if (mounted.current) setNotice(`Archivo ${type.toUpperCase()} generado. Se solicitó su descarga al navegador.`);
    } catch (error) { if (mounted.current) setError(message(error)); }
    finally { savingRef.current = false; if (mounted.current) setBusy(false); }
  };
  async function prepareCatalog(selection: CatalogSelection): Promise<boolean> {
    if (!(await discard()) || !isCurrent()) return false;
    const next = initialTemplateHistory();
    for (const history of Object.values(next.documents)) history.present.imageIndex = selection.imageIndex;
    setSharingReference(undefined); setSharingItem(null); setProductId(selection.productId); setSku(selection.sku); setSource('product');
    setSession(next); setSessionVersion(value=>value+1); setPickerVersion(value=>value+1); setOpened(null); setName(''); setError(''); setNotice('Producto y variante preparados desde el catálogo, sin copiar archivos.');
    sources.refresh();
    return true;
  }
  async function prepareSharing(item:SharingItem|SharingReference,format:PublicationFormat):Promise<boolean>{
    if(!(await discard())||!isCurrent())return false;
    const fresh=await resolveSharingItem('reference' in item ? item.reference : item,home,new AbortController().signal);
    if(!mounted.current||!isCurrent())return false;
    const next=initialTemplateHistory();
    for(const history of Object.values(next.documents))history.present={...history.present,showDescription:true,...(fresh.group==='Servicios'||fresh.group==='Talleres'?{campaignLayout:'classic' as const,fit:'contain' as const,mediaSide:history.present.template==='minimal'?'end' as const:'start' as const}:{}),cta:fresh.group==='Servicios'||fresh.group==='Talleres'?'Solicita información en nuestra tienda':'Conoce más en nuestra tienda'};
    // Al preparar un PRODUCTO desde Difusión, usar el editor de catálogo para habilitar la selección de SKU.
    const fromProduct = fresh.reference.kind === 'product';
    setProductId(fromProduct ? fresh.reference.id : '');setSku('');setSource('product');setDesign({format,layout:'product-spotlight'});setSharingReference(fromProduct ? undefined : fresh.reference);setSharingItem(fromProduct ? null : fresh);setSharingAttempt(value=>value+1);setSession(next);setSessionVersion(value=>value+1);setOpened(null);setName('');setError('');setNotice('Contenido publicado preparado. Personaliza y descarga tu publicación.');
    return true;
  }
  return <MarketingSections home={home} products={sources.products} catalogStatus={{loading:sources.loading,error:sources.productError,retry:sources.refresh}} onSelectProduct={prepareCatalog} onUseImage={id=>prepareSharing({kind:'library',id},'square')} busy={busy} isCurrent={isCurrent} onCampaignDirty={setCampaignDirty} onMediaDirty={setMediaDirty}><section className="marketing-module" aria-label="Generador de publicaciones">
    {showDrafts && <div ref={draftsRef} tabIndex={-1} className="scroll-mt-24" aria-label="Listado de borradores"><DraftPanel drafts={drafts} onOpen={openDraft} onRename={(draft, nextName) => run(() => {
      const next = repository.rename(draft.id, nextName, draft.updatedAt);
      if (opened?.id === draft.id) {
        setOpened(next); setName(next.name);
        setBaseline(JSON.stringify({ publication: opened.publication, name: next.name }));
      }
      setDrafts(repository.list()); setNotice('Nombre actualizado.');
    })} onDuplicate={draft => run(() => { repository.duplicate(draft.id); setDrafts(repository.list()); setNotice('Copia creada. El original se conserva.'); })}
      onDelete={draft => run(() => { repository.remove(draft.id, draft.updatedAt); if (opened?.id === draft.id) { setOpened(null); setBaseline(''); } setDrafts(repository.list()); setNotice('Borrador eliminado.'); })} /></div>}
    <div className="marketing-intro"><p>Elige contenido publicado y su formato. Tu publicación se compone con los datos y colores de tu tienda.</p>
      <Button type="button" variant="outline" size="sm" disabled={busy || sources.loading} onClick={refresh}>Actualizar datos</Button></div>
    {sharingLoading&&<LoadingState>Cargando contenido publicado para la composición…</LoadingState>}
    {sources.loading && <LoadingState align="start" spacing="none" className="marketing-loading">Cargando productos e identidad de tu tienda...</LoadingState>}
    {sources.productError && <div role="alert"><Alert variant="error">{sources.productError}</Alert></div>}
    {sources.brandError && <div role="alert"><Alert variant="error">{sources.brandError}</Alert></div>}
    {!sources.loading && (sources.productError || sources.brandError) && <Button type="button" onClick={refresh}>Reintentar carga</Button>}
    <DesignStudio sourceKey={`${sessionVersion}:${productId}:${source}:${sharingKeyValue}`} sourceData={content} brandData={sources.brand} design={design} images={images}
      session={session} onAction={action => { setNotice(''); setSession(value => templateHistory(value, action)); }} previewRef={previewRef} busy={busy} selection={
      <div className="marketing-controls"><PublishedContentPicker home={home} mode="activities" onSelect={selection=>prepareSharing({kind:'section',id:selection.id},design.format)} /><fieldset disabled={sharingReference?sharingLoading:sources.loading || !!sources.productError} className="marketing-control-group">
        {sharingReference?<div><p>{sharingReference.kind === 'library' ? 'Imagen de la biblioteca' : 'Contenido publicado'}: {sharingItem?.title||'verificando contenido…'}</p><Button type="button" variant="outline" onClick={async ()=>{if((await discard())){setSharingReference(undefined);setSharingItem(null);setProductId('');setSession(initialTemplateHistory());setSessionVersion(value=>value+1);setOpened(null);}}}>Elegir un producto en su lugar</Button></div>:<ContentPicker key={pickerVersion} catalogReady={!sources.loading && !sources.productError} source={source} products={sources.products} productId={productId} sku={sku}
          onSource={async next => { if ((await discard())) { setNotice(''); setSource(next); setProductId(''); setSku(''); setSession(initialTemplateHistory()); setSessionVersion(n => n + 1); setOpened(null); if (productId) setName(''); } }} onProduct={changeProduct} onSku={value => { setNotice(''); setSku(value); }} />}
      </fieldset><FormatPicker value={design.format} onChange={format => { setNotice(''); setDesign({ ...design, format }); }} />
        <p className="marketing-hint">Puedes probar los formatos sin cambiar tu catálogo. Guarda un borrador para continuar después.</p>
        <Link to="/emprendedor/productos" className="marketing-text-link">Administrar productos →</Link>
        {product?.slug && <a href={`${home}/producto/${encodeURIComponent(product.slug)}`} target="_blank" rel="noopener noreferrer" className="marketing-text-link">Ver producto en la tienda ↗</a>}
      </div>} notices={<>
        {sources.brandWarning && <p role="status" className="marketing-notice">{sources.brandWarning}</p>}
        {problem && <div role="status" className="marketing-notice">{problem}</div>}
        {missingVariant && <div role="status" className="marketing-notice">La variante guardada ya no está disponible. Selecciona otra para continuar. <Button type="button" size="sm" onClick={() => setSku('')}>Usar una variante disponible</Button></div>}
        </>} empty={<div className="marketing-preview-empty"><span className="marketing-empty-mark" aria-hidden="true">↗</span><h3>Tu próxima publicación empieza aquí</h3><p>{sources.loading ? 'Estamos consultando los datos de tu tienda.' : sources.brandError ? 'Carga la identidad de tu tienda para generar la vista previa.' : 'Selecciona un producto, servicio o taller publicado para ver su composición.'}</p></div>} />
    <div className="marketing-publication-actions" aria-label="Acciones de publicación" aria-busy={busy}>

      <div className="mk-publication-heading"><strong>Tu publicación</strong><span>{dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}</span></div>
      <Input label="Nombre del borrador" value={name} maxLength={80} disabled={busy} onChange={event => { setNotice(''); setName(event.target.value); }} placeholder="Ej.: Colección de primavera" />
      <p className="marketing-hint">Descarga tu diseño y publícalo en cualquier red social, o utiliza la integración oficial de Instagram si tu cuenta está autorizada.</p>
      <div className="marketing-editor-actions marketing-primary-actions">
        <Button type="button" size="sm" disabled={busy || !content || !sources.brand} onClick={() => void exportImage('jpg')}>Descargar publicación (JPG)</Button>
        <InstagramPublisher disabled={busy || !content || !sources.brand} square={design.format === 'square'} revision={revision.current} initialCaption={instagramCaption} generate={async () => {
          if (design.format !== 'square') throw new Error('Instagram admite inicialmente publicaciones individuales cuadradas.');
          if (readyInstagram) return readyInstagram.file;
          const art = previewRef.current?.querySelector<HTMLElement>('.marketing-art');
          if (!art || !content || !isCurrent()) throw new Error('Selecciona contenido disponible antes de continuar.');
          const start = revision.current;
          if (sharingReference) {
            const fresh = await resolveSharingItem(sharingReference, home, new AbortController().signal);
            if (JSON.stringify([fresh.content, fresh.images]) !== JSON.stringify([sharingItem?.content, sharingItem?.images])) {
              setSharingItem(fresh); throw new Error('El contenido cambió. Revisa la composición actualizada antes de publicar.');
            }
          }
          const blob = await renderPublication(art, 'square', 'jpg', () => mounted.current && isCurrent() && revision.current === start);
          return new File([blob], publicationFilename(session.active, 'square', 'jpg'), {type: 'image/jpeg'});
        }} />
        <Button type="button" size="sm" variant="outline" disabled={busy || (!productId&&!sharingReference) || !dirty} onClick={() => void saveDraft()}>{savingDraft ? 'Guardando…' : 'Guardar borrador'}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} aria-expanded={showDrafts} onClick={() => { loadList(); setShowDrafts(true); draftsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); draftsRef.current?.focus({ preventScroll: true }); }}>Mis borradores</Button>
      </div>
      {design.format !== 'square' && <p className="marketing-hint">La publicación directa requiere formato cuadrado. Puedes descargar este formato para publicarlo manualmente.</p>}
      <p className="marketing-hint">¿Quieres enviar una oferta especial o una campaña de temporada por correo? <Link to="/emprendedor/marketing#campanas" className="marketing-text-link">Ir a Correos y campañas →</Link></p>
      <div className="mk-publication-group" style={{marginTop: 12}}>
        <h3>Publicar manualmente en redes sociales</h3>
        <p className="marketing-hint">1. Descarga la imagen. 2. Copia la descripción si la necesitas. 3. Abre Instagram, Facebook o WhatsApp y adjunta la imagen manualmente. En WhatsApp puedes pegar el texto como pie de foto antes de enviar.</p>
        <div className="mk-publication-secondary-actions">
          <Button type="button" size="sm" variant="outline" disabled={busy || !content} onClick={() => void copyInstagramCaption()}>Copiar descripción</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')}>Abrir Instagram</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.open('https://www.facebook.com/', '_blank', 'noopener,noreferrer')}>Abrir Facebook</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.open('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer')}>Abrir WhatsApp</Button>
        </div>
        <details><summary>Ver descripción para copiar manualmente</summary><textarea aria-label="Descripción de la publicación" readOnly rows={4} value={instagramCaption} style={{width:'100%',padding:10}} /></details>
      </div>
      <details className="mk-publication-more">
        <summary>Más opciones</summary>
        <div className="mk-publication-more-body">
          <div className="mk-publication-group">
            <h3>Borradores</h3>
            <div className="mk-publication-secondary-actions">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={newPublication}>Nueva publicación</Button>
            </div>
          </div>
          <div className="mk-publication-group">
            <h3>Descargar y compartir</h3>
            <div className="mk-publication-secondary-actions">
        <Button type="button" size="sm" variant="outline" disabled={busy || !content || !sources.brand} onClick={() => void exportImage('png')}>Descargar PNG</Button>
        <Button type="button" size="sm"
          disabled={busy || !content || !sources.brand}
          onClick={() => void exportImage('jpg', true)}>
          Preparar para publicación manual
        </Button>
        {readyInstagram && canShareInstagram(readyInstagram.file) &&
          <Button type="button" size="sm" disabled={busy}
            onClick={() => void sharePreparedInstagram()}>
            Compartir imagen
          </Button>
        }
            </div>
          </div>
        </div>
      </details>
      <p className="marketing-hint">{busy ? savingDraft ? 'Guardando borrador…' : 'Preparando imágenes y fuentes para descargar...' : dirty ? 'Cambios sin guardar.' : 'Sin cambios pendientes.'} Los borradores se guardan solo en este navegador.</p>
      {notice && !error && <div role="status"><Alert variant="success">{notice}</Alert></div>}
      {error && <div role="alert"><Alert variant="error">{error}</Alert></div>}
    </div>
  </section></MarketingSections>;
}
