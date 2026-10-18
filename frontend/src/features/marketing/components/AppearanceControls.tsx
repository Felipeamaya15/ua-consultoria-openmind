import { Input, Select } from '../../admin/components/ui';
import { defaultAppearance, type Appearance } from '../domain/editor';

/** Mismo contrato y controles para las tres composiciones; sin editar datos de catálogo. */
export function AppearanceControls({ value, onChange, group, hasImage, hasLogo }: {
  value: Appearance; onChange: (next: Appearance) => void; group: 'image' | 'composition'; hasImage: boolean; hasLogo: boolean;
}) {
  const change = (patch: Partial<Appearance>) => onChange({ ...value, ...patch });
  const number = (key: keyof Appearance, label: string, max: number, min = 0) => <Input key={key} type="number" label={label}
    placeholder="Original" min={min} max={max} step="1" value={value[key] == null ? '' : String(value[key])} onChange={e => {
      if (!e.target.value) change({ [key]: null });
      else if (Number.isFinite(e.target.valueAsNumber) && e.target.valueAsNumber >= min && e.target.valueAsNumber <= max) change({ [key]: e.target.valueAsNumber,
        ...(key === 'borderWidth' && (value.borderStyle === 'original' || value.borderStyle === 'none') ? { borderStyle: 'solid' } : {}) });
    }} />;
  const toggle = (key: 'showButton' | 'buttonFullWidth', label: string) => <label className="marketing-editor-toggle"><input type="checkbox" checked={value[key]} onChange={e => change({ [key]: e.target.checked })} /><span>{label}</span></label>;
  return <>
    <p className="marketing-hint">Medidas proporcionales al ancho de la publicación. Un campo vacío conserva el diseño original.</p>
    {group === 'image' ? <>
      {hasLogo && number('logoSize', 'Tamaño del logo (%)', 15, 2)}
      {hasImage && <>{number('imageX', 'Posición horizontal de imagen (%)', 100)}{number('imageY', 'Posición vertical de imagen (%)', 100)}
        {number('imageRadius', 'Bordes de imagen (%)', 20)}{number('imagePadding', 'Espacio interior de imagen (%)', 10)}</>}
    </> : <>
      {number('radius', 'Bordes de la pieza (%)', 12)}
      <Select label="Estilo del borde" value={value.borderStyle} options={[{ value: 'original', label: 'Original de la plantilla' }, { value: 'none', label: 'Sin borde' }, { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Discontinuo' }]} onChange={e => change({ borderStyle: e.target.value as Appearance['borderStyle'] })} />
      {number('borderWidth', 'Grosor del borde (px)', 8)}
      <label className="marketing-color"><span>Color del borde</span><input type="color" value={value.borderColor || '#172b3a'} onChange={e => change({ borderColor: e.target.value, borderStyle: value.borderStyle === 'original' || value.borderStyle === 'none' ? 'solid' : value.borderStyle })} /></label>
      <Select label="Sombra de la pieza" value={value.shadow} options={[{ value: 'original', label: 'Original de la plantilla' }, { value: 'none', label: 'Sin sombra' }, { value: 'soft', label: 'Suave' }, { value: 'medium', label: 'Media' }, { value: 'strong', label: 'Marcada' }]} onChange={e => change({ shadow: e.target.value as Appearance['shadow'] })} />
      {number('padding', 'Espacio interior de la pieza (%)', 10)}{number('gap', 'Separación entre elementos (%)', 8)}
      {number('copyPadding', 'Espacio interior de la ficha (%)', 6)}
      {hasImage && number('mediaShare', 'Espacio para imagen (%)', 70, 25)}
      {toggle('showButton', 'Mostrar llamada a la acción')}
      {toggle('buttonFullWidth', 'Llamada a la acción a todo el ancho')}
      <Select label="Estilo de llamada a la acción" value={value.buttonStyle} options={[{ value: 'solid', label: 'Relleno' }, { value: 'outline', label: 'Con borde' }, { value: 'ghost', label: 'Solo texto' }]} onChange={e => change({ buttonStyle: e.target.value as Appearance['buttonStyle'] })} />
      {number('buttonRadius', 'Bordes de llamada a la acción (%)', 12)}
      {number('buttonPaddingX', 'Espacio lateral de llamada a la acción (%)', 8)}
      {number('buttonPaddingY', 'Espacio vertical de llamada a la acción (%)', 5)}
    </>}
    <button type="button" className="marketing-text-link" onClick={() => {
      const defaults = defaultAppearance();
      const keys: (keyof Appearance)[] = group === 'image' ? ['logoSize', 'imageX', 'imageY', 'imageRadius', 'imagePadding']
        : ['radius', 'borderStyle', 'borderWidth', 'borderColor', 'shadow', 'padding', 'gap', 'copyPadding', 'mediaShare', 'showButton', 'buttonFullWidth', 'buttonStyle', 'buttonRadius', 'buttonPaddingX', 'buttonPaddingY'];
      onChange({ ...value, ...Object.fromEntries(keys.map(key => [key, defaults[key]])) });
    }}>Restaurar {group === 'image' ? 'medidas de imagen' : 'apariencia original'}</button>
  </>;
}
