import type { VisualConfig, Viewport } from '../../storefront/visual/types';
import { resolveVisualViewport } from '../../storefront/visual/resolveVisualConfig';
import { NumberControl } from './controls';
import { FieldHelp } from './help';

/** Friendly choices write existing height leaves, not another visual default. */
export const BANNER_SIZES = {
  small: { label: 'Pequeño', desktop: 320, tablet: 280, mobile: 260 },
  medium: { label: 'Mediano', desktop: 480, tablet: 400, mobile: 340 },
  large: { label: 'Grande', desktop: 640, tablet: 520, mobile: 440 },
  wide: { label: 'Destacado', desktop: 800, tablet: 640, mobile: 520 },
} as const;
export type BannerSize = keyof typeof BANNER_SIZES;
export function bannerSizeFor(config: VisualConfig, viewport: Viewport): BannerSize | 'custom' {
  const height = resolveVisualViewport(config, viewport).hero.height;
  return (Object.keys(BANNER_SIZES) as BannerSize[]).find(key => BANNER_SIZES[key][viewport] === height) ?? 'custom';
}
export function BannerSizeControl({ config, viewport, editScope = 'all', onEditMany, onEdit, onReset }: { config: VisualConfig; viewport: Viewport; editScope?: 'all' | 'device'; onEditMany?: (edits: Record<string, number>) => void; onEdit: (path: string, value: number) => void; onReset: (path: string) => void }) {
  const path = viewport === 'desktop' ? 'hero.height' : `responsive.${viewport}.hero.height`;
  return <div className="ve-banner-control">
    <div className="ve-control-label"><label htmlFor="ve-banner-size">Tamaño del banner principal</label><FieldHelp label="Tamaño del banner principal">Define cuánto espacio ocupa la imagen principal al entrar a tu tienda. Las opciones ajustan computadora, tablet y móvil; el contenido puede ampliar la altura para no recortarse.</FieldHelp></div>
    <select id="ve-banner-size" value={bannerSizeFor(config, viewport)} onChange={event => {
      if (event.target.value === 'custom') return;
      const size = BANNER_SIZES[event.target.value as BannerSize];
      const edits = editScope === 'device' ? {[path]: size[viewport]} : {'hero.height': size.desktop, 'responsive.tablet.hero.height': size.tablet, 'responsive.mobile.hero.height': size.mobile};
      if (onEditMany) onEditMany(edits); else for (const [key, value] of Object.entries(edits)) onEdit(key, value);
    }}>{Object.entries(BANNER_SIZES).map(([key, size]) => <option key={key} value={key}>{size.label}</option>)}<option value="custom" disabled>Personalizado · ajuste avanzado</option></select>
    <button type="button" onClick={() => { for (const key of editScope === 'device' ? [path] : ['hero.height','responsive.tablet.hero.height','responsive.mobile.hero.height']) onReset(key); }}>Restablecer tamaño</button>
    <details><summary>Ajuste avanzado de altura</summary><NumberControl label="Altura del banner (px)" value={resolveVisualViewport(config, viewport).hero.height} min={180} max={1400} onChange={value => onEdit(path, Number(value))} onReset={() => onReset(path)} /></details>
  </div>;
}
