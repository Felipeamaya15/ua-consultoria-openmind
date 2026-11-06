import { useAdminHelp } from '../context/AdminHelpContext';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { LandingBlocksEditor } from './LandingBlocksEditor';
import { LandingContentEditor } from './LandingContentEditor';
import { BusinessInformationFields } from './BusinessInformation';
import { parseWeeklyHours, validHour } from './WeeklyHoursEditor';
import { homeSectionOrder, reconcileHomeOrder, type SystemSectionId } from '../../landing/types/homeSections';
import { normalizeLandingContent } from '../../landing/types/landingContent';
import { fetchPublicProducts } from '../../storefront/services/catalogService';
import { fetchStoreInformation, saveStoreInformation } from '../../storefront/services/storeInformationService';
import type { Product } from '../../storefront/data/mockData';
import { useAdmin } from '../context/AdminContext';
import { templatePaths } from '../config/navigation';
import { AdminCard, Alert, Input, Textarea, Modal } from './ui';
import { ImageUpload } from './ui/ImageUpload';
import { fetchPrivateLandingConfig as fetchLandingConfig, saveLandingConfig } from '../../landing/services/landingService';
import type { LandingInput } from '../../landing/types/landing.types';
import { AdminHelp } from './AdminPageHeader';
import { humanizeAdminError } from '../utils/humanizeError';
import './landing-workspace.css';
import { ApiError } from '../../../shared/services/apiRequest';

type Business = {nombre:string;descripcion:string;correo_negocio:string};
type Draft = LandingInput & {negocio:Business};
type Panel = 'business' | 'cover' | 'blocks' | 'catalog' | 'contact';
const panels: {id:Panel;label:string;short:string;description:string}[] = [
  {id:'business',label:'Información del negocio',short:'Negocio',description:'El nombre y la descripción que identifican tu tienda.'},
  {id:'cover',label:'Portada de la tienda',short:'Portada',description:'La primera impresión: tu mensaje, imagen principal y logo propio.'},
  {id:'blocks',label:'Secciones de mi tienda',short:'Secciones',description:'Organiza las historias, textos e imágenes de tu tienda.'},
  {id:'catalog',label:'Beneficios de comprar en tu tienda',short:'Beneficios',description:'Este apartado fijo aparece inmediatamente después de Portada. Productos y categorías se administran en Secciones.'},
  {id:'contact',label:'Contacto, horarios y ubicación',short:'Contacto y horarios',description:'Ayuda a tus clientes a encontrarte y conocer tus horarios.'},
];
const panelFromHash = (hash:string):Panel => hash === '#secciones-tienda' ? 'blocks' : hash === '#pagina-principal' ? 'cover' : hash === '#contacto-horarios' ? 'contact' : 'business';
const emptyForm: Draft = {
  negocio:{nombre:'',descripcion:'',correo_negocio:''}, titulo:'',descripcion:'',texto_boton:'',imagen_principal:null,logo:null,contenido:normalizeLandingContent(),
  secciones:{'Productos destacados':false,'Categorías':false,'Beneficios':false,'Información de contacto':false,'Horarios de atención':false,'Mapa / ubicación':false},
};
const contentOf = ({negocio: _business,...content}:Draft):LandingInput => content;
function loadedContent(value:LandingInput):LandingInput {return {...value,contenido:normalizeLandingContent(value.contenido),secciones:{...emptyForm.secciones,...value.secciones,'Horarios de atención':value.secciones['Horarios de atención']??value.secciones['Información de contacto']!==false}};}

export default function LandingPageContent() {
  const { config } = useAdmin();
  const {showHelp,toggleHelp} = useAdminHelp();
  const {hash} = useLocation();
  const [active,setActive] = useState<Panel>(() => panelFromHash(hash));
  const [form,setForm] = useState<Draft>(emptyForm);
  const [baseline,setBaseline] = useState<Draft>(emptyForm);
  const [past,setPast] = useState<Draft[]>([]);
  const [future,setFuture] = useState<Draft[]>([]);
  const [hoursPending,setHoursPending] = useState(false);
  const [hoursRevision,setHoursRevision] = useState(0);
  const [loading,setLoading] = useState(true);
  const [businessLoading,setBusinessLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const savingRef = useRef(false);
  const [confirmation,setConfirmation] = useState('');
  const [error,setError] = useState('');
  const [savedAt,setSavedAt] = useState('');
  const [loadFailed,setLoadFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [products,setProducts] = useState<Product[]>([]);
  const [catalogError,setCatalogError] = useState('');
  const [catalogLoading,setCatalogLoading] = useState(true);
  const [sectionsLoading,setSectionsLoading] = useState(false);
  const [sectionsError,setSectionsError] = useState('');
  const [sectionsNotice,setSectionsNotice] = useState('');
  const sectionsRequest = useRef<AbortController | null>(null);
  const editRevision = useRef(0);
  const businessDirty = JSON.stringify(form.negocio) !== JSON.stringify(baseline.negocio);
  const contentDirty = JSON.stringify(contentOf(form)) !== JSON.stringify(contentOf(baseline));
  const dirty = businessDirty || contentDirty || hoursPending;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(dirty);
  useEffect(() => {setActive(panelFromHash(hash));}, [hash]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event:BeforeUnloadEvent) => {event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',leave);return () => window.removeEventListener('beforeunload',leave);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    const options = {retry:true,signal:controller.signal};
    setLoading(true);setBusinessLoading(true);setLoadFailed(false);setError('');
    fetchPublicProducts(options).then(data => {if(!controller.signal.aborted)setProducts(data);})
      .catch(() => {if(!controller.signal.aborted)setCatalogError('No pudimos cargar el catálogo. Tus selecciones se conservan.');})
      .finally(() => {if(!controller.signal.aborted)setCatalogLoading(false);});
    fetchStoreInformation(controller.signal,true).then(data => {
      if(controller.signal.aborted)return;
      const negocio={nombre:data.nombre,descripcion:data.descripcion || '',correo_negocio:data.correo_negocio||''};
      setForm(current => ({...current,negocio}));setBaseline(current => ({...current,negocio}));
    }).catch(() => {if(!controller.signal.aborted){setLoadFailed(true);setError('No pudimos cargar la información del negocio. Reintenta antes de editar.');}})
      .finally(() => {if(!controller.signal.aborted)setBusinessLoading(false);});
    fetchLandingConfig(options).then(data => {
      if(controller.signal.aborted)return;
      const content=loadedContent(data ?? emptyForm);
      setForm(current => ({...content,negocio:current.negocio}));setBaseline(current => ({...content,negocio:current.negocio}));
    }).catch(() => {if(!controller.signal.aborted){setLoadFailed(true);setError('No pudimos cargar el contenido de tu página principal. Reintenta antes de editar.');}})
      .finally(() => {if(!controller.signal.aborted)setLoading(false);});
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => () => sectionsRequest.current?.abort(), []);
  async function refreshSections() {
    sectionsRequest.current?.abort();
    const request = new AbortController(); sectionsRequest.current = request;
    const revision = editRevision.current;
    setSectionsLoading(true); setSectionsError(''); setSectionsNotice('');
    try {
      const remote = await fetchLandingConfig({retry:true,signal:request.signal});
      if (request.signal.aborted) return;
      if (dirtyRef.current || savingRef.current || revision !== editRevision.current) {
        setSectionsNotice('Conservamos tus cambios sin guardar. Guarda o descarta el borrador antes de actualizar la lista desde la tienda.');
        return;
      }
      const content = loadedContent(remote ?? emptyForm);
      setForm(current => ({...content,negocio:current.negocio}));
      setBaseline(current => ({...content,negocio:current.negocio}));
      setPast([]); setFuture([]);
    } catch {
      if (!request.signal.aborted) setSectionsError('No pudimos actualizar las secciones de tu tienda. Tu contenido se conserva. Intenta nuevamente.');
    } finally {
      if (!request.signal.aborted) setSectionsLoading(false);
    }
  }
  function selectPanel(panel:Panel) {setActive(panel); if(panel==='blocks')void refreshSections();}
  function change(next:Draft) {if(saving)return;editRevision.current++;setPast(items => [...items,form].slice(-40));setFuture([]);setForm(next);setSavedAt('');setError('');}
  function undo() {if(!past.length)return;editRevision.current++;setHoursRevision(n=>n+1);setFuture([form,...future]);setForm(past[past.length-1]);setPast(past.slice(0,-1));setSavedAt('');setError('');}
  function redo() {if(!future.length)return;editRevision.current++;setHoursRevision(n=>n+1);setPast([...past,form]);setForm(future[0]);setFuture(future.slice(1));setSavedAt('');setError('');}
  function discard() {editRevision.current++;setForm(baseline);setPast([]);setFuture([]);setHoursPending(false);setHoursRevision(n=>n+1);setSavedAt('');setError('');}
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(savingRef.current || saving || loadFailed || !dirty)return;
    if(hoursPending){setActive('contact');setError('Agrega o guarda el día que estás editando antes de guardar la página.');return;}
    const rows=parseWeeklyHours(form.contenido?.contacto?.horario || '');
    if(contentDirty && form.secciones['Horarios de atención'] !== false && rows?.some(row=>!validHour(row.open)||!validHour(row.close))){setActive('contact');setError('Completa la apertura y el cierre de los días configurados.');return;}
    const invalid=Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input:invalid,select:invalid,textarea:invalid')).find(field => field.closest('[data-landing-panel]')?.getAttribute('data-landing-panel') === 'business' ? businessDirty : contentDirty);
    if(invalid){setActive(invalid.closest('[data-landing-panel]')?.getAttribute('data-landing-panel') as Panel || 'cover');requestAnimationFrame(()=>{invalid.focus();invalid.reportValidity();});return;}
    sectionsRequest.current?.abort();setSectionsLoading(false);editRevision.current++;
    savingRef.current=true;setSaving(true);setSavedAt('');setConfirmation('');setError('');
    let next=form, businessSaved=false;
    try {
      if(businessDirty){const result=await saveStoreInformation(form.negocio);const negocio={nombre:result.nombre,descripcion:result.descripcion || '',correo_negocio:result.correo_negocio||''};next={...next,negocio};setBaseline(current=>({...current,negocio}));setForm(current=>({...current,negocio}));businessSaved=true;}
      if(contentDirty){const result=await saveLandingConfig(contentOf(form));next={...loadedContent(result),negocio:next.negocio};}
      setForm(next);setBaseline(next);setPast([]);setFuture([]);setSavedAt(new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}));
      setConfirmation(businessDirty && !contentDirty ? 'Información de tu tienda guardada correctamente.' : 'Cambios de la página principal guardados correctamente.');
    } catch (err) {
      // Los errores de catálogo pertenecen al apartado Secciones.
      // Cambiar la pestaña no recarga el contenido ni descarta el borrador.
      if (
        err instanceof ApiError &&
        (err.issueField === 'productos_destacados' || err.issueField === 'categorias')
      ) {
        setActive('blocks');
      }

      const detail = err instanceof ApiError
        ? err.message
        : humanizeAdminError(
            err instanceof Error ? err.message : '',
            'No pudimos guardar los cambios. Tu borrador se conserva.'
          );

      setError(
        (businessSaved
          ? 'La información del negocio se guardó. El contenido sigue pendiente. '
          : '') + detail
      );
    }
    finally{savingRef.current=false;setSaving(false);}
  }
  const contentEditor=(sections:string[], showVisibilityToggle=true) => <LandingContentEditor showVisibilityToggle={showVisibilityToggle} catalogReady={!catalogLoading&&!catalogError} sections={sections} value={normalizeLandingContent(form.contenido)} flags={form.secciones} products={products} onChange={contenido=>change({...form,contenido})} onToggle={(name,enabled)=>change({...form,secciones:{...form.secciones,[name]:enabled}})} onHoursPending={setHoursPending} />;
  const sectionOrder=homeSectionOrder(form.contenido,config.template,true);
  const renderCommerceConfig=(id:SystemSectionId)=>id==='sistema:contenido'?<p>Bloque editorial propio de la plantilla Catálogo. Puedes ocultarlo o cambiar su posición. Su apariencia se conserva.</p>:<>{contentEditor([id==='sistema:categorias'?'Categorías':'Productos destacados'],false)}{id!=='sistema:destacados'&&id!=='sistema:categorias'&&<p>Reutiliza la selección de productos destacados. Su diseño y agrupación corresponden a la plantilla indicada.</p>}</>;
  if(loading || businessLoading)return <LoadingState align="start" spacing="compact">Cargando configuración...</LoadingState>;
  return <div className="lp-workspace" aria-busy={saving}>
    <header className="lp-page-heading"><div><p className="lp-eyebrow">MI TIENDA / CONTENIDO</p><h1>Página principal</h1><p id="lp-page-description" hidden={!showHelp}>Todo el contenido de tu tienda, organizado en un solo lugar.</p></div><div className="lp-heading-actions"><button type="button" className="lp-button" aria-expanded={showHelp} aria-controls="lp-page-description" onClick={toggleHelp}>{showHelp?'Ocultar ayudas':'Mostrar ayudas'}</button><a className="lp-button" href={templatePaths[config.template]} target="_blank" rel="noreferrer">Ver mi tienda ↗</a></div></header>
    <nav className="lp-tabs" role="tablist" aria-label="Apartados de Página principal">{panels.map((panel,index)=><button type="button" role="tab" id={'lp-tab-'+panel.id} aria-controls={'lp-panel-'+panel.id} aria-selected={active===panel.id} tabIndex={active===panel.id?0:-1} key={panel.id} disabled={saving} onClick={()=>selectPanel(panel.id)} onKeyDown={event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?panels.length-1:(index+(event.key==='ArrowRight'?1:-1)+panels.length)%panels.length;selectPanel(panels[next].id);document.getElementById('lp-tab-'+panels[next].id)?.focus();}}><span className="lp-tab-number" aria-hidden="true">0{index+1}</span><span>{panel.short}</span></button>)}</nav>
    <form noValidate onSubmit={event=>void save(event)} className="lp-form">
      {error&&<ErrorState className="lp-feedback" onRetry={loadFailed?()=>setAttempt(n=>n+1):undefined} retryLabel="Reintentar carga">{error}</ErrorState>}
      <fieldset disabled={saving||loadFailed} className="lp-panels">
        {panels.map(panel=><section key={panel.id} id={'lp-panel-'+panel.id} role="tabpanel" aria-labelledby={'lp-tab-'+panel.id} data-landing-panel={panel.id} hidden={active!==panel.id}>
          {panel.id!=='blocks'&&<div className="lp-panel-heading"><h2>{panel.label}</h2><p>{panel.description}</p></div>}
          {panel.id==='business'&&<AdminCard><div id="informacion-negocio"><BusinessInformationFields value={form.negocio} onChange={negocio=>change({...form,negocio})} /><AdminHelp>Estos datos se muestran en las cuatro plantillas. El nombre es obligatorio.</AdminHelp></div></AdminCard>}
          {panel.id==='cover'&&<div className="lp-cover-grid" id="pagina-principal"><AdminCard className="lp-cover-copy"><Input label="Título principal" required maxLength={255} value={form.titulo} onChange={e=>change({...form,titulo:e.target.value})} /><AdminHelp>Tu mensaje de bienvenida. Es obligatorio.</AdminHelp><Textarea label="Descripción de portada" rows={4} value={form.descripcion} onChange={e=>change({...form,descripcion:e.target.value})} /><Input label="Texto del botón principal" required maxLength={100} value={form.texto_boton} onChange={e=>change({...form,texto_boton:e.target.value})} /><AdminHelp>Por ejemplo: Ver productos. Es obligatorio.</AdminHelp></AdminCard><div className="lp-cover-media"><AdminCard><h3>Imagen principal</h3><ImageUpload label="Subir imagen principal" value={form.imagen_principal || ''} maxMB={2} allowSVG={false} onChange={image=>change({...form,imagen_principal:image || null})} /></AdminCard><AdminCard><h3>Logo de tu negocio</h3><ImageUpload label="Subir logo del negocio" value={form.logo || ''} maxMB={1} allowSVG={false} onChange={logo=>change({...form,logo:logo || null})} /><AdminHelp>Usa tu propia marca. Es opcional.</AdminHelp></AdminCard></div></div>}
          {panel.id==='blocks'&&<>
            {catalogLoading&&<LoadingState align="start" spacing="compact">Cargando productos y categorías...</LoadingState>}{catalogError&&<Alert variant="error">{catalogError}</Alert>}
            <div className="lp-sections-refresh"><p>El contenido guardado se comparte entre las cuatro plantillas.</p><button type="button" className="lp-button" disabled={saving||sectionsLoading} onClick={()=>void refreshSections()}>Actualizar secciones</button></div>
            {sectionsLoading&&<LoadingState size="sm" align="start" spacing="compact">Cargando secciones guardadas…</LoadingState>}
            {sectionsError&&<ErrorState onRetry={()=>void refreshSections()} retryLabel="Reintentar secciones">{humanizeAdminError(sectionsError)}</ErrorState>}
            {sectionsNotice&&<p role="status" className="lp-sections-notice">{sectionsNotice}</p>}
            <fieldset disabled={sectionsLoading||!!sectionsError} aria-busy={sectionsLoading}>
              <LandingBlocksEditor value={form.contenido?.bloques} onChange={bloques=>change({...form,contenido:{...normalizeLandingContent(form.contenido),bloques,...(form.contenido?.orden_apartados?{orden_apartados:reconcileHomeOrder(sectionOrder,bloques)}:{})}})} layout={{order:sectionOrder,flags:form.secciones,onMove:orden_apartados=>change({...form,contenido:{...normalizeLandingContent(form.contenido),orden_apartados}}),onToggle:(name,enabled)=>change({...form,secciones:{...form.secciones,[name]:enabled}}),renderConfig:renderCommerceConfig}} />
            </fieldset>
          </>}
          {panel.id==='catalog'&&<>{catalogLoading&&<LoadingState align="start" spacing="compact">Cargando productos y categorías...</LoadingState>}{catalogError&&<Alert variant="error">{catalogError}</Alert>}<div className="lp-catalog-grid">{contentEditor(['Beneficios'])}</div></>}
          {panel.id==='contact'&&<div className="lp-contact-layout" id="contacto-horarios" key={hoursRevision}>{contentEditor(['Información de contacto','Horarios de atención','Mapa / ubicación'])}</div>}
        </section>)}
      </fieldset>
      <footer className="lp-actionbar" aria-label="Acciones de Página principal"><div className="lp-save-status" role="status" aria-live="polite"><span className={dirty?'lp-status-dot is-dirty':'lp-status-dot'} /><div>{savedAt&&!dirty?<Alert variant="success">{confirmation}<small>Guardado a las {savedAt}</small></Alert>:<>{saving?'Guardando…':dirty?'Cambios sin guardar':'Sin cambios pendientes'}</>}</div></div><div className="lp-history-actions"><button type="button" className="lp-icon-button" disabled={!past.length||saving||loadFailed} onClick={undo} title="Deshacer" aria-label="Deshacer">↶ <span>Deshacer</span></button><button type="button" className="lp-icon-button" disabled={!future.length||saving||loadFailed} onClick={redo} title="Rehacer" aria-label="Rehacer">↷ <span>Rehacer</span></button><button type="button" className="lp-button" disabled={!dirty||saving||loadFailed} onClick={discard}>Descartar cambios</button></div><button type="submit" className="lp-button lp-button-primary" disabled={!dirty||saving||loadFailed}>{saving?'Guardando…':'Guardar cambios'}</button></footer>
    </form>
    <Modal open={blocker.state==='blocked'} onClose={()=>blocker.reset?.()} title="Cambios sin guardar" size="sm"><p>Tienes cambios pendientes en Página principal. Guarda antes de salir para conservarlos.</p><div className="lp-dialog-actions"><button type="button" className="lp-button" onClick={()=>blocker.reset?.()}>Seguir editando</button><button type="button" className="lp-button lp-button-danger" onClick={()=>blocker.proceed?.()}>Descartar y salir</button></div></Modal>
  </div>;
}
