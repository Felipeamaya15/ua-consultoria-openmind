import { DEFAULT_IMAGE_SETTING } from '../../storefront/visual/imageSettings';
import { FriendlySizeControl, NumberControl, SegmentedControl } from './controls';
import { useState } from 'react';
import type { EditorDocument } from './model';

export function LegacyImageInspector({ selected, document, onChange }: { selected: { key: string; src: string; legacyKey?: string }; document: EditorDocument; onChange: (update: (current: EditorDocument) => EditorDocument) => void }) {
  const [error, setError] = useState('');
  const image = document.images[selected.key] ?? (selected.legacyKey ? document.images[selected.legacyKey] : undefined) ?? { ...DEFAULT_IMAGE_SETTING, src: selected.src };
  const edit = (patch: Partial<typeof image>) => onChange(current => { const images = {...current.images, [selected.key]: {...(current.images[selected.key] ?? image), ...patch}}; if (selected.legacyKey) delete images[selected.legacyKey]; return {...current, images}; });
  return <div className="ve-inspector">
    <img className="ve-image-thumbnail" src={image.src || selected.src} alt="Imagen seleccionada" />
    <label className="ve-upload-label">Cambiar imagen<input aria-label="Cambiar imagen" type="file" accept="image/*" onChange={e => {
      const file = e.target.files?.[0]; if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 3 * 1024 * 1024) { setError('Elige una imagen de hasta 3 MB.'); return; }
      setError(''); const reader = new FileReader(); reader.onerror = () => setError('No pudimos leer la imagen. Intenta nuevamente.'); reader.onload = () => { if (typeof reader.result === 'string') edit({ src: reader.result }); }; reader.readAsDataURL(file);
    }} /></label>
    {error && <p role="alert">{error}</p>}
    <SegmentedControl label="Ajuste" value={image.fit ?? 'cover'} options={['cover','contain']} onChange={value => edit({fit:value === 'contain' ? 'contain' : 'cover'})} onReset={() => edit({fit:undefined})}/>
    <FriendlySizeControl label="Tamaño de imagen (%)" path="image.scale" value={image.scale} min={1} max={400} onChange={value => edit({scale:Number(value)})} onReset={() => edit({scale:100})}/>
    <SegmentedControl label="Posición" value={image.x === 0 ? 'left' : image.x === 100 ? 'right' : 'center'} options={['left','center','right']} onChange={value => edit({x:value === 'left' ? 0 : value === 'right' ? 100 : 50})} onReset={() => edit({x:50})}/>
    <details><summary>Opciones avanzadas</summary>
    <label>Enlace de la imagen<input aria-label="URL de imagen" type="url" value={image.src} onChange={e => edit({ src: e.target.value })} /></label>
    {(['x', 'y', 'scale', 'radius'] as const).map(key => <NumberControl key={key} label={{ x: 'Posición horizontal', y: 'Posición vertical', scale: 'Tamaño de imagen (%)', radius: 'Bordes redondeados' }[key]} value={image[key]} max={key === 'scale' ? 400 : key === 'radius' ? 300 : 100} onChange={value => edit({ [key]: value })} onReset={() => edit({ [key]: DEFAULT_IMAGE_SETTING[key] })} />)}
    </details>
    <button type="button" onClick={() => onChange(current => { const images = { ...current.images }; delete images[selected.key]; if (selected.legacyKey) delete images[selected.legacyKey]; return { ...current, images }; })}>Restaurar imagen original</button>
  </div>;
}
