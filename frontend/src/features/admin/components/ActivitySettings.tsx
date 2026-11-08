import { Link } from 'react-router-dom';
import { Input, Select, Toggle } from './ui';
import type { BloqueLanding } from '../../landing/types/landing.types';
import { newActivity, newSectionElement, type SectionActivity, type ElementKind } from '../../landing/types/sectionElements';

/** Operational settings live on the same section; visual content stays in its blocks. */
export function ActivitySettings({section,onChange}:{section:BloqueLanding;onChange:(section:BloqueLanding)=>void}) {
  const activity=section.actividad;
  const update=(patch:Partial<SectionActivity>)=>onChange({...section,actividad:{...activity!,...patch}});
  const add=(kind:ElementKind)=>onChange({...section,componentes:[...(section.componentes||[]),newSectionElement(kind)]});
  return <fieldset className="activity-settings"><legend>Servicio o taller</legend>
    <Select label="Tipo de actividad" value={activity?.tipo||''} options={[{value:'',label:'Contenido general'},{value:'servicio',label:'Servicio'},{value:'taller',label:'Taller o actividad'}]} onChange={event=>onChange({...section,actividad:event.target.value?{...newActivity(event.target.value as SectionActivity['tipo']),...(activity||{}),tipo:event.target.value as SectionActivity['tipo'],inscripciones:false}:null})} />
    {activity&&<>
      <div className="activity-settings-grid"><Input label="Clasificación (opcional)" value={activity.categoria} maxLength={100} onChange={event=>update({categoria:event.target.value})} /><Select label="Estado de la actividad" value={activity.estado} options={[{value:'activa',label:'Activa'},{value:'cancelada',label:'Cancelada'}]} onChange={event=>update({estado:event.target.value as SectionActivity['estado']})} /></div>
      <p>Publica u oculta esta actividad con el interruptor de la sección. El título, descripción, imágenes, duración, condiciones, precio y contacto se editan en sus bloques.</p>
      <div className="activity-settings-grid"><Input label="Zona horaria" value={activity.zona_horaria} required maxLength={80} placeholder="America/Santiago" onChange={event=>update({zona_horaria:event.target.value})} /><Input label="Plataforma de reunión (opcional)" value={activity.plataforma} maxLength={100} placeholder="Zoom, Google Meet…" onChange={event=>update({plataforma:event.target.value})} /></div>
      <Input label="Enlace privado de reunión (opcional)" type="url" value={activity.enlace_reunion||''} maxLength={2000} onChange={event=>update({enlace_reunion:event.target.value})} />
      <p>Este enlace solo lo ve el propietario en el panel. No se publica ni se entrega automáticamente; verifica al participante antes de compartirlo.</p>
      <Toggle label="Actividad gratuita" checked={activity.gratuito} onChange={gratuito=>update({gratuito,inscripciones:gratuito?activity.inscripciones:false})} />
      {activity.tipo==='taller'&&<>
        <p>Para publicar un taller agrega un bloque Fecha y otro Horario. Los primeros bloques visibles determinan la inscripción. La fecha de término es opcional; el horario corresponde a cada día de la actividad.</p>
        <div className="flexible-add">{(['fecha','horario'] as const).filter(kind=>!section.componentes?.some(element=>element.tipo===kind)).map(kind=><button key={kind} className="lp-button" type="button" disabled={(section.componentes?.length||0)>=30} onClick={()=>add(kind)}>Agregar {kind==='fecha'?'fecha':'horario'}</button>)}</div>
        <Toggle label="Permitir inscripciones gratuitas" disabled={!activity.gratuito} checked={activity.inscripciones} onChange={inscripciones=>onChange({...section,actividad:{...activity,inscripciones},componentes:inscripciones&&!section.componentes?.some(element=>element.tipo==='inscripcion')&&(section.componentes?.length||0)<30?[...(section.componentes||[]),newSectionElement('inscripcion')]:section.componentes})} />
        {activity.inscripciones&&<div className="activity-settings-grid"><Input label="Cupos máximos (vacío: sin límite)" type="number" min={1} max={10000} step={1} value={activity.cupos??''} onChange={event=>update({cupos:event.target.value?Number(event.target.value):null})} /><Select label="Confirmación de inscripción" value={activity.confirmacion} options={[{value:'manual',label:'Pendiente de confirmación por la tienda'},{value:'automatica',label:'Confirmar automáticamente (gratuita)'}]} onChange={event=>update({confirmacion:event.target.value as SectionActivity['confirmacion']})} /></div>}
      </>}
      <p><Link to="/emprendedor/actividades">Ver consultas e inscripciones recibidas ↗</Link></p>
      <p>Agrega los bloques de formulario para mostrar «Solicitar información» o «Inscribirme». Las consultas no reservan cupos. El precio es informativo y no habilita compras.</p>
    </>}
  </fieldset>;
}
