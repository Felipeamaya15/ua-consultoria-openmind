// OPENMIND_EFFECT_LIBRARY_V2
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { VisualConfig } from '../../storefront/visual/types';
import {
  MOVEMENT_EFFECTS,
  LIGHT_EFFECTS,
  motionTransform,
  lightStyle,
  type EffectOption,
  type MotionEffectId,
  type LightEffectId,
} from '../../storefront/visual/effectLibrary';
import './productHoverInspector.css';
import './effectLibraryInspector.css';
import '../../storefront/visual/image-hover.css';

type Area = 'featured' | 'catalog' | 'category';
type Kind = 'motion' | 'light';
type Field =
  | 'hoverFeaturedMotion' | 'hoverFeaturedLight'
  | 'hoverCatalogMotion' | 'hoverCatalogLight'
  | 'hoverCategoryMotion' | 'hoverCategoryLight';

type Props = {
  hero: VisualConfig['hero'];
  suggestedArea: Area;
  onEdit: (field: Field, value: string) => void;
};

const groups = [
  { id: 'featured', label: 'Destacados', description: 'Fotografías de los productos destacados y banners de productos del inicio.', motion: 'hoverFeaturedMotion', light: 'hoverFeaturedLight' },
  { id: 'catalog', label: 'Catálogo', description: 'Tarjetas de producto en la página de catálogo.', motion: 'hoverCatalogMotion', light: 'hoverCatalogLight' },
  { id: 'category', label: 'Categorías', description: 'Tarjetas de categorías que tienen fotografía.', motion: 'hoverCategoryMotion', light: 'hoverCategoryLight' },
] as const;

function simplify(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function ProductHoverInspector({ hero, suggestedArea, onEdit }: Props) {
  const [area, setArea] = useState<Area>(suggestedArea);
  const [libraryKind, setLibraryKind] = useState<Kind | null>(null);
  const [query, setQuery] = useState('');
  const [previewEffect, setPreviewEffect] = useState('none');

  useEffect(() => setArea(suggestedArea), [suggestedArea]);

  const current = groups.find(group => group.id === area) ?? groups[0];
  const movement: MotionEffectId = hero[current.motion] ?? 'none';
  const light: LightEffectId = hero[current.light] ?? 'none';
  const allOptions: ReadonlyArray<EffectOption<string>> = libraryKind === 'motion' ? MOVEMENT_EFFECTS : LIGHT_EFFECTS;
  const activeId = libraryKind === 'motion' ? movement : light;
  const filtered = allOptions.filter(option => simplify(`${option.label} ${option.description} ${option.keywords}`).includes(simplify(query)));
  const sampleMotion = libraryKind === 'motion' ? previewEffect : movement;
  const sampleLight = libraryKind === 'light' ? previewEffect : light;
  const style = {
    '--ve-sample-transform': motionTransform(sampleMotion),
    '--ve-sample-overlay-animation': lightStyle(sampleLight).animation,
    '--ve-sample-overlay-background': lightStyle(sampleLight).background,
  } as CSSProperties;
  const selectedOption = allOptions.find(option => option.id === previewEffect);

  function openLibrary(kind: Kind) {
    if (libraryKind === kind) {
      setLibraryKind(null);
      return;
    }
    setLibraryKind(kind);
    setQuery('');
    setPreviewEffect(kind === 'motion' ? movement : light);
  }

  return (
    <section className="ve-hover-panel" aria-labelledby="ve-hover-heading">
      <div className="ve-hover-panel__heading">
        <span className="ve-hover-panel__eyebrow">INTERACCIÓN CON EL MOUSE</span>
        <h2 id="ve-hover-heading">Efectos de las fotografías</h2>
        <p>Movimiento y luz son independientes y opcionales. Se activan sin abrir el producto.</p>
      </div>

      <label className="ve-hover-panel__label" htmlFor="ve-hover-area">Dónde aplicar los efectos</label>
      <select id="ve-hover-area" value={area} onChange={event => setArea(event.target.value as Area)}>
        {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
      <p className="ve-hover-panel__help">{current.description}</p>

      <fieldset className="ve-hover-panel__group">
        <legend>Movimiento al pasar el mouse</legend>
        <div className="ve-hover-panel__choices">
          {MOVEMENT_EFFECTS.slice(0, 5).map(effect => (
            <label key={effect.id} className={movement === effect.id ? 'is-selected' : ''}>
              <input type="radio" name={`hover-motion-${area}`} checked={movement === effect.id}
                onChange={() => onEdit(current.motion, effect.id)} />
              <span>{effect.label}</span>
            </label>
          ))}
        </div>
        <button type="button" className="ve-effect-library__open" onClick={() => openLibrary('motion')} aria-expanded={libraryKind === 'motion'}>
          {libraryKind === 'motion' ? 'Cerrar movimientos' : 'Explorar más movimientos y buscar →'}
        </button>
      </fieldset>

      <fieldset className="ve-hover-panel__group">
        <legend>Efecto de luz</legend>
        <div className="ve-hover-panel__choices">
          {LIGHT_EFFECTS.slice(0, 5).map(effect => (
            <label key={effect.id} className={light === effect.id ? 'is-selected' : ''}>
              <input type="radio" name={`hover-light-${area}`} checked={light === effect.id}
                onChange={() => onEdit(current.light, effect.id)} />
              <span>{effect.label}</span>
            </label>
          ))}
        </div>
        <button type="button" className="ve-effect-library__open" onClick={() => openLibrary('light')} aria-expanded={libraryKind === 'light'}>
          {libraryKind === 'light' ? 'Cerrar efectos de luz' : 'Explorar más efectos de luz y buscar →'}
        </button>
      </fieldset>

      {libraryKind && (
        <section className="ve-effect-library" aria-label={libraryKind === 'motion' ? 'Biblioteca de movimientos' : 'Biblioteca de efectos de luz'}>
          <div className="ve-effect-library__heading">
            <strong>{libraryKind === 'motion' ? 'Biblioteca de movimientos' : 'Biblioteca de luz'}</strong>
            <button type="button" onClick={() => setLibraryKind(null)} aria-label="Cerrar biblioteca">×</button>
          </div>
          <label htmlFor="ve-effect-search" className="ve-effect-library__search-label">Buscar por nombre o efecto</label>
          <input
            id="ve-effect-search"
            className="ve-effect-library__search"
            type="search"
            placeholder="Ej.: giro, destello, estrellas…"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <p className="ve-effect-library__count">{filtered.length} de {allOptions.length} efectos</p>
          <div className="ve-effect-library__results" aria-label="Resultados de búsqueda">
            {filtered.map(option => (
              <button
                key={option.id}
                type="button"
                className={previewEffect === option.id ? 'is-previewing' : ''}
                aria-pressed={previewEffect === option.id}
                onClick={() => setPreviewEffect(option.id)}
              >
                <strong>{option.label}{activeId === option.id ? ' · En uso' : ''}</strong>
                <span>{option.description}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="ve-hover-panel__help">No encontramos ese efecto. Prueba con otra palabra.</p>}
          </div>

          <div className="ve-effect-library__preview" aria-live="polite">
            <strong>Vista previa: {selectedOption?.label ?? 'Selecciona un efecto'}</strong>
            <div className="ve-effect-library__sample" style={style} tabIndex={0} aria-label="Muestra interactiva. Pasa el mouse o enfoca para ver el efecto.">
              <div className="ve-effect-library__sample-art" aria-hidden="true">🪴</div>
            </div>
            <p>Pasa el mouse sobre la muestra. Elegir un resultado solo lo previsualiza; «Aplicar» guarda el cambio en el borrador.</p>
            <button
              type="button"
              className="ve-effect-library__apply"
              disabled={previewEffect === activeId || !selectedOption}
              onClick={() => onEdit(libraryKind === 'motion' ? current.motion : current.light, previewEffect)}
            >
              {previewEffect === activeId ? 'Efecto en uso' : 'Aplicar este efecto'}
            </button>
          </div>
        </section>
      )}

      <p className="ve-hover-panel__footnote">Los ajustes se comparten entre las cuatro plantillas. «Ninguno» mantiene la fotografía sin efectos añadidos. En pantallas táctiles se evita la animación por hover.</p>
    </section>
  );
}
