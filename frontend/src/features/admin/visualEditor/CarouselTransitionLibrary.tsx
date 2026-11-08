import { useState } from 'react';
import {
  CAROUSEL_TRANSITIONS,
  carouselTransitionById,
  isCarouselTransitionId,
  type CarouselTransitionId,
} from '../../storefront/visual/carouselTransitionLibrary';

// Reutiliza exactamente los keyframes del carrusel público.
import '../../storefront/components/hero-carousel.css';
import './carouselTransitionLibrary.css';

type Props = {
  current: string;
  onApply: (value: CarouselTransitionId) => void;
};

function simplify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function CarouselTransitionLibrary({ current, onApply }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CarouselTransitionId>(
    isCarouselTransitionId(current) ? current : 'fade',
  );
  const [previewKey, setPreviewKey] = useState(0);

  const term = simplify(query);
  const results = CAROUSEL_TRANSITIONS.filter(effect =>
    simplify(`${effect.title} ${effect.description} ${effect.keywords} ${effect.category}`).includes(term),
  );
  const chosen = carouselTransitionById(selected);
  const inUse = current === selected;

  function preview(value: CarouselTransitionId) {
    setSelected(value);
    setPreviewKey(key => key + 1);
  }

  return (
    <div className="ve-carousel-library" aria-label="Biblioteca de transiciones del carrusel">
      <h3>Biblioteca de transiciones</h3>
      <label className="ve-carousel-library__search">
        Buscar por nombre o efecto
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Ej.: cortina, giro, zoom..."
          aria-label="Buscar transiciones del carrusel"
        />
      </label>
      <p className="ve-carousel-library__count">{results.length} de {CAROUSEL_TRANSITIONS.length} efectos</p>
      <div className="ve-carousel-library__results" role="group" aria-label="Resultados de transiciones">
        {results.map(effect => (
          <button
            key={effect.id}
            type="button"
            className={`ve-carousel-library__option${selected === effect.id ? ' is-previewed' : ''}`}
            aria-pressed={selected === effect.id}
            onClick={() => preview(effect.id)}
          >
            <strong>{effect.title}{current === effect.id ? ' · En uso' : ''}</strong>
            <small>{effect.description}</small>
          </button>
        ))}
        {results.length === 0 && <p className="ve-carousel-library__empty">No hay resultados. Prueba con otra palabra.</p>}
      </div>

      <div className="ve-carousel-library__preview-area">
        <strong>Vista previa: {chosen?.title ?? selected}</strong>
        <div
          className="ve-carousel-library__scene hero-carousel"
          role="img"
          aria-label={`Ejemplo de transición ${chosen?.title ?? selected} entre dos fotografías`}
          onMouseEnter={() => setPreviewKey(key => key + 1)}
        >
          <div className="ve-carousel-library__scene-base" aria-hidden="true">
            <span>Foto A</span>
          </div>
          <div
            key={`${selected}-${previewKey}`}
            className={`hero-carousel__image hero-carousel__image--transition-${selected} ve-carousel-library__scene-new`}
            aria-hidden="true"
          >
            <span>Foto B</span>
          </div>
        </div>
        <button
          type="button"
          className="ve-carousel-library__replay"
          onClick={() => setPreviewKey(key => key + 1)}
        >
          Repetir animación
        </button>
        <p>Seleccionar solo muestra el efecto. Usa «Aplicar» para guardarlo en el borrador.</p>
        <button
          type="button"
          className={`ve-carousel-library__apply${inUse ? ' is-applied' : ''}`}
          disabled={inUse}
          onClick={() => onApply(selected)}
        >
          {inUse ? 'Efecto en uso' : 'Aplicar esta transición'}
        </button>
      </div>
    </div>
  );
}
