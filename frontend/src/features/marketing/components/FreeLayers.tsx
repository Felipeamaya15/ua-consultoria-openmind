import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { editorialProblem } from '../domain/editor';
import { LAYER_KINDS, MAX_LAYERS, newLayer, normalizeLayers, type FreeLayer, type LayerKind } from '../domain/layers';

const labels: Record<LayerKind, string> = { text: 'Texto', rectangle: 'Rectángulo', circle: 'Óvalo', line: 'Línea', photo: 'Fotografía' };
export interface LayerEditing { selected: string | null; select: (id: string) => void; change: (layers: FreeLayer[]) => void }
interface Drag { id: string; pointer: number; startX: number; startY: number; x: number; y: number; w: number; h: number; layer: FreeLayer }
export function FreeLayerCanvas({ layers, images, editing }: { layers: FreeLayer[]; images: readonly string[]; editing?: LayerEditing }) {
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const coords = (d: Drag, e: PointerEvent<HTMLDivElement>) => ({ id: d.id,
    x: Math.round(Math.max(0, Math.min(100-d.layer.width, d.x+(e.clientX-d.startX)*100/d.w))),
    y: Math.round(Math.max(0, Math.min(100-d.layer.height, d.y+(e.clientY-d.startY)*100/d.h))) });
  if (!layers.length) return null;
  return <div className="marketing-free-board" data-layer-dragging={!!moving} ref={board}>
    {layers.map((layer, index) => {
      const active = editing?.selected === layer.id;
      const pos = moving?.id === layer.id ? moving : layer;
      const src = layer.kind === 'photo' ? images[layer.imageIndex] : undefined;
      const invalid = layer.kind === 'text' ? !!editorialProblem(layer.text) : layer.kind === 'photo' && (!src || failed[layer.id] === src);
      const style: CSSProperties = { left: `${pos.x}%`, top: `${pos.y}%`, width: `${layer.width}%`, height: `${layer.height}%`,
        transform: `rotate(${layer.rotation}deg)`, zIndex: index+1, pointerEvents: editing ? 'auto' : 'none', cursor: editing ? layer.locked ? 'default' : 'grab' : undefined };
      return <div key={layer.id} className="marketing-free-layer" style={style} data-free-layer={layer.id} data-layer-invalid={invalid}
        data-selected={active} data-locked={layer.locked} onPointerDown={e => {
          if (!editing || e.button !== 0 || drag.current) return;
          editing.select(layer.id);
          if (layer.locked || !board.current) return;
          const r = board.current.getBoundingClientRect(); if (!r.width || !r.height) return;
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: layer.id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, x: layer.x, y: layer.y, w: r.width, h: r.height, layer };
        }} onPointerMove={e => { const d = drag.current; if (d?.id === layer.id && d.pointer === e.pointerId) setMoving(coords(d,e)); }}
        onPointerUp={e => { const d = drag.current; if (d?.id !== layer.id || d.pointer !== e.pointerId) return;
          const p = coords(d,e); drag.current = null; setMoving(null); if (p.x !== layer.x || p.y !== layer.y) editing?.change(layers.map(v => v.id === layer.id ? { ...v, x: p.x, y: p.y } : v)); }}
        onPointerCancel={() => { drag.current = null; setMoving(null); }} onLostPointerCapture={() => { drag.current = null; setMoving(null); }}>
        <div className="marketing-free-fill" style={{ opacity: layer.opacity/100, background: layer.kind === 'text' || layer.kind === 'photo' ? 'transparent' : layer.color, borderRadius: layer.kind === 'circle' ? '50%' : undefined }}>
          {layer.kind === 'text' && <div data-layer-text style={{ color: layer.color, fontSize: `${layer.fontSize}cqw`, fontWeight: layer.bold ? 700 : 400 }}>{invalid ? '' : layer.text}</div>}
          {layer.kind === 'photo' && src && <img src={src} alt="Fotografía del contenido" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(prev => ({ ...prev, [layer.id]: src }))} onLoad={() => setFailed(prev => { if (prev[layer.id] !== src) return prev; const next = { ...prev }; delete next[layer.id]; return next; })} />}
        </div>
      </div>;
    })}
  </div>;
}
export function FreeLayerControls({ layers, images, editing, accent, textColor }: { layers: FreeLayer[]; images: readonly string[]; editing: LayerEditing; accent: string; textColor: string }) {
  const selected = layers.find(v => v.id === editing.selected);
  const change = (next: FreeLayer[]) => editing.change(normalizeLayers(next));
  const update = (patch: Partial<FreeLayer>) => { if (selected) change(layers.map(l => l.id === selected.id ? { ...l, ...patch } : l)); };
  const add = (kind: LayerKind) => { const l = newLayer(kind, kind === 'text' ? textColor : accent); change([...layers,l]); editing.select(l.id); };
  const reorder = (direction: number) => { if (!selected) return; const i = layers.indexOf(selected), j = i+direction; if (j<0 || j>=layers.length) return; const next = [...layers]; [next[i],next[j]] = [next[j],next[i]]; change(next); };
  const range = (label: string, key: 'x'|'y'|'width'|'height'|'rotation'|'opacity'|'fontSize', min: number, max: number, unit = '%') => selected && <label className="marketing-range"><span>{label}: {selected[key]}{unit}</span><input type="range" min={min} max={max} value={selected[key]} disabled={selected.locked} onChange={e => update({ [key]: Number(e.target.value) })}/></label>;
  return <div className="marketing-free-controls">
    <p className="marketing-hint">Añade elementos sobre la plantilla y arrástralos en la vista previa. El nombre, precio y demás datos de la ficha deben quedar visibles.</p>
    <div className="marketing-free-add">{LAYER_KINDS.map(kind => <button type="button" key={kind} disabled={layers.length >= MAX_LAYERS || (kind === 'photo' && !images.length)} onClick={() => add(kind)}>+ {labels[kind]}</button>)}</div>
    <small>{layers.length}/{MAX_LAYERS} elementos · la capa superior se muestra delante.</small>
    <div className="marketing-free-list" aria-label="Capas libres">{[...layers].reverse().map(l => <button type="button" key={l.id} aria-pressed={l.id===editing.selected} onClick={() => editing.select(l.id)}>{labels[l.kind]}{l.kind==='text' && l.text ? ` · ${l.text}` : ''}{l.locked?' · Bloqueado':''}</button>)}</div>
    {selected && <>
      <div className="marketing-free-add">
        <button type="button" onClick={() => update({ locked: !selected.locked })}>{selected.locked?'Desbloquear':'Bloquear'}</button>
        <button type="button" disabled={selected.locked || layers.indexOf(selected)===layers.length-1} onClick={() => reorder(1)}>Subir capa</button>
        <button type="button" disabled={selected.locked || layers.indexOf(selected)===0} onClick={() => reorder(-1)}>Bajar capa</button>
        <button type="button" disabled={selected.locked || layers.length>=MAX_LAYERS} onClick={() => { const next = { ...selected, id: newLayer(selected.kind, selected.color).id, x: Math.min(100-selected.width, selected.x+3), y: Math.min(100-selected.height, selected.y+3) }; change([...layers,next]); editing.select(next.id); }}>Duplicar</button>
        <button type="button" disabled={selected.locked} onClick={() => change(layers.filter(l => l.id!==selected.id))}>Eliminar</button>
      </div>
      {selected.kind==='text' && <><label>Texto editorial<input type="text" value={selected.text} disabled={selected.locked} maxLength={80} onChange={e => update({text:e.target.value})}/></label>{editorialProblem(selected.text) && <p role="alert" className="marketing-editor-warning">{editorialProblem(selected.text)}</p>}{range('Tamaño de letra', 'fontSize',1,12,'') }<label><input type="checkbox" checked={selected.bold} disabled={selected.locked} onChange={e => update({bold:e.target.checked})}/> Negrita</label></>}
      {selected.kind==='photo' ? <label>Fotografía<select value={selected.imageIndex} disabled={selected.locked} onChange={e=>update({imageIndex:Number(e.target.value)})}>{images.map((_,i)=><option key={i} value={i}>Imagen {i+1}</option>)}</select></label> : <label className="marketing-color">Color<input type="color" value={selected.color} disabled={selected.locked} onChange={e=>update({color:e.target.value})}/></label>}
      {range('Posición horizontal','x',0,100-selected.width)}{range('Posición vertical','y',0,100-selected.height)}
      {range('Ancho','width',4,100-selected.x)}{range('Alto','height',2,100-selected.y)}{range('Giro','rotation',-180,180,'°')}{range('Opacidad','opacity',10,100)}
    </>}
  </div>;
}
