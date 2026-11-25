import { AdminModal } from '../components/ui/AdminModal';
import '../../../shared/palettes.css';
import { useEffect, useRef, useState } from 'react';
import { WEB_FONTS, loadFont } from '../../storefront/visual/fontLibrary';
import { fonts } from '../../storefront/visual/cssVariables';
import type { FontFamily } from '../../storefront/visual/types';
import type { ControlProps } from './controls';
const optionLabel=(id:string)=>id==='system'?'Fuente del sistema':fonts[id as FontFamily]?.split(',')[0].replace(/"/g,'')??id;

function FontSample({id, label, selected, onChoose}: {id:FontFamily;label:string;selected:boolean;onChoose:()=>void}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { loadFont(id, element.ownerDocument); observer.disconnect(); }
    });
    observer.observe(element); return () => observer.disconnect();
  }, [id]);
  return <button ref={ref} type="button" aria-pressed={selected} onClick={onChoose}><strong>{label}</strong><span style={{fontFamily:fonts[id]}}>Tu tienda, tu estilo · Aa 123</span></button>;
}

export function FontControl(props: ControlProps) {
  const [open,setOpen] = useState(false), [query,setQuery] = useState(''), [category,setCategory] = useState('Todas');
  const selected = props.value as FontFamily;
  const local = (props.options ?? []).filter(id => !(id in WEB_FONTS));
  const entries = [...local.map(id => ({id:id as FontFamily,label:optionLabel(id),category:id === 'serif' ? 'Serif' : 'Del dispositivo'})), ...Object.entries(WEB_FONTS).map(([id,[label,category]]) => ({id:id as FontFamily,label,category}))];
  const matches = entries.filter(font => font.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (category === 'Todas' || font.category === category));
  useEffect(() => loadFont(selected, document), [selected]);
  return <div className="ve-control ve-font-control"><div className="ve-control-label"><span>{props.label}</span><button type="button" onClick={props.onReset} aria-label={`Restablecer ${props.label}`}>↺</button></div>
    <select aria-label={props.label} value={selected} onChange={event => props.onChange(event.target.value)}>{entries.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select>
    <p style={{fontFamily:fonts[selected],fontSize:20}}>Aa · Tu tienda, tu estilo</p>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Explorar más fuentes</button>
    <AdminModal open={open} portal className="font-library-dialog" size="xl" title={`Biblioteca · ${props.label.toLowerCase()}`} onClose={()=>setOpen(false)}><div className="ve-font-library"><div className="ve-font-filters"><label>Buscar fuente<input autoFocus placeholder="Buscar por nombre…" type="search" aria-label={`Buscar ${props.label.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)} /></label><label>Categoría<select aria-label={`Categoría de ${props.label.toLowerCase()}`} value={category} onChange={event => setCategory(event.target.value)}>{['Todas','Sans serif','Serif','Display','Manuscrita','Monoespaciada','Del dispositivo'].map(name => <option key={name}>{name}</option>)}</select></label></div><p className="ve-hint">Las muestras visibles se cargan bajo demanda. La tienda solo carga las fuentes elegidas.</p><div className="ve-font-results">{matches.map(font => <FontSample key={font.id} {...font} selected={font.id === selected} onChoose={() => {props.onChange(font.id);setOpen(false);}} />)}{!matches.length && <p>No hay fuentes con ese nombre en esta categoría.</p>}</div></div></AdminModal>
    <small>{props.overridden ? 'Personalizado' : 'Del diseño original'}</small>
  </div>;
}
