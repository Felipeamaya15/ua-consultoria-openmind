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
import { createEditorDocument, editProperty, isEditorDirty, publishEditorDocument, resetProperty, resetSection, resolveEditorDocument, restorePreset, sectionOverridePath } from '../visualEditor/model';
import { VisualInspector, getInspectorGroups } from '../visualEditor/inspector';
import { LegacyImageInspector } from '../visualEditor/images';
import { FieldHelp, SECTION_HELP } from '../visualEditor/help';
import { optionLabel } from '../visualEditor/controls';
import { STORE_PAGES, previewPath, CHECKOUT_PREVIEW_STEPS, type PreviewPageId } from '../../storefront/visual/pages';
import { connectVisualPreview } from '../visualEditor/preview';
import '../admin.css';
import '../visualEditor/editor.css';
const ABSENT_SECTION_NOTICE = 'Esta sección no está visible en esta página. Sus ajustes se aplicarán cuando tenga contenido o esté habilitada.';

export default function ThemeEditor() {
  const { config, setConfig, storageError } = useAdmin();
  const { identity } = useStoreIdentity();
  const [params] = useSearchParams();
  const requested = params.get('plantilla');
  const template: TemplateId = requested && Object.prototype.hasOwnProperty.call(templatePaths, requested) ? requested as TemplateId : config.template;
  const load = () => createEditorDocument(config, template, readStoredStoreConfig(identity));
  const [baseline, setBaseline] = useState(load);
  const [history, setHistory] = useState(() => createHistory(load()));
  const draft = history.present;
  const setDraft = (next: SetStateAction<EditorDocument>) => setHistory(current => recordHistory(current, typeof next === 'function' ? next(current.present) : next));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [selectedSection, setSelectedSection] = useState<VisualSectionId>('global');
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
  const [selectedImage, setSelectedImage] = useState<{ key: string; src: string; legacyKey?: string } | null>(null);
  const [navigationHref, setNavigationHref] = useState<string>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const connection = useRef<ReturnType<typeof connectVisualPreview> | null>(null);
  const frameWrap = useRef<HTMLDivElement>(null);
  const leaveDialog = useRef<HTMLDivElement>(null);
  const [previewBounds, setPreviewBounds] = useState({ width: 900, height: 700 });
  const frameWidth = viewport === 'mobile' ? 375 : viewport === 'tablet' ? 768 : 1440;
  const previewScale = Math.min(1, Math.max(1, previewBounds.width - 24) / frameWidth);
  const effective = useMemo(() => resolveEditorDocument(draft, template), [draft, template]);
  const latest = useRef({ effective, draft, selectedSection, imageMode }); latest.current = { effective, draft, selectedSection, imageMode };
  const dirty = isEditorDirty(draft, baseline);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => { if (blocker.state === 'blocked' || restoreRequested) leaveDialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [blocker.state, restoreRequested]);
  useEffect(() => { const next = load(); setBaseline(next); setHistory(createHistory(next)); setSaved(false); setSelectedImage(null); }, [template]);
  useEffect(() => { connection.current?.update(effective, draft.images); setSaved(false); }, [effective, draft.images]);
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
  function selectSection(section: VisualSectionId) {
    setSelectedSection(section); setInspectorGroup(undefined); setSelectedImage(null); setNavigationHref(undefined); setImageMode(false);
    if (section === 'catalog' && previewPage !== 'catalog') { setPreviewPage('catalog'); setNotice('Abriendo el catálogo en vista previa.'); return; }
    const found = connection.current?.focus(section);
    setNotice(found ? '' : ABSENT_SECTION_NOTICE);
  }
  function onLoad() {
    connection.current?.disconnect();
    const doc = iframeRef.current?.contentDocument; if (!doc) return;
    connection.current = connectVisualPreview(doc, (section, href, group) => { setSelectedSection(section); setInspectorGroup(group); setSelectedImage(null); setNavigationHref(href); setNotice(''); }, (key, src, legacyKey) => setSelectedImage({ key, src, legacyKey }), institutional => { setSelectedImage(null); setNotice(institutional ? 'La identidad institucional es obligatoria y su logo no se puede reemplazar.' : 'Esta imagen pertenece al contenido de la tienda. Edítala desde Portada o Productos.'); }, setSectionPresent);
    connection.current.imageMode(latest.current.imageMode);
    connection.current.update(latest.current.effective, latest.current.draft.images);
    connection.current.focus(latest.current.selectedSection);
  }
  function save() {
    if (setConfig(publishEditorDocument(config, template, draft))) { setBaseline(draft); setSaved(true); setNotice('Diseño guardado en este navegador para esta tienda.'); }
  }
  function resetVisibleSection() {
    setDraft(current => {
      if (!selectedSection.startsWith('page')) return resetSection(current, sectionOverridePath(selectedSection, previewPage === 'catalog', activePage));
      const groups = getInspectorGroups(selectedSection, false, activePage).filter(group => !inspectorGroup || group.label === inspectorGroup);
      return groups.flatMap(group => group.fields).reduce((document, field) => resetSection(document, field.path), current);
    });
    setNotice('Overrides de este grupo eliminados en computadora, tablet y móvil. Se recupera la herencia del diseño original.');
  }
  const currentLabel = inspectorGroup || VISUAL_SECTIONS.find(([id]) => id === selectedSection)?.[1];
  return <div className="ve-editor">
    <header className="ve-toolbar">
      <Link to="/emprendedor/diseno">← Diseño</Link><strong>Editor de tienda</strong>
      <button type="button" disabled={!history.past.length} onClick={() => setHistory(undoHistory)}>Deshacer</button><button type="button" disabled={!history.future.length} onClick={() => setHistory(redoHistory)}>Rehacer</button>
      <button type="button" aria-expanded={sidebarOpen} aria-controls="ve-sections" onClick={() => setSidebarOpen(!sidebarOpen)}>Secciones</button><button type="button" aria-expanded={inspectorOpen} aria-controls="ve-properties" onClick={() => setInspectorOpen(!inspectorOpen)}>Inspector</button>
      <span role="status" className={dirty ? 've-dirty' : ''}>{dirty ? 'Cambios sin guardar' : saved ? '✓ Guardado' : 'Sin cambios pendientes'}</span>
      <button type="button" disabled={!dirty} onClick={() => { setHistory(createHistory(baseline)); setSaved(false); setNotice('Borrador descartado.'); }}>Descartar cambios</button>
      <button type="button" className="ve-primary" disabled={!dirty} onClick={save}>Guardar y publicar</button>
    </header>
    <div className={`ve-workspace ${sidebarOpen ? '' : 've-hide-sidebar'} ${inspectorOpen ? '' : 've-hide-inspector'}`}>
      <aside className="ve-sidebar" id="ve-sections" hidden={!sidebarOpen}>
        <nav aria-label="Secciones editables"><h2>ESTILO GENERAL</h2>{VISUAL_SECTIONS.filter(([id]) => ['global','topBar','header','footer'].includes(id)).map(([id,label]) => <button type="button" key={id} aria-pressed={selectedSection === id && !imageMode} onClick={() => selectSection(id)}>{id === 'global' ? 'Paleta y tipografías' : label}</button>)}
          <h2>PÁGINA ACTUAL — {previewPage === 'home' ? 'Inicio' : STORE_PAGES.find(p => p.id === previewPage)?.label}</h2>
          {previewPage === 'home' || previewPage === 'catalog' ? VISUAL_SECTIONS.filter(([id]) => !['global','topBar','header','footer'].includes(id) && !id.startsWith('page') && (previewPage === 'home' ? id !== 'catalog' : !['hero','heroCta','sections','contact','location'].includes(id))).map(([id,label]) => <button type="button" key={id} aria-pressed={selectedSection === id && !imageMode} onClick={() => selectSection(id)}>{label}</button>) : (['pageLayout','pagePanel','pageField','pageButton'] as const).filter(id => id !== 'pageField' || !['confirmation','orders','terms','privacy','refund','story'].includes(activePage)).flatMap(id => getInspectorGroups(id,false,activePage).map(group => {
            const labels: Record<string, string[]> = {"product":["Cajas e información","Variantes y cantidad","Botones"],"cart":["Productos y resumen","Cantidad","Botones"],"login":["Formulario","Campos","Botones"],"checkout":["Opciones y resumen","Datos y opciones","Botones"],"confirmation":["Pedido y resumen","Campos","Botones"],"tracking":["Resultado y estados","Formulario","Botones"],"profile":["Datos personales","Campos","Botones"],"orders":["Lista y detalle","Campos","Botones"]};
            const label = id === 'pageLayout' || (id === 'pageField' && ['product','cart'].includes(activePage)) ? group.label : labels[activePage]?.[['pagePanel','pageField','pageButton'].indexOf(id)] || group.label;
            return <button type="button" key={id + group.label} aria-pressed={selectedSection === id && inspectorGroup === group.label && !imageMode} onClick={() => { selectSection(id); setInspectorGroup(group.label); }}>{label}</button>;
          }))}</nav>
        <button type="button" aria-pressed={imageMode} onClick={() => { setImageMode(!imageMode); setNotice('En modo imágenes, toca una imagen para editar su encuadre.'); }}>Imágenes heredadas</button>
        <button type="button" className="ve-danger" onClick={() => setRestoreRequested(true)}>Volver al diseño original</button>
        <p className="ve-hint">Selecciona una sección o toca la vista previa. Los cambios viven en el borrador hasta guardar.</p>
      </aside>
      <main className="ve-preview">
        <div className="ve-preview-toolbar">
          <div role="group" aria-label="Pantalla de vista previa">{(['desktop', 'tablet', 'mobile'] as const).map(value => <button type="button" key={value} aria-pressed={viewport === value} onClick={() => setViewport(value)}>{optionLabel(value)}</button>)}</div>
          <label>Página que estás editando<select aria-label="Página que estás editando" value={previewPage} onChange={e => { const page = e.target.value as PreviewPageId; setPreviewPage(page); setInspectorGroup(undefined); setSelectedSection(page === 'home' ? 'hero' : page === 'catalog' ? 'catalog' : 'pageLayout'); setImageMode(false); setSelectedImage(null); setNavigationHref(undefined); setNotice(''); }}><option value="home">Inicio</option>{STORE_PAGES.filter(page => page.id !== 'story' || template === 'visual').map(page => <option key={page.id} value={page.id}>{page.label}</option>)}</select></label>
          {previewPage === 'product' && <span>Producto de ejemplo · Bolso de algodón</span>}
          {previewPage === 'login' && <select aria-label="Vista de acceso" value={registerPreview ? 'register' : 'login'} onChange={e => setRegisterPreview(e.target.value === 'register')}><option value="login">Inicio de sesión</option><option value="register">Crear cuenta</option></select>}
          {previewPage === 'checkout' && <select aria-label="Etapa de compra" value={checkoutStep} onChange={e => { setCheckoutStep(e.target.value); setInspectorGroup(undefined); }}>{CHECKOUT_PREVIEW_STEPS.map((step, index) => <option key={step} value={step}>{['Contacto','Entrega','Pago','Confirmación'][index]}</option>)}</select>}
          {navigationHref && <a href={navigationHref} target="_blank" rel="noopener noreferrer">Probar navegación ↗</a>}
          <a href={previewPage === 'product' ? templatePaths[template] + '/catalogo' : publicPageUrl} target="_blank" rel="noopener noreferrer">{previewPage === 'product' ? 'Ver catálogo público ↗' : 'Ver tienda ↗'}</a>
        </div>
        {previewPage !== 'home' && previewPage !== 'catalog' && <p className="ve-preview-context">Los ajustes afectan solo esta página. Datos de ejemplo seguros: no se realizan compras, pagos, acceso ni consultas de pedidos. Toca un elemento para editar su apariencia.</p>}
        {(storageError || (notice && (notice !== ABSENT_SECTION_NOTICE || !sectionPresent))) && <p className="ve-notice" role={storageError ? 'alert' : 'status'}>{storageError || notice}</p>}
        <div className="ve-frame-wrap" ref={frameWrap}><iframe ref={iframeRef} title="Vista real del cliente" src={previewUrl} onLoad={onLoad} style={{ width: frameWidth, height: Math.max(300, (previewBounds.height - 24) / previewScale), zoom: previewScale }} /></div>
      </main>
      <aside className="ve-properties" id="ve-properties" aria-label="Inspector visual" hidden={!inspectorOpen}>
        <div className="ve-inspector-heading"><h1>{imageMode && selectedImage ? 'Imagen' : currentLabel}</h1>{!imageMode && SECTION_HELP[selectedSection] && <FieldHelp label={currentLabel || ''}>{SECTION_HELP[selectedSection]!}</FieldHelp>}{!imageMode && <button type="button" title="Eliminar overrides del grupo en todos los tamaños y recuperar el diseño original" onClick={resetVisibleSection}>Restablecer sección ↺</button>}</div>
        {imageMode && selectedImage ? <LegacyImageInspector selected={selectedImage} document={draft} onChange={setDraft} /> : <VisualInspector section={selectedSection} effective={effective} document={draft} viewport={viewport} catalogPage={previewPage === 'catalog'} page={activePage} groupLabel={inspectorGroup} onEditMany={edits => setDraft(current => Object.entries(edits).reduce((document, [path,value]) => editProperty(document,path,value), current))} onEdit={(path, value) => setDraft(current => editProperty(current, path, value))} onReset={path => setDraft(current => resetProperty(current, path))} />}
      </aside>
    </div>
    {(blocker.state === 'blocked' || restoreRequested) && <div className="ve-modal-backdrop"><div ref={leaveDialog} role="dialog" aria-modal="true" aria-labelledby="ve-leave-title" className="ve-modal" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); if (restoreRequested) setRestoreRequested(false); else blocker.reset?.(); }
      if (event.key === 'Tab') {
        const buttons = event.currentTarget.querySelectorAll('button');
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
      }
    }}><h2 id="ve-leave-title">{restoreRequested ? 'Volver al diseño original' : 'Tienes cambios sin guardar'}</h2><p>{restoreRequested ? 'Se retirarán los ajustes generales y los de esta plantilla. Las imágenes, el contenido y la identidad institucional se conservan. Guarda después para aplicar el cambio.' : 'Guarda el diseño o descarta el borrador antes de salir.'}</p><button type="button" onClick={() => { if (restoreRequested) setRestoreRequested(false); else blocker.reset?.(); }}>Seguir editando</button><button type="button" onClick={() => { if (restoreRequested) { setDraft(restorePreset(draft)); setRestoreRequested(false); setNotice('Diseño original recuperado en el borrador.'); } else blocker.proceed?.(); }}>{restoreRequested ? 'Restablecer diseño' : 'Descartar y salir'}</button></div></div>}
  </div>;
}
