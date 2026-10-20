import { useEffect, useId, useState } from 'react';
import { Button, Input, Select } from '../../admin/components/ui';
import { FONT_FAMILIES, PALETTES, TEMPLATES, TEXT_LIMITS, defaultDesign, designPalette, editorialProblem, safeTextColor, type DesignState, type TextBlock, type EditorialBlock } from '../domain/editor';
import { AppearanceControls } from './AppearanceControls';
import type { StoreBrand } from '../domain/types';

interface Props { value: DesignState; brand: StoreBrand; images: readonly string[]; hasDescription: boolean; onChange: (value: DesignState) => void; onReset: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean }
const sections = ['Plantilla', 'Textos', 'Colores', 'Imagen y logo', 'Composición'] as const;
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="marketing-editor-toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>;
}
export function DesignControls({ value: d, brand, images, hasDescription, onChange, onReset, onUndo, onRedo, canUndo, canRedo }: Props) {
  const [section, setSection] = useState<typeof sections[number]>('Plantilla');
  const [block, setBlock] = useState<TextBlock>('heading');
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => setConfirmReset(false), [d.template]);
  const id = useId();
  const change = (patch: Partial<DesignState>) => onChange({ ...d, ...patch });
  const textStyle = d.textStyles[block];
  const styleChange = (patch: Partial<typeof textStyle>) => change({ textStyles: { ...d.textStyles, [block]: { ...textStyle, ...patch } } });
  const palette = designPalette(brand.palette, d);
  const blockBackground = block === 'brand' ? palette.background : block === 'cta' && d.appearance.buttonStyle === 'solid' ? palette.buttonBackground : palette.copyBackground;
  const blockColor = safeTextColor(textStyle.color || (block === 'cta' && d.appearance.buttonStyle === 'solid' ? null : block === 'brand' ? palette.text : palette.copyText), blockBackground);
  const editorial = block === 'heading' || block === 'subtitle' || block === 'cta' ? block as EditorialBlock : null;
  const fontLabels: Record<string, string> = { sans: 'Arial · sencilla', serif: 'Georgia · editorial', mono: 'Courier · monoespaciada', jakarta: 'Plus Jakarta Sans', display: 'DM Serif Display' };
  const fontOptions = Object.keys(FONT_FAMILIES).map(value => ({ value, label: fontLabels[value] || value[0].toUpperCase() + value.slice(1) }));
  const color = (label: string, current: string, update: (color: string) => void) => <label className="marketing-color"><span>{label}</span><input type="color" value={current} onChange={e => update(e.target.value)} /></label>;
  const range = (label: string, current: number, min: number, max: number, update: (n: number) => void) => <label className="marketing-range"><span>{label} · {current}%</span><input type="range" min={min} max={max} step="1" value={current} onChange={e => update(Number(e.target.value))} /></label>;
  return <details className="marketing-editor" open>
    <summary>Personalizar diseño <span>Vista previa editable</span></summary>
    <p className="marketing-hint">El catálogo conserva el nombre, precio, variante y descuento. Aquí solo cambias esta pieza.</p>
    <div className="marketing-editor-sections" role="group" aria-label="Secciones de personalización">
      {sections.map(name => <button type="button" key={name} aria-pressed={name === section} aria-controls={id} onClick={() => setSection(name)}>{name}</button>)}
    </div>
    <section id={id} aria-label={`Ajustes de ${section}`} className="marketing-editor-fields">
      {section === 'Plantilla' && <fieldset className="marketing-templates"><legend>Diseños disponibles</legend>{TEMPLATES.map(template => <label key={template.id} className={`marketing-template ${d.template === template.id ? 'is-selected' : ''}`}>
        <input type="radio" name={`${id}-template`} checked={d.template === template.id} onChange={() => change({ template: template.id })} />
        <span className={`marketing-template-mini is-${template.id}`} aria-hidden="true"><i /><b /><em /></span><span><strong>{template.name}</strong><small>{template.detail}</small></span>
      </label>)}<p className="marketing-hint">Cada plantilla conserva sus propios textos, colores, ajustes y deshacer/rehacer durante esta sesión. Cambiar de producto inicia diseños nuevos.</p></fieldset>}
      {section === 'Textos' && <>
        <p className="marketing-hint">El nombre real del producto siempre aparece. El encabezado es un título editorial adicional; evita afirmaciones comerciales.</p>
        <Select label="Bloque de texto" value={block} onChange={e => setBlock(e.target.value as TextBlock)} options={[{ value: 'heading', label: 'Encabezado adicional' }, { value: 'subtitle', label: 'Subtítulo' }, { value: 'cta', label: 'Llamada a la acción' }, { value: 'title', label: 'Nombre del producto' }, { value: 'price', label: 'Precio del producto' }, { value: 'variant', label: 'Variante del producto' }, { value: 'brand', label: 'Nombre de la tienda' }, { value: 'description', label: 'Descripción del producto' }]} />
        {editorial ? <><Input label={block === 'heading' ? 'Encabezado adicional (opcional)' : block === 'subtitle' ? 'Texto del subtítulo' : 'Texto de llamada a la acción'} value={d[editorial]} maxLength={TEXT_LIMITS[editorial]} onChange={e => change({ [editorial]: e.target.value })} />
        <p className="marketing-hint">{d[editorial].length}/{TEXT_LIMITS[editorial]} caracteres. {block === 'cta' && 'Si lo dejas vacío se usa la llamada predeterminada.'}</p>
        {editorialProblem(d[editorial]) && <p role="alert" className="marketing-editor-warning">{editorialProblem(d[editorial])} Este texto no se mostrará en la pieza.</p>}</> : <p className="marketing-hint">Puedes cambiar la apariencia de este bloque. Su contenido procede de tu tienda y catálogo; no se edita aquí.</p>}
        {block === 'subtitle' && <Toggle label="Mostrar subtítulo" checked={d.showSubtitle} onChange={showSubtitle => change({ showSubtitle })} />}
        {block === 'description' && (hasDescription ? <Toggle label="Mostrar descripción del producto" checked={d.showDescription} onChange={showDescription => change({ showDescription })} /> : <p role="status" className="marketing-hint">Este producto no tiene descripción en el catálogo.</p>)}
        <Select label="Tipografía de la publicación" value={d.font} onChange={e => change({ font: e.target.value as DesignState['font'] })} options={fontOptions} />
        <Select label="Tipografía de títulos" value={d.headingFont || ''} onChange={e => change({ headingFont: e.target.value as DesignState['headingFont'] || null })} options={[{ value: '', label: 'La misma de la publicación' }, ...fontOptions]} />
        {range('Tamaño del bloque', textStyle.size, 60, 160, size => styleChange({ size }))}
        <Toggle label="Negrita del bloque" checked={textStyle.bold} onChange={bold => styleChange({ bold })} />
        <Toggle label="Cursiva del bloque" checked={textStyle.italic} onChange={italic => styleChange({ italic })} />
        <Select label="Alineación del bloque" value={textStyle.align} onChange={e => styleChange({ align: e.target.value as typeof textStyle.align })} options={[{ value: 'inherit', label: 'La misma de la ficha' }, { value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }]} />
        {color('Color del bloque', textStyle.color || blockColor, color => styleChange({ color }))}
        {textStyle.color && safeTextColor(textStyle.color, blockBackground) !== textStyle.color && <p role="status" className="marketing-editor-warning">Ese color tiene poco contraste. La vista previa aplica un texto legible automáticamente.</p>}
        <button type="button" className="marketing-text-link" onClick={() => change({ textStyles: { ...d.textStyles, [block]: defaultDesign(d.template).textStyles[block] } })}>Restaurar estilo de este bloque</button>
      </>}
      {section === 'Colores' && <>
        <div className="marketing-editor-actions"><Button type="button" size="sm" variant="outline" onClick={() => change({ colors: defaultDesign().colors,
          appearance: { ...d.appearance, borderColor: null, copyBackground: null, copyBorderColor: null, buttonBackground: null, buttonBorderColor: null },
          textStyles: Object.fromEntries(Object.entries(d.textStyles).map(([key, v]) => [key, { ...v, color: null }])) as DesignState['textStyles'] })}>Colores de mi tienda</Button>
          {PALETTES.map(item => <Button type="button" key={item.name} size="sm" variant="outline" onClick={() => change({ colors: { background: item.palette.primary, accent: item.palette.secondary, text: null, label: null } })}>{item.name}</Button>)}
        </div>
        {(['background', 'text', 'accent', 'label'] as const).map((key, i) => <div key={key}>{color(['Fondo de la pieza', 'Texto principal', 'Acento e imagen', 'Etiqueta y botón'][i], d.colors[key] || ({ background: palette.background, text: palette.text, accent: palette.accent, label: palette.label })[key], v => change({ colors: { ...d.colors, [key]: v } }))}</div>)}
        <p className="marketing-hint">El precio, la etiqueta y el botón mantienen contraste AA. Los cambios solo afectan esta publicación.</p>
        {d.colors.text && safeTextColor(d.colors.text, palette.background) !== d.colors.text && <p role="status" className="marketing-editor-warning">El color solicitado no tiene contraste suficiente: se aplica texto legible.</p>}
      </>}
      {section === 'Imagen y logo' && <>
        <Toggle label="Mostrar logo de la tienda" checked={d.showLogo} onChange={showLogo => change({ showLogo })} />
        {!brand.logo && <p className="marketing-hint">Tu tienda no tiene logo disponible. Su nombre permanece visible.</p>}
        {images.length ? <>
          <Select label="Imagen real del producto" value={String(Math.min(d.imageIndex, images.length - 1))} options={images.map((_, i) => ({ value: String(i), label: i ? `Imagen ${i + 1}` : 'Imagen principal' }))} onChange={e => change({ imageIndex: Number(e.target.value) })} />
          <Select label="Encuadre de imagen" value={d.fit} options={[{ value: 'contain', label: 'Completa · sin recortar' }, { value: 'cover', label: 'Llenar · puede recortar bordes' }]} onChange={e => change({ fit: e.target.value as DesignState['fit'] })} />
          <Select label="Posición de imagen" value={d.appearance.imageY === null ? d.position : 'custom'} options={[...(d.appearance.imageY === null ? [] : [{ value: 'custom', label: 'Personalizada en las medidas inferiores' }]), { value: 'top', label: 'Arriba' }, { value: 'center', label: 'Centro' }, { value: 'bottom', label: 'Abajo' }]} onChange={e => { if (e.target.value !== 'custom') change({ position: e.target.value as DesignState['position'], appearance: { ...d.appearance, imageY: null } }); }} />
          {range('Zoom de imagen', d.zoom, 1, 400, zoom => change({ zoom }))}
          <p className="marketing-hint">Zoom y llenar pueden recortar bordes; nunca deforman la foto. Solo se usan imágenes existentes del producto. No se suben archivos.</p>
        </> : <p role="status">No hay imágenes válidas. Se conserva una composición de texto.</p>}
      </>}
      {section === 'Composición' && <>
        <Select label="Espaciado de la pieza" value={d.appearance.padding !== null || d.appearance.gap !== null ? 'custom' : d.spacing} options={[...(d.appearance.padding !== null || d.appearance.gap !== null ? [{ value: 'custom', label: 'Personalizado en las medidas inferiores' }] : []), { value: 'compact', label: 'Compacto' }, { value: 'comfortable', label: 'Amplio' }]} onChange={e => { if (e.target.value !== 'custom') change({ spacing: e.target.value as DesignState['spacing'], appearance: { ...d.appearance, padding: null, gap: null } }); }} />
        <Select label="Alineación de la ficha" value={d.alignment} options={[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }]} onChange={e => change({ alignment: e.target.value as DesignState['alignment'] })} />
        <Select label="Posición de la imagen" value={d.mediaSide} options={[{ value: 'start', label: 'Primero · arriba o izquierda' }, { value: 'end', label: 'Después · abajo o derecha' }]} onChange={e => change({ mediaSide: e.target.value as DesignState['mediaSide'] })} />
        <Toggle label="Mostrar subtítulo" checked={d.showSubtitle} onChange={showSubtitle => change({ showSubtitle })} />
        <p className="marketing-hint">Nombre de tienda, producto y datos comerciales permanecen visibles. Los textos se ajustan para caber; una pieza imposible se bloquea y avisa.</p>
      </>}
      {(section === 'Imagen y logo' || section === 'Composición') && <AppearanceControls value={d.appearance} onChange={appearance => change({ appearance })} group={section === 'Imagen y logo' ? 'image' : 'composition'} hasImage={images.length > 0} hasLogo={!!brand.logo} palette={palette} />}
    </section>
    <div className="marketing-editor-actions"><Button type="button" size="sm" variant="outline" disabled={!canUndo} onClick={onUndo}>Deshacer</Button><Button type="button" size="sm" variant="outline" disabled={!canRedo} onClick={onRedo}>Rehacer</Button><Button type="button" size="sm" variant="outline" disabled={!canUndo && !canRedo} onClick={() => setConfirmReset(true)}>Restablecer diseño</Button></div>
    {confirmReset && <div className="marketing-reset-confirm" role="group" aria-label="Confirmar restablecimiento"><p>Se restablecerán los textos, colores e imagen de esta plantilla. Las otras plantillas, el producto y formato se conservan. Puedes deshacerlo.</p><Button type="button" size="sm" onClick={() => { onReset(); setConfirmReset(false); }}>Confirmar restablecimiento</Button><Button type="button" size="sm" variant="outline" onClick={() => setConfirmReset(false)}>Cancelar</Button></div>}
  </details>;
}
