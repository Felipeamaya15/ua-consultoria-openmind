import { Link } from 'react-router-dom';
import type { VisualSectionId } from './sections';
import type { LandingConfig } from '../../landing/types/landing.types';
import { ImageUpload } from '../components/ui/ImageUpload';

export function ContentInspector({section,error,home,landing,onChange,imagesOnly=false}: {section:VisualSectionId;error:string;home:boolean;landing?:LandingConfig;onChange?:(value:LandingConfig)=>void;imagesOnly?:boolean}) {
  if(section==='topBar')return <p className="ve-hint">El logo institucional está protegido e integrado al encabezado. Su color se comparte con el pie desde Estilo general.</p>;
  const hero=['hero','heroCta','global'].includes(section),logo=['header','footer','global'].includes(section);
  return <div className="ve-content-panel"><h2>{imagesOnly?'Imágenes de tu tienda':'Contenido de tu tienda'}</h2><p>Los cambios se previsualizan al instante y se guardan en la misma Página principal. Guardar cambios publica este borrador.</p>{error&&<p role="alert">{error}</p>}
    {landing&&onChange&&<>{!imagesOnly&&hero&&<><label>Título de portada<input aria-label="Título de portada" value={landing.titulo} maxLength={255} onChange={event=>onChange({...landing,titulo:event.target.value})}/></label><label>Descripción de portada<textarea aria-label="Descripción de portada" value={landing.descripcion} rows={3} onChange={event=>onChange({...landing,descripcion:event.target.value})}/></label><label>Texto del botón<input aria-label="Texto del botón" value={landing.texto_boton} maxLength={100} onChange={event=>onChange({...landing,texto_boton:event.target.value})}/></label></>}
    {(hero||imagesOnly)&&<><h3>Imagen de portada</h3><ImageUpload label="Cambiar imagen de portada" value={landing.imagen_principal||''} maxMB={2} allowSVG={false} onChange={value=>onChange({...landing,imagen_principal:value||null})}/></>}
    {(logo||imagesOnly)&&<><h3>Logo del emprendimiento</h3><ImageUpload label="Cambiar logo del negocio" value={landing.logo||''} maxMB={1} allowSVG={false} onChange={value=>onChange({...landing,logo:value||null})}/></>}
    {['contact','location','global'].includes(section)&&!imagesOnly&&<div><h3>Visibilidad de información</h3>{['Información de contacto','Horarios de atención','Mapa / ubicación'].map(name=><label key={name}><input type="checkbox" checked={name==='Horarios de atención'&&landing.secciones[name]===undefined?landing.secciones['Información de contacto']!==false:landing.secciones[name]!==false} onChange={event=>onChange({...landing,secciones:{...landing.secciones,[name]:event.target.checked}})}/>{name}</label>)}</div>}</>}
    <Link className="ve-content-link" to="/emprendedor/landing#pagina-principal">Administrar contenido avanzado →</Link>{!home&&<Link className="ve-content-link" to="/emprendedor/productos">Administrar productos y fotografías →</Link>}
  </div>;
}
