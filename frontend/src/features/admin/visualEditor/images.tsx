import { ImageUpload } from '../components/ui/ImageUpload';
import { DEFAULT_IMAGE_SETTING } from '../../storefront/visual/imageSettings';
import { FriendlySizeControl, NumberControl, SegmentedControl } from './controls';
import type { EditorDocument } from './model';

export function LegacyImageInspector({ selected, document, onChange }: { selected: { key: string; src: string; legacyKey?: string }; document: EditorDocument; onChange: (update: (current: EditorDocument) => EditorDocument) => void }) {
  const image = document.images[selected.key] ?? (selected.legacyKey ? document.images[selected.legacyKey] : undefined) ?? { ...DEFAULT_IMAGE_SETTING, src: selected.src };
  const edit = (patch: Partial<typeof image>) => onChange(current => { const images = {...current.images, [selected.key]: {...(current.images[selected.key] ?? image), ...patch}}; if (selected.legacyKey) delete images[selected.legacyKey]; return {...current, images}; });
  return <div className="ve-inspector">
    <img className="ve-image-thumbnail" src={image.src || selected.src} alt="Imagen seleccionada" />
    <ImageUpload label="Cambiar imagen" value={image.src||selected.src} maxMB={3} allowSVG={false} onChange={src=>edit({src})}/>
    <label>Texto alternativo<input aria-label="Texto alternativo de la imagen" type="text" maxLength={250} placeholder="Describe la imagen para lectores de pantalla" value={image.alt ?? ''} onChange={e => edit({ alt: e.target.value })} /></label>
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
