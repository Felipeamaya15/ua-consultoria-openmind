import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { MediaPreview } from '../../marketing/components/MediaPreview';
import type { MediaResource } from '../../marketing/domain/mediaLibrary';
import { inspectMediaUrl } from '../../marketing/domain/mediaLibrary';
import { profileLink } from '../types/socialProfiles';
import { fetchPublishedSectionResources, type SectionResource } from '../services/sectionResources';
import type { SectionElement, SectionActivity } from '../types/sectionElements';
import { ActivityRequestForm } from './ActivityRequestForm';
import { LANDING_CONFIG_CHANGED } from '../services/landingService';
import { MEDIA_LIBRARY_CHANGED } from '../../marketing/services/mediaLibraryService';
import './section-elements.css';

const PublishedMedia = createContext<Record<string, SectionResource>>({});
export function PublishedSectionMedia({ children }: { children: ReactNode }) {
  const [resources, setResources] = useState<Record<string, SectionResource>>({}), [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(old => old + 1);
    window.addEventListener(LANDING_CONFIG_CHANGED, refresh); window.addEventListener(MEDIA_LIBRARY_CHANGED, refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener(LANDING_CONFIG_CHANGED, refresh); window.removeEventListener(MEDIA_LIBRARY_CHANGED, refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchPublishedSectionResources(controller.signal).then(next => { if (!controller.signal.aborted) setResources(next); }).catch(() => { if (!controller.signal.aborted) setResources({}); });
    return () => controller.abort();
  }, [revision]);
  return <PublishedMedia.Provider value={resources}>{children}</PublishedMedia.Provider>;
}

export function SectionElements({ elements, ownerResources, activity, sectionId }: { elements: SectionElement[]; ownerResources?: Record<string, MediaResource>; activity?:SectionActivity|null; sectionId?:string }) {
  const published = useContext(PublishedMedia);
  const resources = ownerResources ?? published;
  return <div className="section-elements">{activity&&<div className="activity-details">{activity.categoria&&<span>{activity.categoria}</span>}{activity.plataforma&&<span>Plataforma: {activity.plataforma}</span>}{activity.tipo==='taller'&&<span>Zona horaria: {activity.zona_horaria}</span>}{activity.gratuito&&<span>Gratuito</span>}{activity.estado==='cancelada'&&<span className="activity-status-message">Actividad cancelada</span>}</div>}{elements.filter(element => element.visible).map(element => {
    const { tipo, texto = '' } = element;
    let content: ReactNode = null;
    if (tipo === 'titulo') content = texto && <h2 className="store-block-title">{texto}</h2>;
    else if (tipo === 'subtitulo' || tipo === 'nombre') content = texto && <h3 className="store-block-subtitle">{texto}</h3>;
    else if (tipo === 'caracteristicas') content = <ul>{texto.split('\n').filter(line => line.trim()).map((line, index) => <li key={index}>{line}</li>)}</ul>;
    else if (['texto', 'informacion', 'duracion', 'requisitos', 'condiciones'].includes(tipo)) content = texto && <div className="store-block-body">{(tipo==='requisitos'||tipo==='condiciones')&&<h3>{tipo==='requisitos'?'Requisitos o materiales':'Condiciones de participación'}</h3>}{texto.split(/\n\s*\n/).map((part, index) => <p key={index}>{part}</p>)}</div>;
    else if (tipo === 'separador') content = <hr />;
    else if (tipo === 'precio') content = element.importe !== '' && element.importe !== undefined && Number.isFinite(Number(element.importe)) && <p className="section-price">{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(element.importe))}</p>;
    else if (tipo === 'fecha') content = element.fecha && <p>Fecha: <time dateTime={element.fecha}>{element.fecha.split('-').reverse().join('/')}</time>{element.hasta&&<> al <time dateTime={element.hasta}>{element.hasta.split('-').reverse().join('/')}</time></>}</p>;
    else if (tipo === 'horario') content = element.inicio && <p>Horario: {element.inicio.slice(0, 5)}{element.termino ? ' a ' + element.termino.slice(0, 5) : ''}</p>;
    else if (tipo === 'modalidad') content = <p>Modalidad: {{ presencial: 'Presencial', online: 'Online', mixta: 'Mixta' }[element.modalidad || 'presencial']}</p>;
    else if (tipo === 'imagen' || tipo === 'galeria') content = <div className={tipo === 'galeria' ? 'section-element-gallery' : 'section-element-image'}>{element.imagenes?.map(image => <figure key={image.id}><img src={image.src} alt={image.alt} loading="lazy" />{image.alt && <figcaption>{image.alt}</figcaption>}</figure>)}</div>;
    else if (tipo === 'boton' || tipo === 'ubicacion') {
      const href = element.url ? inspectMediaUrl('enlace', element.url).url : '';
      content = <>{tipo === 'ubicacion' && texto && <p>{texto}</p>}{href && <a href={href} target="_blank" rel="noopener noreferrer" className="section-element-link">{element.etiqueta || 'Más información'}</a>}</>;
    } else if ((tipo === 'consulta'||tipo === 'inscripcion')&&activity&&activity.estado==='activa'&&sectionId) {
      if(tipo==='consulta'||activity.tipo==='taller'&&activity.gratuito&&activity.inscripciones)content=<ActivityRequestForm sectionId={sectionId} kind={tipo} label={element.etiqueta||(tipo==='consulta'?'Solicitar información':'Inscribirme')} />;
    } else if (tipo === 'whatsapp') {
      const href = profileLink('whatsapp', element.numero || '', element.mensaje).url;
      content = href && <a href={href} target="_blank" rel="noopener noreferrer" className="section-element-link">{element.etiqueta || 'Solicitar información'}</a>;
    } else if (tipo === 'biblioteca') {
      const resource = resources[element.recurso_id || ''];
      content = resource?.activo ? <MediaPreview resource={resource} publicImageUrl={ownerResources ? undefined : (resource as SectionResource).imagen_publica || undefined} initiallyOpen={resource.tipo === 'imagen'} /> : ownerResources ? <p role="status">El recurso no está activo o fue eliminado. No se mostrará en la tienda.</p> : null;
    } else if (tipo === 'youtube' || tipo === 'social') {
      const kind = tipo === 'youtube' ? 'youtube' : element.proveedor || 'instagram';
      if (element.url && !inspectMediaUrl(kind, element.url).error) content = <MediaPreview resource={{ id: element.id, titulo: tipo === 'youtube' ? 'Video de YouTube' : 'Publicación social', descripcion: '', tipo: kind, url: element.url, activo: true, archivo: null, creado: '', actualizado: '' }} />;
    }
    return content ? <div key={element.id} className={`section-element section-element--${tipo}`} data-section-element={element.id}>{content}</div> : null;
  })}</div>;
}
