import { Link } from 'react-router-dom';
import './paid-activity-settings.css';
import { Input, Select, Toggle } from './ui';
import type { BloqueLanding } from '../../landing/types/landing.types';
import { newActivity, newSectionElement, newPaidActivitySettings, type PaidActivitySettings, type SectionActivity, type ElementKind, type SectionElement } from '../../landing/types/sectionElements';

/** Operational settings live on the same section; visual content stays in its blocks. */
export function ActivitySettings({section,onChange}:{section:BloqueLanding;onChange:(section:BloqueLanding)=>void}) {
  const activity=section.actividad;
  const update=(patch:Partial<SectionActivity>)=>onChange({...section,actividad:{...activity!,...patch}});
  const sale=activity?.venta;
  const updateSale=(patch:Partial<PaidActivitySettings>)=>{if(sale)update({venta:{...sale,...patch}});};
  const add=(kind:ElementKind)=>onChange({...section,componentes:[...(section.componentes||[]),newSectionElement(kind)]});
  const components=section.componentes||[];
  const kinds=['precio','fecha','horario'] as const;
  const firstVisible=(kind:ElementKind)=>components.find(e=>e.tipo===kind&&e.visible);
  const price=firstVisible('precio'),day=firstVisible('fecha'),hours=firstVisible('horario');
  const edit=(kind:ElementKind,patch:Partial<SectionElement>)=>{
    const current=firstVisible(kind)||components.find(e=>e.tipo===kind);
    if(!current&&components.length>=30)return;
    const next={...(current||newSectionElement(kind)),...patch,visible:true};
    onChange({...section,componentes:current?components.map(e=>e.id===current.id?next:e):[...components,next]});
  };
  const issues:string[]=[];
  if(sale){
    if(!price||!/^\d{1,12}$/.test(price.importe||'')||Number(price.importe)<=0)issues.push('Ingresa un precio por participante mayor que $0.');
    if(!day?.fecha)issues.push('Selecciona la fecha de inicio.');
    if(!hours?.inicio||!hours?.termino)issues.push('Completa las horas de inicio y término.');
    if(day?.fecha&&hours?.inicio&&hours?.termino&&`${day.hasta||day.fecha}T${hours.termino}`<=`${day.fecha}T${hours.inicio}`)issues.push('El término debe ser posterior al inicio.');
    if(!Number.isInteger(activity?.cupos)||Number(activity?.cupos)<1||Number(activity?.cupos)>10000)issues.push('Define entre 1 y 10.000 cupos.');
    for(const kind of kinds)if(components.filter(e=>e.tipo===kind&&e.visible).length>1)issues.push(`Deja solo un bloque ${kind} visible.`);
    if(!components.some(e=>e.visible&&(e.tipo==='titulo'||e.tipo==='nombre')&&e.texto?.trim())&&!section.titulo?.trim())issues.push('Agrega un título para la actividad.');
    if(!Number.isInteger(sale.cierre_minutos)||sale.cierre_minutos<0||sale.cierre_minutos>10080)issues.push('El cierre de ventas debe estar entre 0 y 10.080 minutos.');
    if(!Number.isInteger(sale.tolerancia_minutos)||sale.tolerancia_minutos<0||sale.tolerancia_minutos>120)issues.push('La tolerancia debe estar entre 0 y 120 minutos.');
    if(sale.cancelacion==='anticipada'&&(!Number.isInteger(sale.cancelacion_horas)||sale.cancelacion_horas<0||sale.cancelacion_horas>720))issues.push('La anticipación de anulaciones debe estar entre 0 y 720 horas.');
    try{new Intl.DateTimeFormat('es-CL',{timeZone:activity?.zona_horaria||'!'}).format();}catch{issues.push('Selecciona una zona horaria válida, por ejemplo America/Santiago.');}
  }
  return <fieldset className="activity-settings"><legend>Servicio o taller</legend>
    <Select label="Tipo de actividad" value={activity?.tipo||''} options={[{value:'',label:'Contenido general'},{value:'servicio',label:'Servicio'},{value:'taller',label:'Taller o actividad'}]} onChange={event=>onChange({...section,actividad:event.target.value?{...newActivity(event.target.value as SectionActivity['tipo']),...(activity||{}),tipo:event.target.value as SectionActivity['tipo'],inscripciones:false}:null})} />
    {activity&&<>
      <div className="activity-settings-grid"><Input label="Clasificación (opcional)" value={activity.categoria} maxLength={100} onChange={event=>update({categoria:event.target.value})} /><Select label="Estado de la actividad" value={activity.estado} options={[{value:'activa',label:'Activa'},{value:'cancelada',label:'Cancelada'}]} onChange={event=>update({estado:event.target.value as SectionActivity['estado']})} /></div>
      <p>Publica u oculta esta actividad con el interruptor de la sección. El título, descripción, imágenes, duración, condiciones, precio y contacto se editan en sus bloques.</p>
      <div className="activity-settings-grid"><Input label="Zona horaria" value={activity.zona_horaria} required maxLength={80} placeholder="America/Santiago" onChange={event=>update({zona_horaria:event.target.value})} /><Input label="Plataforma de reunión (opcional)" value={activity.plataforma} maxLength={100} placeholder="Zoom, Google Meet…" onChange={event=>update({plataforma:event.target.value})} /></div>
      <Input label="Enlace privado de reunión (opcional)" type="url" value={activity.enlace_reunion||''} maxLength={2000} onChange={event=>update({enlace_reunion:event.target.value})} />
      <p>Este enlace solo lo ve el propietario en el panel. No se publica ni se entrega automáticamente; verifica al participante antes de compartirlo.</p>
      <Toggle label="Actividad gratuita" checked={activity.gratuito} onChange={gratuito=>update({gratuito,inscripciones:gratuito?activity.inscripciones:false,venta:gratuito?null:activity.venta})} />
      {activity.tipo==='taller'&&<>
        <p>Para publicar un taller agrega un bloque Fecha y otro Horario. Los primeros bloques visibles determinan la inscripción. La fecha de término es opcional; el horario corresponde a cada día de la actividad.</p>
        <div className="flexible-add">{(['fecha','horario'] as const).filter(kind=>!section.componentes?.some(element=>element.tipo===kind)).map(kind=><button key={kind} className="lp-button" type="button" disabled={(section.componentes?.length||0)>=30} onClick={()=>add(kind)}>Agregar {kind==='fecha'?'fecha':'horario'}</button>)}</div>
        <Toggle label="Permitir inscripciones gratuitas" disabled={!activity.gratuito} checked={activity.inscripciones} onChange={inscripciones=>onChange({...section,actividad:{...activity,inscripciones},componentes:inscripciones&&!section.componentes?.some(element=>element.tipo==='inscripcion')&&(section.componentes?.length||0)<30?[...(section.componentes||[]),newSectionElement('inscripcion')]:section.componentes})} />
        {activity.inscripciones&&<div className="activity-settings-grid"><Input label="Cupos máximos (vacío: sin límite)" type="number" min={1} max={10000} step={1} value={activity.cupos??''} onChange={event=>update({cupos:event.target.value?Number(event.target.value):null})} /><Select label="Confirmación de inscripción" value={activity.confirmacion} options={[{value:'manual',label:'Pendiente de confirmación por la tienda'},{value:'automatica',label:'Confirmar automáticamente (gratuita)'}]} onChange={event=>update({confirmacion:event.target.value as SectionActivity['confirmacion']})} /></div>}
      </>}
      {!activity.gratuito&&<>
        <Toggle label="Preparar venta online" checked={!!sale} onChange={enabled=>update({venta:enabled?newPaidActivitySettings():null,inscripciones:false})} />
        {sale&&<div className="activity-settings paid-sale-editor" aria-label="Configuración de venta online">
          <div className="paid-sale-heading"><strong>Venta online</strong><p>Define el precio, las fechas y los cupos que podrán comprar tus clientes.</p></div>
          {issues.length>0&&<div className="paid-sale-validation paid-sale-incomplete" role="alert">
            <strong>Para guardar la venta online, completa lo siguiente:</strong>
            <ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>
          </div>}
          <div className="paid-sale-price"><label htmlFor={`paid-price-${section.id}`}>Precio por participante (CLP)</label><div className="paid-sale-money"><span>$</span><input id={`paid-price-${section.id}`} type="text" inputMode="numeric" maxLength={12} placeholder="15000" value={price?.importe||components.find(e=>e.tipo==='precio')?.importe||''} disabled={!components.some(e=>e.tipo==='precio')&&components.length>=30} onChange={e=>edit('precio',{importe:e.target.value.replace(/[^0-9]/g,'')})}/></div><p>Este importe se sincroniza con el bloque Precio de la tienda.</p>{!price&&<button type="button" className="paid-sale-add" disabled={!components.some(e=>e.tipo==='precio')&&components.length>=30} onClick={()=>edit('precio',{})}>+ {components.some(e=>e.tipo==='precio')?'Mostrar':'Agregar'} bloque Precio</button>}</div>
          <div className="activity-settings-grid">
            <Input label="Fecha de inicio" type="date" value={day?.fecha||''} onChange={e=>edit('fecha',{fecha:e.target.value})} />
            <Input label="Fecha de término (opcional)" type="date" value={day?.hasta||''} onChange={e=>edit('fecha',{hasta:e.target.value})} />
            <Input label="Hora de inicio" type="time" value={hours?.inicio||''} onChange={e=>edit('horario',{inicio:e.target.value})} />
            <Input label="Hora de término" type="time" value={hours?.termino||''} onChange={e=>edit('horario',{termino:e.target.value})} />
          </div>
          {components.length>=30&&(!price||!day||!hours)&&<p role="alert">Se alcanzó el máximo de 30 bloques. Elimina uno si necesitas crear otro.</p>}
          <div className="activity-settings-grid">
            <Input label="Cupos totales" type="number" min={1} max={10000} step={1} value={activity.cupos??''} onChange={event=>update({cupos:event.target.value?Number(event.target.value):null})} />
            <Input label="Cierre de ventas (minutos antes del inicio)" type="number" min={0} max={10080} step={1} value={sale.cierre_minutos} onChange={event=>updateSale({cierre_minutos:Number(event.target.value)})} />
            <Input label="Tolerancia de atraso (minutos)" type="number" min={0} max={120} step={1} value={sale.tolerancia_minutos} onChange={event=>updateSale({tolerancia_minutos:Number(event.target.value)})} />
            <Select label="Política de anulaciones y devoluciones" value={sale.cancelacion} options={[{value:'evaluacion',label:'Evaluar cada solicitud de devolución'},{value:'anticipada',label:'Admitir anulación anticipada'}]} onChange={event=>updateSale({cancelacion:event.target.value as PaidActivitySettings['cancelacion']})} />
            {sale.cancelacion==='anticipada'&&<Input label="Solicitar anulación con cuántas horas de anticipación" type="number" min={0} max={720} step={1} value={sale.cancelacion_horas} onChange={event=>updateSale({cancelacion_horas:Number(event.target.value)})} />}
          </div>
          <p>Las solicitudes se gestionan desde Servicios y talleres. Si admites anulación anticipada, el comprador puede solicitarla dentro del plazo indicado. Las demás solicitudes se evalúan individualmente.</p>
          <p>Para transferencias, la tienda realiza la devolución desde su banco y registra el comprobante una sola vez. No se solicita otra tarjeta. Las condiciones no limitan los derechos legales del consumidor.</p>
        </div>}
      </>}
      <p><Link to="/emprendedor/actividades">Ver consultas e inscripciones recibidas ↗</Link></p>
      <p>Agrega los bloques de formulario para mostrar «Solicitar información» o «Inscribirme». Las consultas no reservan cupos. Si preparas la venta online, el bloque Precio define el valor por participante.</p>
    </>}
  </fieldset>;
}
