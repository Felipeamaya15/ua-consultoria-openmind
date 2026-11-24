import { PaletteLibrary } from '../../../shared/PaletteLibrary';
import { resolveVisualConfig } from '../../storefront/visual/resolveVisualConfig';
import type { PaletteColors } from '../../../shared/palettes';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button, Input, Select } from '../../admin/components/ui';
import { ART_DIRECTIONS, CAMPAIGN_LAYOUTS, FONT_FAMILIES, TEMPLATES, TEXT_LIMITS, defaultDesign, designPalette, editorialProblem, safeTextColor, type DesignState, type TextBlock, type EditorialBlock } from '../domain/editor';
import { AppearanceControls } from './AppearanceControls';
import type { StoreBrand } from '../domain/types';

interface Props { activity?: boolean; freeLayers?: ReactNode; paletteColors?:PaletteColors; value: DesignState; brand: StoreBrand; images: readonly string[]; hasDescription: boolean; onChange: (value: DesignState) => void; onReset: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean }
const sections = ['Diseños profesionales', 'Plantilla', 'Estilo gráfico', 'Textos', 'Colores', 'Imagen y logo', 'Composición', 'Elementos libres'] as const;
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="marketing-editor-toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>;
}
export function DesignControls({ activity, freeLayers, value: d, brand, paletteColors, images, hasDescription, onChange, onReset, onUndo, onRedo, canUndo, canRedo }: Props) {
  const [section, setSection] = useState<typeof sections[number]>('Diseños profesionales');
  const classic = !d.campaignLayout || d.campaignLayout === 'classic';
  const visibleSections = sections.filter(name => (name === 'Plantilla' || name === 'Estilo gráfico') ? classic : true);
  const activeSection = visibleSections.includes(section) ? section : 'Diseños profesionales';
  const [block, setBlock] = useState<TextBlock>('heading');
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => setConfirmReset(false), [d.template]);
  const id = useId();
  const change = (patch: Partial<DesignState>) => onChange({ ...d, ...patch });
  const textStyle = d.textStyles[block];
  const styleChange = (patch: Partial<typeof textStyle>) => change({ textStyles: { ...d.textStyles, [block]: { ...textStyle, ...patch } } });
  const palette = designPalette(brand.palette, d, paletteColors);
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
      {visibleSections.map(name => <button type="button" key={name} aria-pressed={name === activeSection} aria-controls={id} onClick={() => setSection(name)}>{name}</button>)}
    </div>
    <section id={id} aria-label={`Ajustes de ${activeSection}`} className="marketing-editor-fields">
      {activeSection === 'Diseños profesionales' && (<>
        <fieldset className="marketing-style-grid marketing-campaign-picker"><legend>Elige una composición</legend>
          {CAMPAIGN_LAYOUTS.map(mode => <button key={mode.id} type="button" className="marketing-style-choice" aria-pressed={(d.campaignLayout || 'classic') === mode.id} onClick={() => change({ campaignLayout: mode.id, ...(mode.id === 'immersive' || mode.id === 'premium' ? { fit: 'cover' as const } : {}), ...(mode.id === 'commercial' || mode.id === 'artisan' ? { mediaSide: 'end' as const } : mode.id === 'premium' ? { mediaSide: 'start' as const } : {}) })}>
            <span className="marketing-campaign-mini" data-campaign={mode.id} aria-hidden="true"><i/><b/><em/><small/></span><strong>{mode.label}</strong><small>{mode.detail}</small>
          </button>)}
        </fieldset>
        {(d.campaignLayout || 'classic') === 'immersive' && <>
          {color('Color del degradado', d.campaignShade || '#211824', campaignShade => change({ campaignShade }))}
          {range('Intensidad detrás del texto', d.campaignShadeStrength ?? 92, 80, 100, campaignShadeStrength => change({ campaignShadeStrength }))}
          <Button type="button" variant="outline" onClick={() => change({ campaignShade: null, campaignShadeStrength: 92 })}>Restaurar degradado</Button>
        </>}
        {d.campaignLayout === 'blank' && <p className="marketing-hint">Añade fotos, textos o figuras desde Elementos libres. La marca y los datos del catálogo permanecen visibles.</p>}
        <p className="marketing-hint">{activity && !classic && "Las fechas, horarios y otros datos de la actividad se conservan. Puedes ocultar solo la descripción narrativa. "}Los diseños profesionales cambian la distribución, no los datos del catálogo. Usa Clásico para recuperar la cuadrícula original; los ajustes y las capas se conservan.</p>
      </>)}
      {activeSection === 'Plantilla' && <fieldset className="marketing-templates"><legend>Diseños disponibles</legend>{TEMPLATES.map(template => <label key={template.id} className={`marketing-template ${d.template === template.id ? 'is-selected' : ''}`}>
        <input type="radio" name={`${id}-template`} checked={d.template === template.id} onChange={() => change({ template: template.id })} />
        <span className={`marketing-template-mini is-${template.id}`} aria-hidden="true"><i /><b /><em /></span><span><strong>{template.name}</strong><small>{template.detail}</small></span>
      </label>)}<p className="marketing-hint">Cada plantilla conserva sus propios textos, colores, composición publicitaria y deshacer/rehacer durante esta sesión. Cambiar de producto inicia diseños nuevos.</p></fieldset>}
      {activeSection === 'Estilo gráfico' && <>
        <fieldset className="marketing-style-grid"><legend>Dirección artística</legend>
          {ART_DIRECTIONS.map(style => <button key={style.id} type="button" className="marketing-style-choice" aria-pressed={(d.artDirection || 'original') === style.id} onClick={() => change({ artDirection: style.id })}>
            <span className="marketing-style-swatch" data-art-direction={style.id} aria-hidden="true"><i/><b/><em/></span>
            <strong>{style.label}</strong><small>{style.detail}</small>
          </button>)}
        </fieldset>
        <p className="marketing-hint">Estos estilos pertenecen al diseño clásico. En un diseño profesional, la composición ya define su propio estilo.</p>
      </>}
      {activeSection === 'Elementos libres' && freeLayers}
      {activeSection === 'Textos' && <>
        {!activity && <label className="marketing-option"><input type="checkbox" checked={d.showVariant !== false} onChange={e => change({ showVariant: e.target.checked })} /> Mostrar variante (color, tamaño o atributo) en la publicación</label>}
        <p className="marketing-hint">El nombre real del producto siempre aparece. El encabezado es un título editorial adicional; evita afirmaciones comerciales.</p>
        <Select label="Bloque de texto" value={block} onChange={e => setBlock(e.target.value as TextBlock)} options={[{ value: 'heading', label: 'Encabezado adicional' }, { value: 'subtitle', label: 'Subtítulo' }, { value: 'cta', label: 'Llamada a la acción' }, { value: 'title', label: 'Nombre del producto' }, { value: 'price', label: 'Precio del producto' }, { value: 'variant', label: 'Variante del producto' }, { value: 'brand', label: 'Nombre de la tienda' }, { value: 'description', label: 'Descripción del producto' }]} />
        {editorial ? <><Input label={block === 'heading' ? 'Encabezado adicional (opcional)' : block === 'subtitle' ? 'Texto del subtítulo' : 'Texto de llamada a la acción'} value={d[editorial]} maxLength={TEXT_LIMITS[editorial]} onChange={e => change({ [editorial]: e.target.value })} />
        <p className="marketing-hint">{d[editorial].length}/{TEXT_LIMITS[editorial]} caracteres. {block === 'cta' && 'Si lo dejas vacío se usa la llamada predeterminada.'}</p>
        {editorialProblem(d[editorial]) && <p role="alert" className="marketing-editor-warning">{editorialProblem(d[editorial])} Este texto no se mostrará en la pieza.</p>}</> : <p className="marketing-hint">Puedes cambiar la apariencia de este bloque. Su contenido procede de tu tienda y catálogo; no se edita aquí.</p>}
        {block === 'subtitle' && <Toggle label="Mostrar subtítulo" checked={d.showSubtitle} onChange={showSubtitle => change({ showSubtitle })} />}
        {block === 'description' && (hasDescription ? <Toggle label={activity ? "Mostrar descripción de la actividad" : "Mostrar descripción del producto"} checked={d.showDescription} onChange={showDescription => change({ showDescription })} /> : <p role="status" className="marketing-hint">Este producto no tiene descripción en el catálogo.</p>)}
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
      {activeSection === 'Colores' && <>
        {d.campaignLayout !== 'immersive' && <Select label="Acabado del fondo" value={d.backgroundEffect || 'plain'} onChange={e => change({ backgroundEffect: e.target.value as DesignState['backgroundEffect'] })} options={[{value:'plain',label:'Original del diseño'}, {value:'gradient',label:'Degradado suave'}, {value:'glow',label:'Luz radial'}, {value:'pattern',label:'Trama sutil'}]} />}
        {d.campaignLayout === 'immersive' && <p className="marketing-hint">La fotografía cubre el fondo. Ajusta su degradado en Diseños profesionales.</p>}
        <div className="marketing-editor-actions"><Button type="button" size="sm" variant="outline" onClick={() => change({ paletteId:null, colors: defaultDesign().colors,
          appearance: { ...d.appearance, borderColor: null, copyBackground: null, copyBorderColor: null, buttonBackground: null, buttonBorderColor: null },
          textStyles: Object.fromEntries(Object.entries(d.textStyles).map(([key, v]) => [key, { ...v, color: null }])) as DesignState['textStyles'] })}>Colores de mi tienda</Button>
          <PaletteLibrary manage={false} selectedId={d.paletteId} colors={paletteColors??resolveVisualConfig().global.colors} onApply={item=>change({paletteId:item.id,colors:defaultDesign().colors})} onOriginal={()=>change({paletteId:null,colors:defaultDesign().colors})}/>

        </div>
        {(['background', 'text', 'accent', 'label'] as const).map((key, i) => <div key={key}>{color(['Fondo de la pieza', 'Texto principal', 'Acento e imagen', 'Etiqueta y botón'][i], d.colors[key] || ({ background: palette.background, text: palette.text, accent: palette.accent, label: palette.label })[key], v => change({ paletteId:null, colors: { ...d.colors, [key]: v } }))}</div>)}
        <p className="marketing-hint">El precio, la etiqueta y el botón mantienen contraste AA. Los cambios solo afectan esta publicación.</p>
        {d.colors.text && safeTextColor(d.colors.text, palette.background) !== d.colors.text && <p role="status" className="marketing-editor-warning">El color solicitado no tiene contraste suficiente: se aplica texto legible.</p>}
      </>}
      {activeSection === 'Imagen y logo' && <>
        <Toggle label="Mostrar logo de la tienda" checked={d.showLogo} onChange={showLogo => change({ showLogo })} />
        {!brand.logo && <p className="marketing-hint">Tu tienda no tiene logo disponible. Su nombre permanece visible.</p>}
        {images.length ? <>
          {images.length > 1 && <Select label="Composición de fotografías" value={d.galleryMode || 'auto'} onChange={e => change({ galleryMode: e.target.value as DesignState['galleryMode'] })} options={[{value:'auto',label:'Original de la publicación'}, {value:'single',label:'Una fotografía'}, {value:'collage',label:'Collage de hasta tres fotografías'}]} />}
          <Select label="Imagen real del producto" value={String(Math.min(d.imageIndex, images.length - 1))} options={images.map((_, i) => ({ value: String(i), label: i ? `Imagen ${i + 1}` : 'Imagen principal' }))} onChange={e => change({ imageIndex: Number(e.target.value) })} />
          <Select label="Encuadre de imagen" value={d.fit} options={[{ value: 'contain', label: 'Completa · sin recortar' }, { value: 'cover', label: 'Llenar · puede recortar bordes' }]} onChange={e => change({ fit: e.target.value as DesignState['fit'] })} />
          <Select label="Posición de imagen" value={d.appearance.imageY === null ? d.position : 'custom'} options={[...(d.appearance.imageY === null ? [] : [{ value: 'custom', label: 'Personalizada en las medidas inferiores' }]), { value: 'top', label: 'Arriba' }, { value: 'center', label: 'Centro' }, { value: 'bottom', label: 'Abajo' }]} onChange={e => { if (e.target.value !== 'custom') change({ position: e.target.value as DesignState['position'], appearance: { ...d.appearance, imageY: null } }); }} />
          {range('Zoom de imagen', d.zoom, 1, 400, zoom => change({ zoom }))}
          <p className="marketing-hint">Zoom y llenar pueden recortar bordes; nunca deforman la foto. Solo se usan imágenes existentes del producto. No se suben archivos.</p>
        </> : <p role="status">No hay imágenes válidas. Se conserva una composición de texto.</p>}
      </>}
      {activeSection === 'Composición' && <>
        <Select label="Espaciado de la pieza" value={d.appearance.padding !== null || d.appearance.gap !== null ? 'custom' : d.spacing} options={[...(d.appearance.padding !== null || d.appearance.gap !== null ? [{ value: 'custom', label: 'Personalizado en las medidas inferiores' }] : []), { value: 'compact', label: 'Compacto' }, { value: 'comfortable', label: 'Amplio' }]} onChange={e => { if (e.target.value !== 'custom') change({ spacing: e.target.value as DesignState['spacing'], appearance: { ...d.appearance, padding: null, gap: null } }); }} />
        <Select label="Alineación de la ficha" value={d.alignment} options={[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }]} onChange={e => change({ alignment: e.target.value as DesignState['alignment'] })} />
        <Select label="Posición de la imagen" value={d.mediaSide} options={[{ value: 'start', label: 'Primero · arriba o izquierda' }, { value: 'end', label: 'Después · abajo o derecha' }]} onChange={e => change({ mediaSide: e.target.value as DesignState['mediaSide'] })} />
        <Toggle label="Mostrar subtítulo" checked={d.showSubtitle} onChange={showSubtitle => change({ showSubtitle })} />
        <p className="marketing-hint">Nombre de tienda, producto y datos comerciales permanecen visibles. Los textos se ajustan para caber; una pieza imposible se bloquea y avisa.</p>
      </>}
      {(activeSection === 'Imagen y logo' || activeSection === 'Composición') && <AppearanceControls value={d.appearance} onChange={appearance => change({ appearance })} group={activeSection === 'Imagen y logo' ? 'image' : 'composition'} hasImage={images.length > 0} hasLogo={!!brand.logo} palette={palette} />}
    </section>
    <div className="marketing-editor-actions"><Button type="button" size="sm" variant="outline" disabled={!canUndo} onClick={onUndo}>Deshacer</Button><Button type="button" size="sm" variant="outline" disabled={!canRedo} onClick={onRedo}>Rehacer</Button><Button type="button" size="sm" variant="outline" disabled={!canUndo && !canRedo} onClick={() => setConfirmReset(true)}>Restablecer diseño</Button></div>
    {confirmReset && <div className="marketing-reset-confirm" role="group" aria-label="Confirmar restablecimiento"><p>Se restablecerán los textos, colores e imagen de esta plantilla. Las otras plantillas, el producto y formato se conservan. Puedes deshacerlo.</p><Button type="button" size="sm" onClick={() => { onReset(); setConfirmReset(false); }}>Confirmar restablecimiento</Button><Button type="button" size="sm" variant="outline" onClick={() => setConfirmReset(false)}>Cancelar</Button></div>}
  </details>;
}
