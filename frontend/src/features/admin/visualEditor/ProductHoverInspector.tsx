import { useEffect, useState } from 'react';
import type { VisualConfig } from '../../storefront/visual/types';
import './productHoverInspector.css';

type Area = 'featured' | 'catalog' | 'category';
type Field =
  | 'hoverFeaturedMotion' | 'hoverFeaturedLight'
  | 'hoverCatalogMotion' | 'hoverCatalogLight'
  | 'hoverCategoryMotion' | 'hoverCategoryLight';

type Props = {
  hero: VisualConfig['hero'];
  suggestedArea: Area;
  onEdit: (field: Field, value: string) => void;
};

const movements = [
  ['none', 'Ninguno'],
  ['zoom', 'Acercamiento suave'],
  ['lift', 'Elevación'],
  ['tilt', 'Inclinación 3D'],
  ['rotate', 'Giro leve'],
] as const;

const lights = [
  ['none', 'Ninguno'],
  ['shine', 'Barrido de luz'],
  ['flash', 'Destello'],
  ['glow', 'Resplandor'],
  ['sparkle', 'Brillos puntuales'],
] as const;

const groups = [
  { id: 'featured', label: 'Destacados', description: 'Fotografías de los productos destacados y banners de productos del inicio.', motion: 'hoverFeaturedMotion', light: 'hoverFeaturedLight' },
  { id: 'catalog', label: 'Catálogo', description: 'Tarjetas de producto en la página de catálogo.', motion: 'hoverCatalogMotion', light: 'hoverCatalogLight' },
  { id: 'category', label: 'Categorías', description: 'Tarjetas de categorías que tienen fotografía.', motion: 'hoverCategoryMotion', light: 'hoverCategoryLight' },
] as const;

export function ProductHoverInspector({ hero, suggestedArea, onEdit }: Props) {
  const [area, setArea] = useState<Area>(suggestedArea);
  useEffect(() => setArea(suggestedArea), [suggestedArea]);
  const current = groups.find(group => group.id === area) ?? groups[0];
  const movement = hero[current.motion] ?? 'none';
  const light = hero[current.light] ?? 'none';

  return (
    <section className="ve-hover-panel" aria-labelledby="ve-hover-heading">
      <div className="ve-hover-panel__heading">
        <span className="ve-hover-panel__eyebrow">INTERACCIÓN CON EL MOUSE</span>
        <h2 id="ve-hover-heading">Efectos de las fotografías</h2>
        <p>Los dos efectos son independientes y opcionales. Se aplican al pasar el mouse, sin abrir el producto.</p>
      </div>

      <label className="ve-hover-panel__label" htmlFor="ve-hover-area">Dónde aplicar los efectos</label>
      <select id="ve-hover-area" value={area} onChange={event => setArea(event.target.value as Area)}>
        {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
      <p className="ve-hover-panel__help">{current.description}</p>

      <fieldset className="ve-hover-panel__group">
        <legend>Movimiento al pasar el mouse</legend>
        <div className="ve-hover-panel__choices">
          {movements.map(([id, label]) => (
            <label key={id} className={movement === id ? 'is-selected' : ''}>
              <input type="radio" name={`hover-motion-${area}`} checked={movement === id}
                onChange={() => onEdit(current.motion, id)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="ve-hover-panel__group">
        <legend>Efecto de luz</legend>
        <div className="ve-hover-panel__choices">
          {lights.map(([id, label]) => (
            <label key={id} className={light === id ? 'is-selected' : ''}>
              <input type="radio" name={`hover-light-${area}`} checked={light === id}
                onChange={() => onEdit(current.light, id)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="ve-hover-panel__footnote">Se comparte entre las cuatro plantillas. Sin efectos seleccionados, la apariencia original se conserva. En pantallas táctiles no se activan animaciones por hover.</p>
    </section>
  );
}
