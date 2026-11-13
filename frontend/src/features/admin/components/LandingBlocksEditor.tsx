import { useEffect, useState, type ReactNode } from 'react';
import { SYSTEM_SECTIONS, systemSectionVisible, type SystemSectionId } from '../../landing/types/homeSections';
import { Link } from 'react-router-dom';
import type { BloqueLanding, TipoBloqueLanding } from '../../landing/types/landing.types';
import { AdminCard, Button, Input, Textarea, Toggle, Modal } from './ui';
import { ImageUpload } from './ui/ImageUpload';
import { defaultStoryBlocks, editableLandingBlocks, restoreStoryBlocks } from '../../landing/types/defaultStoryBlocks';
import { FlexibleSectionEditor } from './FlexibleSectionEditor';
import { SECTION_PRESETS, createFlexibleSection, type SectionPreset } from '../../landing/types/sectionElements';
import './landing-blocks.css';

// Los identificadores vienen de SYSTEM_SECTIONS: no confundir otros tipos con Minimal.
const TEMPLATE_NAMES: Record<string, string> = {
  catalog: 'Catálogo',
  editorial: 'Editorial',
  minimal: 'Minimal',
  visual: 'Visual',
};

function templateAvailability(templates: readonly string[]): string {
  const names = [...new Set(templates)].map(id => TEMPLATE_NAMES[id] ?? id);
  if (names.length === 4) return 'Disponible en las cuatro plantillas';
  return names.length ? `Disponible en: ${names.join(', ')}` : 'Sin plantilla asignada';
}

export const BLOCK_TYPES: { tipo: TipoBloqueLanding; nombre: string; descripcion: string; icono: string }[] = [
  { tipo:'historia', nombre:'Nuestra historia', descripcion:'Cuenta el origen y propósito de tu negocio.', icono:'◧' },
  { tipo:'imagen_texto', nombre:'Imagen y texto', descripcion:'Combina una fotografía con una explicación.', icono:'▧' },
  { tipo:'texto', nombre:'Texto libre', descripcion:'Un título y párrafos para comunicar lo que necesitas.', icono:'≡' },
  { tipo:'galeria', nombre:'Galería', descripcion:'Muestra hasta ocho fotografías con sus descripciones.', icono:'▦' },
  { tipo:'cita', nombre:'Cita destacada', descripcion:'Destaca una frase o un testimonio.', icono:'❞' },
];
function SectionThumbnail({type}:{type:TipoBloqueLanding}) {
  const image=type==='historia'||type==='imagen_texto',gallery=type==='galeria';
  return <svg className="lb-thumbnail" viewBox="0 0 220 104" fill="none" aria-hidden="true"><rect width="220" height="104" rx="8" fill="#f0f0fa"/>{gallery ? [20,82,144].map(x=><g key={x}><rect x={x} y="20" width="56" height="48" rx="4" fill="#c7c9e6"/><path d={`M${x+4} 61l15-18 9 10 9-14 15 22`} fill="#939bc5"/><rect x={x} y="76" width="42" height="4" rx="2" fill="#b5b9d5"/></g>) : <><rect x={image?112:28} y="28" width={image?81:164} height="7" rx="3" fill="#777ab1"/><rect x={image?112:28} y="45" width={image?65:135} height="4" rx="2" fill="#b4b8d7"/><rect x={image?112:28} y="56" width={image?81:164} height="4" rx="2" fill="#b4b8d7"/><rect x={image?112:28} y="67" width={image?72:150} height="4" rx="2" fill="#b4b8d7"/>{image&&<><rect x="20" y="18" width="76" height="68" rx="5" fill="#c7c9e6"/><path d="m25 76 24-31 15 15 12-20 16 36" fill="#939bc5"/><circle cx="78" cy="33" r="7" fill="#ebecfa"/></>}{type==='cita'&&<path d="M16 24h9l-4 10h5v12H14V33z" fill="#777ab1"/>}</>}</svg>;
}
type UnifiedLayout = {order:string[]; flags:Record<string,boolean>; onMove:(order:string[])=>void; onToggle:(flag:string,visible:boolean)=>void; renderConfig:(id:SystemSectionId)=>ReactNode};
export function LandingBlocksEditor({ value, onChange, layout }: { value?: BloqueLanding[]; onChange: (blocks: BloqueLanding[]) => void; layout?:UnifiedLayout }) {
  const blocks = value ?? [];
  const rows = layout ? layout.order : blocks.map(block=>block.id);
  const remainingDefaults = defaultStoryBlocks().filter(block => !blocks.some(current => current.id === block.id));
  const expandedKey = 'openmind:landing:expanded-section';

  const [expanded, setExpanded] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(expandedKey) || undefined;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    try {
      if (expanded) localStorage.setItem(expandedKey, expanded);
      else localStorage.removeItem(expandedKey);
    } catch {
      // El editor sigue funcionando sin almacenamiento.
    }
  }, [expanded]);
  const [remove, setRemove] = useState<string>();
  const [picker, setPicker] = useState(false);
  const [flexiblePicker, setFlexiblePicker] = useState(false);
  const update = (id: string, patch: Partial<BloqueLanding>) => onChange(blocks.map(block => block.id === id ? {...block,...patch} : block));
  const move = (index: number, delta: number) => { if(index+delta<0||index+delta>=rows.length)return; const next=[...rows]; [next[index],next[index+delta]]=[next[index+delta],next[index]]; if(layout)layout.onMove(next);else onChange(next.map(id=>blocks.find(block=>block.id===id)!)); };
  const addFlexible = (preset: SectionPreset) => { const block = createFlexibleSection(preset); onChange([...editableLandingBlocks(value), block]); setExpanded(block.id); setPicker(false); setFlexiblePicker(false); };
  return <section id="secciones-tienda" aria-label="Secciones de mi tienda" className="landing-blocks scroll-mt-24">
    <AdminCard><div className="lb-heading"><div><h2>Secciones de mi tienda</h2><p>Ordena productos, categorías y contenido. Portada y Beneficios permanecen al inicio. La disponibilidad de los apartados del sistema se indica en cada fila; las secciones propias comparten contenido, pero su presentación puede variar según la plantilla.</p></div><button type="button" className="lp-button lp-button-primary" aria-label="Agregar sección" disabled={editableLandingBlocks(value).length >= 20} onClick={() => setPicker(true)}>＋ Agregar sección</button></div>
      <div className="lb-toolbar"><span>{`${blocks.length} secciones propias · ${blocks.filter(block => block.visible).length} visibles`}</span><Link to="/emprendedor/diseno/editor">Personalizar apariencia ↗</Link></div>
      {value === undefined && <div className="lb-originals"><div className="lb-originals-visual"><SectionThumbnail type="historia" /></div><div><strong>Aún no hay secciones creadas</strong><p>Los apartados comerciales conservan tu selección actual. Si lo deseas, puedes comenzar con dos historias de ejemplo y personalizarlas.</p></div><button type="button" className="lp-button" onClick={() => {onChange(defaultStoryBlocks());setExpanded(defaultStoryBlocks()[0].id);}}>Usar historias originales</button></div>}
      {value !== undefined && !blocks.length && <div className="lb-empty"><SectionThumbnail type="texto" /><strong>Tu próxima historia empieza aquí</strong><p>Agrega un bloque de texto, imágenes o galería.</p><button type="button" className="lp-button" onClick={() => setPicker(true)}>Explorar secciones</button></div>}
      <ol className="lb-list">{rows.map((id,index) => {
        const system=SYSTEM_SECTIONS.find(section=>section.id===id);
        if(system && layout) {const visible=systemSectionVisible(system.id,layout.flags); return <li key={id} data-system-section={id}>
          <div className="lb-row"><span className="lb-position" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><button type="button" className="lb-expand" aria-label={`Editar ${system.name}`} aria-expanded={expanded===id} aria-controls={'lb-fields-'+id} onClick={()=>setExpanded(expanded===id?undefined:id)}><span><strong>{system.name}</strong><small>Apartado del sistema · {templateAvailability(system.templates)}</small></span><span className="lb-edit-label">{expanded===id?'Cerrar':'Editar'}</span></button><div className="lb-actions"><span className={'lb-status '+(!visible?'is-hidden':'')}>{visible?'Visible':'Oculta'}</span><Toggle checked={visible} ariaLabel={`Mostrar ${system.name}`} onChange={enabled=>layout.onToggle(system.flag,enabled)} /><div className="lb-move"><button type="button" aria-label={`Subir ${system.name}`} disabled={!index} onClick={()=>move(index,-1)}>↑</button><button type="button" aria-label={`Bajar ${system.name}`} disabled={index===rows.length-1} onClick={()=>move(index,1)}>↓</button></div></div></div>
          {expanded===id&&<div className="lb-fields" id={'lb-fields-'+id}>{layout.renderConfig(system.id)}</div>}
        </li>; }
        const block=blocks.find(block=>block.id===id);if(!block)return null;
        return <li key={block.id} data-block-id={block.id}>
        <div className="lb-row"><span className="lb-position" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><button type="button" className="lb-expand" aria-label={`Editar sección ${index+1}`} aria-expanded={expanded === block.id} aria-controls={'lb-fields-'+block.id} onClick={() => setExpanded(expanded === block.id ? undefined : block.id)}><span className="lb-row-thumbnail">{block.imagenes[0]?.src ? <img src={block.imagenes[0].src} alt="" /> : <SectionThumbnail type={block.tipo} />}</span><span><strong>{block.nombre_interno || block.titulo || 'Sin título'}</strong><small>{BLOCK_TYPES.find(t => t.tipo === block.tipo)?.nombre || 'Sección configurable'} · Contenido compartido (revisa su presentación en cada plantilla)</small></span><span className="lb-edit-label">{expanded === block.id ? 'Cerrar' : 'Editar'} <span aria-hidden="true">{expanded === block.id ? '⌃' : '⌄'}</span></span></button><div className="lb-actions"><span className={'lb-status '+(!block.visible?'is-hidden':'')}>{block.visible?'Visible':'Oculta'}</span><Toggle checked={block.visible} ariaLabel={`Mostrar sección ${index+1}`} onChange={visible => update(block.id,{visible})} /><div className="lb-move"><button type="button" title="Mover arriba" aria-label={`Subir sección ${index+1}`} disabled={!index} onClick={() => move(index,-1)}>↑</button><button type="button" title="Mover abajo" aria-label={`Bajar sección ${index+1}`} disabled={index === rows.length-1} onClick={() => move(index,1)}>↓</button></div><button type="button" className="lb-danger" aria-label={`Eliminar sección ${index+1}`} onClick={() => setRemove(block.id)}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6"/></svg></button></div></div>
        {expanded === block.id && <div className="lb-fields" id={'lb-fields-'+block.id}>{block.tipo === 'personalizada' ? <FlexibleSectionEditor section={block} onChange={next => update(block.id, next)} /> : <><div className="lb-text-fields"><Input label="Título de la sección" maxLength={255} value={block.titulo} onChange={e => update(block.id,{titulo:e.target.value})} /><Input label="Subtítulo de la sección" maxLength={500} value={block.subtitulo} onChange={e => update(block.id,{subtitulo:e.target.value})} /><Textarea label={block.tipo === 'cita' ? 'Cita o testimonio' : 'Párrafos de la sección'} rows={5} maxLength={10000} value={block.texto} onChange={e => update(block.id,{texto:e.target.value})} />
          </div><div className="lb-media-fields">{['historia','imagen_texto','galeria'].includes(block.tipo) && <><p className="lb-help">JPG, PNG, WebP, HEIC o HEIF · Hasta 2 MB por imagen.</p>{block.imagenes.map((image,i) => <div className="lb-image" key={image.id}><ImageUpload label={`Cambiar imagen ${i+1}`} value={image.src} maxMB={2} allowSVG={false} onChange={src => update(block.id,{imagenes:src ? block.imagenes.map(item => item.id === image.id ? {...item,src} : item) : block.imagenes.filter(item => item.id !== image.id)})} /><Input label={`Descripción de imagen ${i+1}`} value={image.alt} maxLength={250} onChange={e => update(block.id,{imagenes:block.imagenes.map(item => item.id === image.id ? {...item,alt:e.target.value} : item)})} />{block.tipo === 'galeria' && <div className="lb-actions"><button type="button" disabled={!i} onClick={() => { const images=[...block.imagenes]; [images[i-1],images[i]]=[images[i],images[i-1]]; update(block.id,{imagenes:images}); }}>Mover imagen antes</button><button type="button" disabled={i === block.imagenes.length-1} onClick={() => { const images=[...block.imagenes]; [images[i+1],images[i]]=[images[i],images[i+1]]; update(block.id,{imagenes:images}); }}>Mover imagen después</button></div>}</div>)}
          {block.imagenes.length < (block.tipo === 'galeria' ? 8 : 1) && <ImageUpload label="Agregar imagen a la sección" value="" maxMB={2} allowSVG={false} onChange={src => { if(src) update(block.id,{imagenes:[...block.imagenes,{id:crypto.randomUUID(),src,alt:''}]}); }} />}</>}
        </div></>}</div>}
      </li>;})}</ol><div className="lb-bottom"><span>{blocks.length} de 20 secciones propias · Los apartados del sistema no consumen este límite</span>{value !== undefined&&remainingDefaults.length>0&&<button type="button" disabled={blocks.length+remainingDefaults.length>20} onClick={() => onChange(restoreStoryBlocks(value))}>↺ Recuperar secciones predeterminadas</button>}</div>
      {layout&&<details className="lb-order-preview"><summary>Orden configurado (no equivale a la vista de cada plantilla)</summary><p>Portada → Beneficios</p><ol>{rows.filter(id=>{const system=SYSTEM_SECTIONS.find(section=>section.id===id);return system?systemSectionVisible(system.id,layout.flags):blocks.find(block=>block.id===id)?.visible;}).map(id=><li key={id}>{SYSTEM_SECTIONS.find(section=>section.id===id)?.name||blocks.find(block=>block.id===id)?.nombre_interno||blocks.find(block=>block.id===id)?.titulo||'Sección sin título'}</li>)}</ol><p>Este listado muestra el orden configurado, no la compatibilidad efectiva de cada sección propia. Los apartados vacíos, ocultos o exclusivos de otra plantilla pueden no aparecer. Guarda y usa «Ver mi tienda» para comprobar la plantilla seleccionada.</p></details>}
    </AdminCard>
    <Modal open={flexiblePicker} onClose={()=>setFlexiblePicker(false)} title="Crear sección configurable" size="xl"><p className="lb-library-description">Crea tu propia combinación o comienza con una plantilla. La sección nueva queda oculta hasta que la publiques y guardes.</p><div className="lb-picker" aria-label="Plantillas configurables">{Object.entries(SECTION_PRESETS).map(([preset, name]) => <button key={preset} type="button" disabled={blocks.length >= 20} onClick={() => addFlexible(preset as SectionPreset)}><SectionThumbnail type="personalizada" /><strong>{name}</strong><small>Agrega, configura y ordena bloques de contenido y multimedia.</small><span>Crear →</span></button>)}</div><Button type="button" variant="ghost" onClick={() => setFlexiblePicker(false)}>Cancelar</Button></Modal>
    <Modal open={picker} onClose={()=>setPicker(false)} title="Agregar una sección" size="xl"><p className="lb-library-description">Elige qué quieres contar. El contenido se comparte entre plantillas; comprueba el resultado visual en cada una.</p><div className="lb-picker" aria-label="Tipos de sección">{BLOCK_TYPES.map(type => <button key={type.tipo} type="button" disabled={editableLandingBlocks(value).length>=20} onClick={() => {const block:BloqueLanding={id:crypto.randomUUID(),tipo:type.tipo,visible:true,titulo:type.nombre,subtitulo:'',texto:'',imagenes:[]};onChange([...editableLandingBlocks(value),block]);setExpanded(block.id);setPicker(false);}}><SectionThumbnail type={type.tipo}/><strong>{type.nombre}</strong><small>{type.descripcion}</small><span className="lb-add-type">Agregar →</span></button>)}</div><div className="lb-library-footer"><Button type="button" variant="outline" disabled={blocks.length >= 20} onClick={() => { setPicker(false); setFlexiblePicker(true); }}>Crear sección configurable o elegir plantilla</Button><span>Productos y categorías se editan en esta lista. Beneficios conserva su apartado fijo.</span></div></Modal>
    <Modal open={!!remove} onClose={() => setRemove(undefined)} title="Eliminar sección" size="sm"><p>Se retirará esta sección de las cuatro plantillas al guardar. Puedes deshacer el cambio antes de salir.</p><div className="lb-actions"><button type="button" onClick={() => setRemove(undefined)}>Cancelar</button><button type="button" className="lb-danger" onClick={() => {onChange(blocks.filter(block => block.id !== remove));setRemove(undefined);}}>Eliminar sección</button></div></Modal>
  </section>;
}
