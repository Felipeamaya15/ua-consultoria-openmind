import { BlockAppearanceInspector } from '../visualEditor/blocks';
import { editBlockAppearance } from '../../storefront/visual/blockAppearance';
import type { SetStateAction } from 'react';
import type { EditorDocument } from '../visualEditor/model';
import { createHistory, recordHistory, undoHistory, redoHistory } from '../visualEditor/history';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { useStoreIdentity } from '../../storefront/context/StoreIdentityContext';
import { readStoredStoreConfig } from '../../storefront/visual/storage';
import { templatePaths } from '../config/navigation';
import type { TemplateId } from '../data/mockAdminData';
import { VISUAL_SECTIONS, type VisualSectionId } from '../visualEditor/sections';
import { createEditorDocument, editScopedProperty, isEditorDirty, publishEditorDocument, resetProperty, resetSection, resolveEditorDocument, restorePreset, sectionOverridePath } from '../visualEditor/model';
import { VisualInspector, getInspectorGroups } from '../visualEditor/inspector';
import { LegacyImageInspector } from '../visualEditor/images';
import { FieldHelp, SECTION_HELP } from '../visualEditor/help';
import { optionLabel } from '../visualEditor/controls';
import { STORE_PAGES, previewPath, CHECKOUT_PREVIEW_STEPS, type PreviewPageId } from '../../storefront/visual/pages';
import { connectVisualPreview } from '../visualEditor/preview';
import { TemplateGallery } from '../visualEditor/templates';
import { ContentInspector } from '../visualEditor/content';
import { fetchLandingConfig, saveBlockStyles } from '../../landing/services/landingService';
import '../admin.css';
import '../visualEditor/editor.css';
import '../visualEditor/workspace.css';
const ABSENT_SECTION_NOTICE = 'Esta sección no está visible en esta página. Sus ajustes se aplicarán cuando tenga contenido o esté habilitada.';

export default function ThemeEditor() {
  const { config, setConfig, storageError } = useAdmin();
  const { identity } = useStoreIdentity();
  const [params, setParams] = useSearchParams();
  const requested = params.get('plantilla');
  const template: TemplateId = requested && Object.prototype.hasOwnProperty.call(templatePaths, requested) ? requested as TemplateId : config.template;
  const load = () => createEditorDocument(config, template, readStoredStoreConfig(identity));
  const [baseline, setBaseline] = useState(load);
  const [history, setHistory] = useState(() => createHistory(load()));
  const draft = history.present;
  const setDraft = (next: SetStateAction<EditorDocument>) => { if (saving) return; setSaved(false); setHistory(current => recordHistory(current, typeof next === 'function' ? next(current.present) : next)); };
  const [contentError, setContentError] = useState('');
  const [tool, setTool] = useState<'templates' | 'style' | 'content' | 'images'>('style');
  const [editScope, setEditScope] = useState<'all' | 'device'>('all');
  const [zoom, setZoom] = useState('fit');
  const [expanded, setExpanded] = useState(false);
  const templateDrafts = useRef<Partial<Record<TemplateId, { baseline: EditorDocument; history: typeof history }>>>({});
  const previousTemplate = useRef(template);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [selectedSection, setSelectedSection] = useState<VisualSectionId>('hero');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewPage, setPreviewPage] = useState<PreviewPageId>('home');
  const previewProduct = 'ejemplo-editor';
  const [inspectorGroup, setInspectorGroup] = useState<string>();
  const [registerPreview, setRegisterPreview] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState('contact');
  const activePage = previewPage === 'home' ? 'login' : previewPage === 'checkout' && checkoutStep === 'confirm' ? 'confirmation' : previewPage;
  const relativePreviewPath = previewPath(previewPage, previewProduct, registerPreview);
  const publicPageUrl = `${templatePaths[template]}${relativePreviewPath ? '/' + relativePreviewPath : ''}`;
  const previewUrl = `${publicPageUrl}${publicPageUrl.includes('?') ? '&' : '?'}visualExample=1${previewPage === 'checkout' ? '&visualStep=' + checkoutStep : ''}`;
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const [sectionPresent, setSectionPresent] = useState(true);
  const [restoreRequested, setRestoreRequested] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string>();
  const selectedBlock = draft.landing?.contenido?.bloques?.find(block => block.id === selectedBlockId);
  const [contentImage, setContentImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ key: string; src: string; legacyKey?: string } | null>(null);
  const [navigationHref, setNavigationHref] = useState<string>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const connection = useRef<ReturnType<typeof connectVisualPreview> | null>(null);
  const frameWrap = useRef<HTMLDivElement>(null);
  const leaveDialog = useRef<HTMLDivElement>(null);
  const [previewBounds, setPreviewBounds] = useState({ width: 900, height: 700 });
  const frameWidth = viewport === 'mobile' ? 375 : viewport === 'tablet' ? 768 : 1440;
  const previewScale = zoom === 'fit' ? Math.min(1, Math.max(1, previewBounds.width - 32) / frameWidth) : Number(zoom) / 100;
  const effective = useMemo(() => resolveEditorDocument(draft, template), [draft, template]);
  const latest = useRef({ effective, draft, selectedSection, imageMode }); latest.current = { effective, draft, selectedSection, imageMode };
  const draftDirty = isEditorDirty(draft, baseline);
  const cachedDirty = Object.entries(templateDrafts.current).some(([id, item]) => id !== template && item && isEditorDirty(item.history.present, item.baseline));
  const dirty = draftDirty || cachedDirty || template !== config.template;
  const discarding = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const nextTemplate = new URLSearchParams(nextLocation.search).get('plantilla');
    const tryingAnotherTemplate = currentLocation.pathname === nextLocation.pathname && nextTemplate && Object.prototype.hasOwnProperty.call(templatePaths, nextTemplate);
    return !discarding.current && !tryingAnotherTemplate && dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search);
  });
  useEffect(() => {
    const controller = new AbortController();
    void fetchLandingConfig({signal:controller.signal}).then(landing => {
      if (controller.signal.aborted) return;
      if (!landing || String(landing.tienda) !== identity?.storeId) { setContentError('No hay una portada disponible para esta tienda. Configúrala desde Mi tienda.'); return; }
      const blockStyles = landing.contenido?.apariencia_bloques?.[template] ?? config.themeEditor[template]?.blockStyles;
      setBaseline(current => ({...current,landing,...(blockStyles ? {blockStyles} : {})}));
      setHistory(current => ({...current, present:{...current.present,landing,...(blockStyles ? {blockStyles} : {})}, past:current.past.map(item => ({...item,landing,...(blockStyles ? {blockStyles} : {})})), future:current.future.map(item => ({...item,landing,...(blockStyles ? {blockStyles} : {})}))}));
    }).catch(() => { if (!controller.signal.aborted) setContentError('No pudimos cargar el contenido. Tus ajustes visuales siguen disponibles. Recarga para volver a intentar.'); });
    return () => controller.abort();
  }, [identity?.storeId]);
  useEffect(() => { discarding.current = false; }, [template]);
  useEffect(() => {
    if (blocker.state !== 'blocked' && !restoreRequested) return;
    const previousFocus = document.activeElement;
    leaveDialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [blocker.state, restoreRequested]);
  useEffect(() => {
    if (previousTemplate.current === template) return;
    templateDrafts.current[previousTemplate.current] = { baseline, history };
    const cached = templateDrafts.current[template];
    const remoteStyles = baseline.landing?.contenido?.apariencia_bloques?.[template];
    const next = { ...(cached?.baseline ?? load()), ...(!cached && remoteStyles ? {blockStyles:remoteStyles} : {}), ...(baseline.landing ? {landing: baseline.landing} : {}) };
    const nextHistory = cached?.history ?? createHistory(next);
    const content = draft.landing;
    setBaseline(next); setHistory({...nextHistory, present: {...nextHistory.present, ...(content ? {landing: content} : {})}, past: nextHistory.past, future: nextHistory.future});
    previousTemplate.current = template;
    setSaved(false); setSelectedImage(null);
    if (template !== 'visual' && previewPage === 'story') changePage('home');
    setNotice('Plantilla en prueba. Tus personalizaciones se conservan al volver. Guarda para aplicar esta elección.');
  }, [template]);
  useEffect(() => { connection.current?.content(draft.landing); }, [draft.landing]);
  useEffect(() => { connection.current?.update(effective, draft.images); }, [effective, draft.images]);
  useEffect(() => { connection.current?.updateBlocks(draft.blockStyles ?? {}); }, [draft.blockStyles]);
  useEffect(() => { connection.current?.imageMode(imageMode); }, [imageMode]);
  useEffect(() => () => connection.current?.disconnect(), []);
  useEffect(() => {
    const element = frameWrap.current; if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setPreviewBounds({ width, height }); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (saving) return;
      if (event.key === 'Escape') { setExpanded(false); return; }
      if (!(event.ctrlKey || event.metaKey) || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable=true]'))) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); setHistory(event.shiftKey ? redoHistory : undoHistory); }
      else if (event.key.toLowerCase() === 'y') { event.preventDefault(); setHistory(redoHistory); }
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [saving]);
  function selectSection(section: VisualSectionId) {
    setSelectedBlockId(undefined); setInspectorOpen(true); setTool('style'); setContentImage(false);
    setSelectedSection(section); setInspectorGroup(undefined); setSelectedImage(null); setNavigationHref(undefined); setImageMode(false);
    if (section === 'catalog' && previewPage !== 'catalog') { setPreviewPage('catalog'); setNotice('Abriendo el catálogo en vista previa.'); return; }
    const found = connection.current?.focus(section);
    setNotice(found ? '' : ABSENT_SECTION_NOTICE);
  }
  function onLoad() {
    connection.current?.disconnect();
    const doc = iframeRef.current?.contentDocument; if (!doc) return;
    connection.current = connectVisualPreview(doc, (section, href, group) => { setSelectedBlockId(undefined); setInspectorOpen(true); setTool('style'); setContentImage(false); setImageMode(false); setSelectedSection(section); setInspectorGroup(group); setSelectedImage(null); setNavigationHref(href); setNotice(''); }, (key, src, legacyKey) => { setSelectedBlockId(undefined); setInspectorOpen(true); setTool('images'); setContentImage(false); setEditScope('all'); setImageMode(true); setSelectedImage({ key, src, legacyKey }); }, (institutional, section) => { setSelectedBlockId(undefined); setSelectedImage(null); setInspectorOpen(true); setTool(institutional ? 'style' : 'content'); setContentImage(!institutional); setEditScope('all'); setImageMode(false); setSelectedSection(section ?? (institutional ? 'topBar' : 'hero')); setInspectorGroup(undefined); setNotice(institutional ? 'La identidad institucional es obligatoria y su logo no se puede reemplazar.' : 'Administra esta imagen desde Página principal. Las fotos de productos se administran en Productos.'); }, setSectionPresent, id => {setSelectedBlockId(id);setSelectedImage(null);setImageMode(false);setTool('style');setInspectorOpen(true);setNotice('');});
    connection.current.imageMode(latest.current.imageMode);
    connection.current.update(latest.current.effective, latest.current.draft.images);
    connection.current.content(latest.current.draft.landing);
    connection.current.updateBlocks(latest.current.draft.blockStyles ?? {});
    if (selectedBlockId) connection.current.focusBlock(selectedBlockId);
    else connection.current.focus(latest.current.selectedSection);
  }
  function save() {
    if (saving) return;
    const submitted = draft;
    setSaving(true); setSaveError(false);
    requestAnimationFrame(() => { void (async () => {
      const savedContent = baseline.landing;
      try {
        const pending = [...Object.entries(templateDrafts.current).filter(([id]) => id !== template).map(([id,item]) => ({id,document:item!.history.present,baseline:item!.baseline})), {id:template,document:submitted,baseline}];
        for (const item of pending) if (JSON.stringify(item.document.blockStyles ?? {}) !== JSON.stringify(item.baseline.blockStyles ?? {})) await saveBlockStyles(item.id, item.document.blockStyles ?? {});
        let nextConfig = config;
        for (const [id, item] of Object.entries(templateDrafts.current)) if (id !== template && item) nextConfig = publishEditorDocument(nextConfig, id as TemplateId, item.history.present);
        if (!setConfig(publishEditorDocument(nextConfig, template, submitted))) {
          setSaveError(true); setNotice(savedContent !== baseline.landing ? 'El contenido se guardó. No se pudo guardar la apariencia local; conserva el borrador y vuelve a intentar.' : 'No se pudo guardar la apariencia. Conservamos tu borrador.'); return;
        }
        for (const item of Object.values(templateDrafts.current)) if (item) { item.baseline = {...item.history.present, landing:savedContent}; item.history.present = {...item.history.present,landing:savedContent}; }
        const published = {...submitted, ...(savedContent ? {landing:savedContent} : {})};
        setHistory(current => ({...current,present:published})); setBaseline(published); setSaved(true);
        setNotice('Diseño guardado. La apariencia de tus secciones está publicada. Los demás ajustes visuales se conservan en este navegador.');
      } catch { setSaveError(true); setNotice('No se pudieron guardar los cambios. Conservamos tu borrador para volver a intentar.'); }
      finally { setSaving(false); }
    })(); });
  }
  function changePage(page: PreviewPageId) {
    setInspectorOpen(true);
    setSelectedBlockId(undefined); setContentImage(false); setPreviewPage(page); setInspectorGroup(undefined); setSelectedSection(page === 'home' ? 'hero' : page === 'catalog' ? 'catalog' : 'pageLayout');
    setImageMode(false); setSelectedImage(null); setNavigationHref(undefined); setNotice(''); setTool('style');
  }
  function chooseTool(next: typeof tool) {
    setTool(next); setContentImage(false); setInspectorOpen(true); if (next !== 'style') setEditScope('all');
    setImageMode(next === 'images');
    if (next === 'images') setInspectorOpen(true);
    if (next === 'content') setInspectorOpen(true);
  }
  function resetVisibleSection() {
    setDraft(current => {
      if (!selectedSection.startsWith('page')) return resetSection(current, sectionOverridePath(selectedSection, previewPage === 'catalog', activePage));
      const groups = getInspectorGroups(selectedSection, false, activePage).filter(group => !inspectorGroup || group.label === inspectorGroup);
      return groups.flatMap(group => group.fields).reduce((document, field) => resetSection(document, field.path), current);
    });
    setNotice('Se recuperaron los ajustes originales de este grupo en computadora, tablet y móvil.');
  }
  const currentLabel = selectedBlock && tool === 'style' ? selectedBlock.titulo || 'Sección de mi tienda' : contentImage && tool === 'content' && selectedSection === 'hero' ? 'Imagen principal' : inspectorGroup || VISUAL_SECTIONS.find(([id]) => id === selectedSection)?.[1];
  const sectionOptions = VISUAL_SECTIONS.filter(([id]) => ['global', 'topBar', 'header', 'footer'].includes(id) || (previewPage === 'home' ? !id.startsWith('page') && id !== 'catalog' : previewPage === 'catalog' ? ['catalog','productGrid','productCard','categories'].includes(id) : id.startsWith('page') && (id !== 'pageField' || !['confirmation','orders','terms','privacy','refund','story'].includes(activePage))));
  return <div aria-busy={saving} className={`ve-editor ve-redesign ${expanded ? 've-expanded' : ''}`}>
    <header className="ve-toolbar">
      <Link className="ve-institution" aria-label="Volver a Mi tienda · Universidad Autónoma de Chile" to="/emprendedor/diseno"><img src="/logo-universidad-autonoma.png" alt="" /><span>Universidad Autónoma de Chile</span></Link><strong>{config.name || 'Mi tienda'}<small>Editor visual de tu tienda</small></strong>
      <button type="button" disabled={!history.past.length || saving} onClick={() => setHistory(undoHistory)}>Deshacer</button><button type="button" disabled={!history.future.length || saving} onClick={() => setHistory(redoHistory)}>Rehacer</button>
      <button type="button" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Volver al editor' : 'Ampliar vista'}</button><button type="button" aria-expanded={inspectorOpen} aria-controls="ve-properties" onClick={() => setInspectorOpen(!inspectorOpen)}>Opciones</button>
      <span role="status" aria-live="polite" className={saveError ? 've-save-error' : dirty ? 've-dirty' : 've-saved'}>{saving ? 'Guardando…' : saveError ? 'No se pudo guardar' : dirty ? 'Cambios sin guardar' : saved ? '✓ Guardado' : '✓ Sin cambios pendientes'}</span>
      <button type="button" disabled={!dirty || saving} onClick={() => { templateDrafts.current = {}; setHistory(createHistory(baseline)); setSaved(false); setSaveError(false); setNotice('Borrador descartado.'); if (template !== config.template) { discarding.current = true; setParams({plantilla:config.template}); } }}>Descartar cambios</button>
      <button type="button" className="ve-primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
    </header>
    <fieldset className="ve-editor-controls" disabled={saving}>
    <nav className="ve-tools" aria-label="Herramientas del editor">{([['style','Diseño y apariencia'],['templates','Plantillas'],['content','Contenido y secciones'],['images','Imágenes']] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={tool === id} onClick={() => chooseTool(id)}>{label}</button>)}<span>Selecciona un elemento de tu tienda para editarlo</span></nav>
    <div className={`ve-workspace ${inspectorOpen ? '' : 've-hide-inspector'}`}>
      <main className="ve-preview">
        <div className="ve-preview-toolbar">
          <label>Página que estás editando<select aria-label="Página que estás editando" value={previewPage} onChange={e => changePage(e.target.value as PreviewPageId)}><option value="home">Inicio</option>{STORE_PAGES.filter(page => page.id !== 'story' || template === 'visual').map(page => <option key={page.id} value={page.id}>{page.label}</option>)}</select></label>
          <label>Sección<select aria-label="Sección que estás editando" value={selectedBlockId ? 'block:'+selectedBlockId : selectedSection} onChange={e => { if(e.target.value.startsWith('block:')) {const id=e.target.value.slice(6);setSelectedBlockId(id);setTool('style');setImageMode(false);setSelectedImage(null);setInspectorOpen(true);setNotice(connection.current?.focusBlock(id) ? '' : 'Esta sección está oculta. Actívala desde Página principal para verla.');} else selectSection(e.target.value as VisualSectionId);}}>{sectionOptions.map(([id,label]) => <option key={id} value={id}>{label}</option>)}{previewPage === 'home' && draft.landing?.contenido?.bloques?.map(block => <option key={block.id} value={'block:'+block.id}>{block.titulo || 'Sin título'}{!block.visible ? ' (oculta)' : ''}</option>)}</select></label>
          <div role="group" aria-label="Pantalla de vista previa">{(['desktop', 'tablet', 'mobile'] as const).map(value => <button type="button" key={value} aria-pressed={viewport === value} onClick={() => { setViewport(value); setEditScope('all'); }}>{optionLabel(value)}</button>)}</div>
          <label className="ve-scope">Aplicar cambios<select aria-label="Alcance de los cambios" disabled={tool !== 'style'} value={editScope} onChange={e => setEditScope(e.target.value as 'all' | 'device')}><option value="all">A todos los dispositivos</option><option value="device">Solo {optionLabel(viewport).toLowerCase()}</option></select></label>
          {previewPage === 'product' && <span>Producto de ejemplo · Bolso de algodón</span>}
          {previewPage === 'login' && <select aria-label="Vista de acceso" value={registerPreview ? 'register' : 'login'} onChange={e => setRegisterPreview(e.target.value === 'register')}><option value="login">Inicio de sesión</option><option value="register">Crear cuenta</option></select>}
          {previewPage === 'checkout' && <select aria-label="Etapa de compra" value={checkoutStep} onChange={e => { setCheckoutStep(e.target.value); setInspectorGroup(undefined); }}>{CHECKOUT_PREVIEW_STEPS.map((step, index) => <option key={step} value={step}>{['Contacto','Entrega','Pago','Confirmación'][index]}</option>)}</select>}
          {navigationHref && <a href={navigationHref} target="_blank" rel="noopener noreferrer">Probar navegación ↗</a>}
          <a href={previewPage === 'product' ? templatePaths[template] + '/catalogo' : publicPageUrl} target="_blank" rel="noopener noreferrer">{previewPage === 'product' ? 'Ver catálogo público ↗' : 'Vista previa ↗'}</a>
        </div>
        <div className="ve-preview-heading"><span>{previewPage === 'home' ? 'Inicio' : STORE_PAGES.find(p => p.id === previewPage)?.label} <span aria-hidden="true">/</span> {optionLabel(viewport)} · {frameWidth} px</span><div className="ve-zoom"><label>Zoom<select aria-label="Zoom de vista previa" value={zoom} onChange={e => setZoom(e.target.value)}><option value="fit">Ajustar</option>{[50,75,100,125,150].map(value => <option key={value} value={value}>{value}%</option>)}</select></label><span>{Math.round(previewScale * 100)}%</span></div></div>
        {(storageError || (notice && (notice !== ABSENT_SECTION_NOTICE || !sectionPresent))) && <p className="ve-notice" role={storageError ? 'alert' : 'status'}>{storageError || notice}</p>}
        <div className="ve-frame-wrap" ref={frameWrap}><div className="ve-frame-stage" style={{width:frameWidth * previewScale,height:Math.max(300 * previewScale,previewBounds.height - 24)}}><iframe ref={iframeRef} title="Vista real del cliente" src={previewUrl} onLoad={onLoad} style={{ width: frameWidth, height: Math.max(300, (previewBounds.height - 24) / previewScale), transform: `scale(${previewScale})` }} /></div></div>
        <div className="ve-canvas-status"><span>Vista previa segura · Sin compras ni pagos reales</span><span>Secciones publicadas · Solo esta tienda</span></div>
      </main>
      <aside className="ve-properties" id="ve-properties" aria-label="Opciones del elemento seleccionado" hidden={!inspectorOpen}>
        <div className="ve-property-tabs" role="group" aria-label="Edición contextual"><button type="button" aria-pressed={tool === 'style'} onClick={() => chooseTool('style')}>Apariencia</button><button type="button" aria-pressed={tool === 'content'} onClick={() => chooseTool('content')}>Contenido</button><button type="button" aria-label="Ocultar propiedades" onClick={() => setInspectorOpen(false)}>×</button></div>
        <div className="ve-inspector-heading"><div><small>{tool === 'templates' ? 'ELIGE TU ESTILO' : imageMode ? 'IMAGEN SELECCIONADA' : 'EDICIÓN CONTEXTUAL'}</small><h1 aria-live="polite">{tool === 'templates' ? 'Plantillas de tienda' : imageMode ? 'Imágenes' : currentLabel}</h1></div>{!imageMode && !selectedBlock && SECTION_HELP[selectedSection] && <FieldHelp label={currentLabel || ''}>{SECTION_HELP[selectedSection]!}</FieldHelp>}</div>
        {tool === 'templates' ? <TemplateGallery selected={template} onSelect={id => { if (id !== template) setParams({plantilla:id}); }} /> : tool === 'content' ? <ContentInspector section={selectedSection} home={previewPage === 'home'} error={contentError} /> : selectedBlock && tool === 'style' ? <><p className="ve-hint ve-scope-hint">{editScope === 'all' ? 'Diseño general · Se adapta a todas las pantallas.' : `Solo ${optionLabel(viewport).toLowerCase()}.`}</p><BlockAppearanceInspector key={selectedBlock.id} block={selectedBlock} styles={draft.blockStyles ?? {}} device={viewport} onEdit={(key,value) => setDraft(current => ({...current,blockStyles:editBlockAppearance(current.blockStyles ?? {},selectedBlock.id,key,value,editScope,viewport)}))} onReset={() => setDraft(current => { const next={...current.blockStyles};delete next[selectedBlock.id];return {...current,blockStyles:next};})} /></> : imageMode && !selectedImage ? <div className="ve-empty-inspector"><span aria-hidden="true">▧</span><h2>Selecciona una imagen</h2><p>Haz clic en la imagen que quieres editar. Aquí podrás reemplazarla, ajustar su tamaño y encuadre o recuperar la original.</p><Link to="/emprendedor/landing#pagina-principal">Imágenes de la portada →</Link></div> : imageMode && selectedImage ? <><p className="ve-hint">Reemplazar la imagen se aplica a todos los dispositivos.</p><LegacyImageInspector key={selectedImage.key} selected={selectedImage} document={draft} onChange={setDraft} /></> : <><p className="ve-hint ve-scope-hint">{editScope === 'all' ? 'Diseño general · Cada ajuste se aplica a todas las pantallas. Reemplaza la variante de esa propiedad.' : `Apariencia exclusiva de ${optionLabel(viewport).toLowerCase()}.`}</p><VisualInspector key={`${selectedSection}:${activePage}:${inspectorGroup ?? ''}`} section={selectedSection} effective={effective} document={draft} viewport={viewport} editScope={editScope} catalogPage={previewPage === 'catalog'} page={activePage} groupLabel={inspectorGroup} onEditMany={edits => setDraft(current => Object.entries(edits).reduce((document, [path,value]) => editScopedProperty(document,template,path,value,editScope,viewport), current))} onEdit={(path, value) => setDraft(current => editScopedProperty(current, template, path, value, editScope, viewport))} onReset={path => setDraft(current => resetProperty(current, path))} /><button className="ve-reset-section ve-danger" type="button" onClick={resetVisibleSection}>Restablecer sección ↺</button></>}
        <details className="ve-restore"><summary>Opciones del diseño</summary><button type="button" className="ve-danger" onClick={() => setRestoreRequested(true)}>Volver al diseño original</button><Link to="/emprendedor/diseno">Volver a Mi tienda</Link></details>
      </aside>
    </div>
    </fieldset>
    {(blocker.state === 'blocked' || restoreRequested) && <div className="ve-modal-backdrop"><div ref={leaveDialog} role="dialog" aria-modal="true" aria-labelledby="ve-leave-title" className="ve-modal" onKeyDown={event => {
      if (saving) return;
      if (event.key === 'Escape') { event.preventDefault(); if (restoreRequested) setRestoreRequested(false); else blocker.reset?.(); }
      if (event.key === 'Tab') {
        const buttons = event.currentTarget.querySelectorAll('button');
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
      }
    }}><h2 id="ve-leave-title">{restoreRequested ? 'Volver al diseño original' : 'Tienes cambios sin guardar'}</h2><p>{restoreRequested ? 'Se retirarán los ajustes generales y los de esta plantilla. Las imágenes, el contenido y la identidad institucional se conservan. Guarda después para aplicar el cambio.' : 'Guarda el diseño o descarta el borrador antes de salir.'}</p><button type="button" onClick={() => { if (restoreRequested) setRestoreRequested(false); else blocker.reset?.(); }}>Seguir editando</button><button type="button" onClick={() => { if (restoreRequested) { setDraft(restorePreset(draft)); setRestoreRequested(false); setNotice('Diseño original recuperado en el borrador.'); } else blocker.proceed?.(); }}>{restoreRequested ? 'Restablecer diseño' : 'Descartar y salir'}</button></div></div>}
  </div>;
}
