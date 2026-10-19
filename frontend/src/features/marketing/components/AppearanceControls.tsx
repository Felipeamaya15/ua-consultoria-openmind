import { Input, Select } from '../../admin/components/ui';
import { defaultAppearance, type Appearance } from '../domain/editor';

/** Mismo contrato y controles para las tres composiciones; sin editar datos de catálogo. */
export function AppearanceControls({ value, onChange, group, hasImage, hasLogo, palette }: {
  value: Appearance; onChange: (next: Appearance) => void; group: 'image' | 'composition'; hasImage: boolean; hasLogo: boolean;
  palette: { copyBackground: string; copyText: string; buttonBackground: string };
}) {
  const change = (patch: Partial<Appearance>) => onChange({ ...value, ...patch });
  const number = (key: keyof Appearance, label: string, max: number, min = 0) => <Input key={key} type="number" label={label}
    placeholder="Original" min={min} max={max} step="1" value={value[key] == null ? '' : String(value[key])} onChange={e => {
      if (!e.target.value) change({ [key]: null });
      else if (Number.isFinite(e.target.valueAsNumber) && e.target.valueAsNumber >= min && e.target.valueAsNumber <= max) change({ [key]: e.target.valueAsNumber,
        ...(key === 'borderWidth' && (value.borderStyle === 'original' || value.borderStyle === 'none') ? { borderStyle: 'solid' } : {}),
        ...(key === 'copyBorderWidth' && (value.copyBorderStyle === 'original' || value.copyBorderStyle === 'none') ? { copyBorderStyle: 'solid' } : {}),
        ...(key === 'buttonWidth' ? { buttonFullWidth: false } : {}),
        ...(key === 'buttonRadius' ? { buttonShape: 'original' } : {}) });
    }} />;
  const toggle = (key: 'showButton' | 'buttonFullWidth', label: string) => <label className="marketing-editor-toggle"><input type="checkbox" checked={value[key]} onChange={e => change({ [key]: e.target.checked })} /><span>{label}</span></label>;
  const borderOptions = [{ value: 'original', label: 'Original de la plantilla' }, { value: 'none', label: 'Sin borde' }, { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Discontinuo' }];
  const shadowOptions = [{ value: 'original', label: 'Original de la plantilla' }, { value: 'none', label: 'Sin sombra' }, { value: 'soft', label: 'Suave' }, { value: 'medium', label: 'Media' }, { value: 'strong', label: 'Marcada' }];
  const color = (key: 'copyBackground' | 'copyBorderColor' | 'buttonBackground' | 'buttonBorderColor', label: string) => <label className="marketing-color"><span>{label}</span><input type="color" value={value[key] || (key === 'copyBackground' ? palette.copyBackground : key === 'buttonBackground' ? palette.buttonBackground : palette.copyText)} onChange={e => change({ [key]: e.target.value,
    ...(key === 'copyBorderColor' && (value.copyBorderStyle === 'original' || value.copyBorderStyle === 'none') ? { copyBorderStyle: 'solid' } : {}) })} /></label>;
  return <>
    <p className="marketing-hint">Medidas proporcionales al ancho de la publicación. Un campo vacío conserva el diseño original.</p>
    {group === 'image' ? <>
      {hasLogo && number('logoSize', 'Tamaño del logo (%)', 15, 2)}
      {hasImage && <>{number('imageX', 'Posición horizontal de imagen (%)', 100)}{number('imageY', 'Posición vertical de imagen (%)', 100)}
        {number('imageRadius', 'Bordes de imagen (%)', 20)}{number('imagePadding', 'Espacio interior de imagen (%)', 10)}</>}
    </> : <>
      {number('radius', 'Bordes de la pieza (%)', 12)}
      <Select label="Estilo del borde" value={value.borderStyle} options={borderOptions} onChange={e => change({ borderStyle: e.target.value as Appearance['borderStyle'] })} />
      {number('borderWidth', 'Grosor del borde (px)', 8)}
      <label className="marketing-color"><span>Color del borde</span><input type="color" value={value.borderColor || '#172b3a'} onChange={e => change({ borderColor: e.target.value, borderStyle: value.borderStyle === 'original' || value.borderStyle === 'none' ? 'solid' : value.borderStyle })} /></label>
      <Select label="Sombra de la pieza" value={value.shadow} options={shadowOptions} onChange={e => change({ shadow: e.target.value as Appearance['shadow'] })} />
      {number('padding', 'Espacio interior de la pieza (%)', 10)}{number('gap', 'Separación entre elementos (%)', 8)}
      {number('copyPadding', 'Espacio interior de la ficha (%)', 6)}
      {color('copyBackground', 'Fondo de la ficha')}
      {number('copyRadius', 'Bordes de la ficha (%)', 12)}
      <Select label="Estilo del borde de la ficha" value={value.copyBorderStyle} options={borderOptions} onChange={e => change({ copyBorderStyle: e.target.value as Appearance['copyBorderStyle'] })} />
      {number('copyBorderWidth', 'Grosor del borde de la ficha (px)', 8)}
      {color('copyBorderColor', 'Color del borde de la ficha')}
      <Select label="Sombra de la ficha" value={value.copyShadow} options={shadowOptions} onChange={e => change({ copyShadow: e.target.value as Appearance['copyShadow'] })} />
      {hasImage && number('mediaShare', 'Espacio para imagen (%)', 70, 25)}
      {toggle('showButton', 'Mostrar llamada a la acción')}
      {toggle('buttonFullWidth', 'Llamada a la acción a todo el ancho')}
      {number('buttonWidth', 'Ancho personalizado de llamada a la acción (%)', 100, 20)}
      <Select label="Posición de llamada a la acción" value={value.buttonAlign} options={[{ value: 'inherit', label: 'La misma de la ficha' }, { value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }]} onChange={e => change({ buttonAlign: e.target.value as Appearance['buttonAlign'] })} />
      <Select label="Estilo de llamada a la acción" value={value.buttonStyle} options={[{ value: 'solid', label: 'Relleno' }, { value: 'outline', label: 'Con borde' }, { value: 'ghost', label: 'Solo texto' }]} onChange={e => change({ buttonStyle: e.target.value as Appearance['buttonStyle'] })} />
      {number('buttonRadius', 'Bordes de llamada a la acción (%)', 12)}
      <Select label="Forma de llamada a la acción" value={value.buttonShape} options={[{ value: 'original', label: 'Original o radio personalizado' }, { value: 'square', label: 'Recta' }, { value: 'rounded', label: 'Redondeada' }, { value: 'pill', label: 'Cápsula' }]} onChange={e => change({ buttonShape: e.target.value as Appearance['buttonShape'] })} />
      {color('buttonBackground', 'Fondo de llamada a la acción')}
      {value.buttonStyle === 'outline' && <>
        <Select label="Borde de llamada a la acción" value={value.buttonBorderStyle} options={borderOptions.filter(option => ['solid', 'dashed'].includes(option.value))} onChange={e => change({ buttonBorderStyle: e.target.value as Appearance['buttonBorderStyle'] })} />
        {number('buttonBorderWidth', 'Grosor del borde de llamada a la acción (px)', 8)}
        {color('buttonBorderColor', 'Color del borde de llamada a la acción')}
        <p className="marketing-hint">El borde mantiene contraste con la ficha. El fondo se aplica en el estilo Relleno.</p>
      </>}
      {number('buttonPaddingX', 'Espacio lateral de llamada a la acción (%)', 8)}
      {number('buttonPaddingY', 'Espacio vertical de llamada a la acción (%)', 5)}
    </>}
    <button type="button" className="marketing-text-link" onClick={() => {
      const defaults = defaultAppearance();
      const keys: (keyof Appearance)[] = group === 'image' ? ['logoSize', 'imageX', 'imageY', 'imageRadius', 'imagePadding']
        : ['radius', 'borderStyle', 'borderWidth', 'borderColor', 'shadow', 'padding', 'gap', 'copyPadding', 'mediaShare', 'showButton', 'buttonFullWidth', 'buttonStyle', 'buttonRadius', 'buttonPaddingX', 'buttonPaddingY',
          'copyBackground', 'copyRadius', 'copyBorderStyle', 'copyBorderWidth', 'copyBorderColor', 'copyShadow',
          'buttonBackground', 'buttonAlign', 'buttonShape', 'buttonWidth', 'buttonBorderStyle', 'buttonBorderWidth', 'buttonBorderColor'];
      onChange({ ...value, ...Object.fromEntries(keys.map(key => [key, defaults[key]])) });
    }}>Restaurar {group === 'image' ? 'medidas de imagen' : 'apariencia original'}</button>
  </>;
}
