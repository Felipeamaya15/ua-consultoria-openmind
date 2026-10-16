import { fonts } from '../../storefront/visual/cssVariables';
import type { FontFamily } from '../../storefront/visual/types';
import { useEffect, useState, type ReactNode } from 'react';
const OPTION_LABELS: Record<string, string> = { cover: 'Rellenar', contain: 'Contener', small: 'Pequeño', large: 'Grande', left: 'Izquierda', center: 'Centro', right: 'Derecha', top: 'Arriba', bottom: 'Abajo', desktop: 'Computadora', tablet: 'Tablet', mobile: 'Móvil', compact: 'Compacto', normal: 'Normal', spacious: 'Amplio', square: 'Recto', rounded: 'Redondeado', pill: 'Cápsula', auto: 'Automático', full: 'Todo el ancho', custom: 'Personalizado', solid: 'Relleno', outline: 'Con borde', ghost: 'Solo texto', none: 'Sin efecto', dashed: 'Discontinuo', soft: 'Suave', medium: 'Media', strong: 'Marcada', grid: 'En columnas', row: 'En fila', wrap: 'En varias filas', stack: 'Uno debajo de otro', split: 'En dos zonas', inline: 'En línea', centered: 'Centrado', columns: 'En columnas', below: 'Debajo del texto', pills: 'Cápsulas', cards: 'Cajas', links: 'Enlaces', drawer: 'Panel desplegable', sans: 'Plus Jakarta Sans', serif: 'DM Serif Display', system: 'Fuente del sistema' };
Object.assign(OPTION_LABELS, { arial: 'Arial', calibri: 'Calibri', cambria: 'Cambria', georgia: 'Georgia', times: 'Times New Roman', verdana: 'Verdana', tahoma: 'Tahoma', trebuchet: 'Trebuchet MS', courier: 'Courier New', garamond: 'Garamond', palatino: 'Palatino', comic: 'Comic Sans MS' });
export function optionLabel(value: string, label = '') { return value === 'solid' && label.includes('Borde') ? 'Continuo' : OPTION_LABELS[value] ?? value; }
export interface ControlProps {
  path?: string;
  label: string; value: string | number | boolean; onChange: (value: string | number | boolean) => void;
  onReset: () => void; overridden?: boolean; min?: number; max?: number; step?: number; options?: readonly string[]; disabled?: boolean;
}
function Field({ label, onReset, overridden, disabled, children }: ControlProps & { children: ReactNode }) {
  return <div className="ve-control"><div className="ve-control-label"><span>{label}</span><button type="button" disabled={disabled} onClick={onReset} aria-label={`Restablecer ${label}`} title="Volver al valor del diseño original">↺</button></div>{children}<small>{overridden ? 'Personalizado' : 'Del diseño original'}</small></div>;
}
export function ColorPickerControl(props: ControlProps) {
  const value = String(props.value); const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <Field {...props}><div className="ve-color"><input aria-label={props.label} disabled={props.disabled} type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#000000'} onChange={e => props.onChange(e.target.value)} /><input aria-label={`${props.label} hexadecimal`} disabled={props.disabled} type="text" value={text} onChange={e => { setText(e.target.value); if (/^(#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|transparent|currentColor)$/i.test(e.target.value)) props.onChange(e.target.value); }} onBlur={() => setText(value)} /></div></Field>;
}
export function SelectControl(props: ControlProps) {
  const font = props.options?.includes('calibri');
  return <Field {...props}><select style={font ? { fontFamily: fonts[props.value as FontFamily] } : undefined} disabled={props.disabled} aria-label={props.label} value={String(props.value)} onChange={e => props.onChange(e.target.value)}>{props.options?.map(value => <option key={value} value={value} style={font ? { fontFamily: fonts[value as FontFamily] } : undefined}>{optionLabel(value, props.label)}</option>)}</select>{font && <p style={{fontFamily: fonts[props.value as FontFamily], fontSize: 20}}>Aa · Tu tienda, tu estilo 123</p>}</Field>;
}
export function NumberControl(props: ControlProps) {
  return <Field {...props}><input disabled={props.disabled} aria-label={props.label} type="number" value={Number(props.value)} min={props.min ?? 0} max={props.max ?? 10000} step={props.step ?? 1} onChange={e => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= (props.min ?? 0) && value <= (props.max ?? 10000)) props.onChange(value); }} /></Field>;
}
/** Keep exact values available while offering a useful first choice. */
export function FriendlySizeControl(props: ControlProps) {
  const [custom, setCustom] = useState(false);
  const range = props.path === 'image.scale' ? [80,100,140] : props.path === 'hero.titleSize' ? [40,64,88] : /\.logoSize/.test(props.path ?? '') ? [32,64,96] : /imageSize/.test(props.path ?? '') ? [160,320,480] : /\.height$/.test(props.path ?? '') ? [48,72,96] : /^pages\..*titleSize$/.test(props.path ?? '') ? [24,32,44] : [14,18,24];
  const choices = range.map(value => Math.max(props.min ?? 0, Math.min(props.max ?? 2000, value)));
  return <Field {...props}><div className="ve-segmented" role="group" aria-label={props.label}>{choices.map((value,index) => <button type="button" key={index} disabled={props.disabled} aria-pressed={!custom && props.value === value} onClick={() => { setCustom(false); props.onChange(value); }}>{['Pequeño','Mediano','Grande'][index]}</button>)}</div><button type="button" className="ve-custom-choice" aria-expanded={custom} onClick={() => setCustom(!custom)}>Personalizado{!choices.includes(Number(props.value)) ? ' · ' + props.value : ''}</button>{custom && <input aria-label={`${props.label} personalizado`} disabled={props.disabled} type="number" value={Number(props.value)} min={props.min ?? 0} max={props.max ?? 2000} step={props.step ?? 1} onChange={event => { const value=event.target.valueAsNumber; if(Number.isFinite(value) && value >= (props.min ?? 0) && value <= (props.max ?? 2000)) props.onChange(value); }} />}</Field>;
}
export function ProductCountControl(props: ControlProps) {
  const [custom, setCustom] = useState(false);
  return <Field {...props}><div className="ve-segmented" role="group" aria-label={props.label}>{[1,2,3,4].map(value => <button type="button" key={value} disabled={props.disabled} aria-pressed={props.value === value} onClick={() => props.onChange(value)}>{value}</button>)}</div><button type="button" className="ve-custom-choice" aria-expanded={custom} onClick={() => setCustom(!custom)}>Personalizado</button>{custom && <input aria-label={`${props.label} personalizado`} type="number" value={Number(props.value)} min={props.min ?? 1} max={props.max ?? 12} onChange={event => { const value=event.target.valueAsNumber; if(Number.isInteger(value) && value >= (props.min ?? 1) && value <= (props.max ?? 12)) props.onChange(value); }} />}</Field>;
}
export function SliderControl(props: ControlProps) {
  return <Field {...props}><div className="ve-slider"><input disabled={props.disabled} aria-label={props.label} type="range" value={Number(props.value)} min={props.min ?? 0} max={props.max ?? 200} step={props.step ?? 1} onChange={e => props.onChange(e.target.valueAsNumber)} /><output>{props.value}</output></div></Field>;
}
export function FriendlyRadiusControl(props: ControlProps) {
  const [custom, setCustom] = useState(false);
  return <Field {...props}><div className="ve-segmented" role="group" aria-label={props.label}>{[0,8,24].map((value,index) => <button key={value} type="button" disabled={props.disabled} aria-pressed={props.value === value} onClick={() => props.onChange(value)}>{['Recto','Suave','Redondeado'][index]}</button>)}</div><button type="button" className="ve-custom-choice" aria-expanded={custom} onClick={() => setCustom(!custom)}>Personalizado</button>{custom && <input aria-label={`${props.label} personalizado`} disabled={props.disabled} type="number" value={Number(props.value)} min={props.min ?? 0} max={props.max ?? 2000} onChange={event => { const value=event.target.valueAsNumber; if(Number.isFinite(value) && value >= (props.min ?? 0) && value <= (props.max ?? 2000)) props.onChange(value); }} />}</Field>;
}
export function ToggleControl(props: ControlProps) {
  return <Field {...props}><input disabled={props.disabled} aria-label={props.label} type="checkbox" checked={Boolean(props.value)} onChange={e => props.onChange(e.target.checked)} /></Field>;
}
export function SegmentedControl(props: ControlProps) {
  return <Field {...props}><div className="ve-segmented" role="group" aria-label={props.label}>{props.options?.map(value => <button type="button" disabled={props.disabled} key={value} aria-pressed={props.value === value} onClick={() => props.onChange(value)}>{optionLabel(value, props.label)}</button>)}</div></Field>;
}
export const AlignmentControl = SegmentedControl;
export const SpacingControl = NumberControl;
export const RadiusControl = NumberControl;
export const ShadowControl = SelectControl;
export const SizeControl = NumberControl;
