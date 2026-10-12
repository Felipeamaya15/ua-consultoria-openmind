import { DEFAULT_IMAGE_SETTING } from '../../storefront/visual/imageSettings';
import { NumberControl } from './controls';
import type { EditorDocument } from './model';

export function LegacyImageInspector({ selected, document, onChange }: { selected: { key: string; src: string; legacyKey?: string }; document: EditorDocument; onChange: (update: (current: EditorDocument) => EditorDocument) => void }) {
  const image = document.images[selected.key] ?? (selected.legacyKey ? document.images[selected.legacyKey] : undefined) ?? { ...DEFAULT_IMAGE_SETTING, src: selected.src };
  const edit = (patch: Partial<typeof image>) => onChange(current => { const images = {...current.images, [selected.key]: {...(current.images[selected.key] ?? image), ...patch}}; if (selected.legacyKey) delete images[selected.legacyKey]; return {...current, images}; });
  return <div className="ve-inspector">
    <label>URL de imagen<input aria-label="URL de imagen" type="url" value={image.src} onChange={e => edit({ src: e.target.value })} /></label>
    <label>Subir imagen<input aria-label="Subir imagen" type="file" accept="image/*" onChange={e => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === 'string') edit({ src: reader.result }); }; reader.readAsDataURL(file);
    }} /></label>
    {(['x', 'y', 'scale', 'radius'] as const).map(key => <NumberControl key={key} label={{ x: 'Posición horizontal', y: 'Posición vertical', scale: 'Tamaño de imagen (%)', radius: 'Bordes redondeados' }[key]} value={image[key]} max={key === 'scale' ? 400 : key === 'radius' ? 300 : 100} onChange={value => edit({ [key]: value })} onReset={() => edit({ [key]: DEFAULT_IMAGE_SETTING[key] })} />)}
    <button type="button" onClick={() => onChange(current => { const images = { ...current.images }; delete images[selected.key]; if (selected.legacyKey) delete images[selected.legacyKey]; return { ...current, images }; })}>Restaurar imagen original</button>
  </div>;
}
