import './palettes.css';
import { useEffect, useRef, useState } from 'react';
import { AdminModal } from '../features/admin/components/ui/AdminModal';
import { deletePalette, savePalette, usePaletteLibrary, type PaletteColors, type StorePalette } from './palettes';

export const COLOR_LABELS:Record<keyof PaletteColors,string>={primary:'Color principal',secondary:'Color secundario',accent:'Color de acento',background:'Fondo general',alternate:'Fondo alternativo de secciones',surface:'Fondo de tarjetas',text:'Texto principal',muted:'Texto secundario',structural:'Color estructural',button:'Color de botones',buttonText:'Texto de botones',border:'Bordes'};
const LIMIT_MESSAGE='Puedes guardar un máximo de 2 paletas personalizadas. Edita o elimina una para crear otra.';
const colorValue=(value:string,fallback:string)=>/^#[a-f0-9]{6}$/i.test(value)?value:/^#[a-f0-9]{3}$/i.test(value)?'#'+value.slice(1).split('').map(letter=>letter+letter).join(''):/^#[a-f0-9]{8}$/i.test(value)?value.slice(0,7):fallback;
const editableColors=(colors:PaletteColors)=>Object.fromEntries(Object.entries(colors).map(([key,value])=>[key,colorValue(value,colorValue(colors.primary,'#1a3a6b'))])) as PaletteColors;

export function PaletteLibrary({colors,selectedId,onApply,onOriginal,manage=true}: {colors:PaletteColors;selectedId?:string|null;onApply:(palette:StorePalette)=>void;onOriginal?:()=>void;manage?:boolean}) {
  const {library,error,retry}=usePaletteLibrary();
  const [editing,setEditing]=useState<StorePalette|null>(null),[confirm,setConfirm]=useState<StorePalette|null>(null),[menu,setMenu]=useState<string|null>(null);
  const [notice,setNotice]=useState(''),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false),[recent,setRecent]=useState<StorePalette[]|null>(null);
  const menuRoot=useRef<HTMLDivElement>(null);
  const own=recent??library?.propias??[];
  useEffect(()=>setRecent(null),[library?.propias]);
  useEffect(()=>{
    if(!menu)return;
    const close=(event:PointerEvent)=>{if(!menuRoot.current?.querySelector(`[data-palette-menu="${menu}"]`)?.contains(event.target as Node))setMenu(null);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(null);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[menu]);
  const activeId=selectedId??library?.sistema.find(palette=>Object.entries(palette.colores).every(([key,value])=>colors[key as keyof PaletteColors]===value))?.id;
  const start=(palette?:StorePalette)=>{
    if(!palette&&own.length>=2){setNotice(LIMIT_MESSAGE);return;}
    setEditing(palette?{...palette,colores:editableColors(palette.colores)}:{id:'',nombre:'',colores:editableColors(colors)});setMenu(null);setFormError('');setNotice('');
  };
  async function persist(){
    if(!editing||busy)return;
    if(!editing.id&&own.length>=2){setFormError(LIMIT_MESSAGE);return;}
    setBusy(true);setFormError('');
    try{
      const palettes=await savePalette({nombre:editing.nombre,colores:editing.colores},editing.id||undefined);
      const saved=palettes.find(palette=>editing.id?palette.id===editing.id:palette.nombre===editing.nombre.trim());
      setRecent(palettes);setEditing(null);if(saved)onApply(saved);
      setNotice('Paleta guardada. Guarda los cambios del módulo para conservar esta elección.');
    }catch(error){setFormError(error instanceof Error?error.message:'No se pudo guardar la paleta.');}
    finally{setBusy(false);}
  }
  const render=(palette:StorePalette,custom:boolean)=><div className="shared-palette-card" key={palette.id}>
    <button type="button" className="shared-palette-choice" aria-label={`Paleta ${palette.nombre}`} aria-pressed={activeId===palette.id} onClick={()=>onApply(palette)}><span className="shared-palette-swatches" aria-hidden="true">{['primary','alternate','accent','structural','surface'].map(key=><i key={key} style={{background:palette.colores[key as keyof PaletteColors]}}/>)}</span><strong>{palette.nombre}</strong><small>{custom?'Personalizada':'Predefinida'}{activeId===palette.id?' · En uso':''}</small></button>
    {custom&&manage&&<div className="shared-palette-menu" data-palette-menu={palette.id}><button type="button" className="shared-palette-more" aria-label={`Opciones de paleta ${palette.nombre}`} aria-haspopup="menu" aria-expanded={menu===palette.id} onClick={()=>setMenu(menu===palette.id?null:palette.id)}>⋯</button>{menu===palette.id&&<div role="menu" aria-label={`Acciones de ${palette.nombre}`}><button type="button" role="menuitem" onClick={()=>start(palette)}>Editar</button><button type="button" role="menuitem" onClick={()=>{setMenu(null);setFormError('');setConfirm(palette);}}>Eliminar</button></div>}</div>}
  </div>;
  return <div className="shared-palette-library" ref={menuRoot}>
    <div className="shared-palette-caption"><span>Paleta</span>{onOriginal&&<button type="button" className="shared-palette-reset" onClick={onOriginal}>Restablecer colores</button>}</div>
    {error&&<p role="alert">{error} <button type="button" onClick={retry}>Reintentar</button></p>}{!library&&!error&&<p>Cargando paletas…</p>}
    <div className="shared-palette-grid" aria-label="Biblioteca de paletas">{library?.sistema.map(palette=>render(palette,false))}{own.map(palette=>render(palette,true))}{manage&&library&&own.length<2&&<button type="button" className="shared-palette-create" onClick={()=>start()}><span aria-hidden="true">+</span>Crear paleta</button>}</div>
    {notice&&<p role="status" className="shared-palette-notice">{notice}</p>}
    <AdminModal open={!!editing} portal className="palette-dialog" size="xl" title={editing?.id?'Editar paleta':'Crear paleta'} onClose={()=>{if(!busy)setEditing(null);}}>
      {editing&&<form className="shared-palette-form" onSubmit={event=>{event.preventDefault();void persist();}}><fieldset disabled={busy}><label className="shared-palette-name">Nombre<input autoFocus required aria-label="Nombre de la paleta" value={editing.nombre} maxLength={60} onChange={event=>setEditing({...editing,nombre:event.target.value})}/></label><div className="shared-palette-colors">{Object.entries(COLOR_LABELS).map(([key,label])=><label key={key}><span>{label}</span><input aria-label={`Paleta · ${label}`} type="color" value={editing.colores[key as keyof PaletteColors]} onChange={event=>setEditing({...editing,colores:{...editing.colores,[key]:event.target.value}})}/><code>{editing.colores[key as keyof PaletteColors].toUpperCase()}</code></label>)}</div>{formError&&<p role="alert">{formError}</p>}<div className="shared-dialog-actions"><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button type="submit" className="shared-dialog-primary" disabled={!editing.nombre.trim()}>{busy?'Guardando…':'Guardar paleta'}</button></div></fieldset></form>}
    </AdminModal>
    <AdminModal open={!!confirm} portal className="palette-dialog palette-dialog--confirm" size="sm" title="Eliminar paleta" onClose={()=>{if(!busy)setConfirm(null);}}>
      {confirm&&<><p>{confirm.id===selectedId?'Esta paleta está en uso. Aplica y guarda otra antes de eliminarla.':`¿Eliminar la paleta «${confirm.nombre}»?`}</p>{formError&&<p role="alert">{formError}</p>}<div className="shared-dialog-actions"><button type="button" disabled={busy} onClick={()=>setConfirm(null)}>Cancelar</button>{confirm.id!==selectedId&&<button type="button" disabled={busy} onClick={()=>{setBusy(true);void deletePalette(confirm.id).then(palettes=>{setRecent(palettes);setConfirm(null);setNotice('Paleta eliminada. Puedes crear otra.');}).catch(error=>setFormError(error.message)).finally(()=>setBusy(false));}}>Confirmar eliminación</button>}</div></>}
    </AdminModal>
  </div>;
}
