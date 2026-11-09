import { useEffect, useState } from 'react';
import type { VisualConfig } from '../../storefront/visual/types';
import { carouselTransitionById } from '../../storefront/visual/carouselTransitionLibrary';
import { CarouselTransitionLibrary } from './CarouselTransitionLibrary';
import './heroCarouselInspector.css';

type CarouselField =
  | 'carouselMode'
  | 'carouselInterval'
  | 'carouselTransition'
  | 'carouselIndicators';

type CarouselValue = string | number | boolean;

type Props = {
  hero: VisualConfig['hero'];
  imageCount: number;
  onEdit: (field: CarouselField, value: CarouselValue) => void;
};

const modes = [
  { value: 'static', title: 'Estático', description: 'Una fotografía fija' },
  { value: 'manual', title: 'Manual', description: 'El visitante elige' },
  { value: 'automatic', title: 'Automático', description: 'Las fotos van rotando' },
] as const;

const transitions = [
  { value: 'fade', title: 'Fundido', description: 'Cambio suave' },
  { value: 'slide', title: 'Deslizar', description: 'Desde un costado' },
  { value: 'zoom', title: 'Zoom', description: 'Acercamiento' },
  { value: 'blur', title: 'Enfoque', description: 'De borroso a nítido' },
  { value: 'rise', title: 'Ascenso', description: 'Desde abajo' },
  { value: 'reveal', title: 'Revelar', description: 'Barrido horizontal' },
] as const;

/** Los archivos viven en Página principal. Aquí solo se configura el comportamiento visual. */
export function HeroCarouselInspector({ hero, imageCount, onEdit }: Props) {
  const mode = hero.carouselMode ?? 'automatic';
  const interval = hero.carouselInterval ?? 5;
  const [intervalDraft, setIntervalDraft] = useState(String(interval));
  useEffect(() => setIntervalDraft(String(interval)), [interval]);
  const commitInterval = (raw: string) => {
    const number = Number(raw);
    const normalized = Number.isInteger(number) && raw.trim() !== ''
      ? Math.max(2, Math.min(20, number))
      : interval;
    setIntervalDraft(String(normalized));
    if (normalized !== interval) onEdit('carouselInterval', normalized);
  };
  const transition = hero.carouselTransition ?? 'fade';
  const [libraryOpen, setLibraryOpen] = useState(false);
  const indicators = hero.carouselIndicators ?? true;

  return (
    <section className="ve-carousel-panel" aria-labelledby="ve-carousel-heading">
      <header className="ve-carousel-panel__header">
        <span className="ve-carousel-panel__eyebrow">PORTADA MULTIMEDIA · AJUSTE COMPARTIDO</span>
        <h2 id="ve-carousel-heading">Carrusel de imágenes</h2>
        <p>El modo, intervalo, transición e indicadores se aplican a todas las plantillas.</p>
        <div className="ve-carousel-panel__count">
          <span className="ve-carousel-panel__count-number">{imageCount}</span>
          <span>{imageCount === 1 ? 'fotografía disponible' : 'fotografías disponibles'}</span>
        </div>
        {imageCount === 0 && <p className="ve-carousel-panel__note">Sin fotografías del carrusel. Se utilizará la imagen principal de la tienda cuando exista.</p>}
      </header>

      <fieldset className="ve-carousel-panel__fieldset">
        <legend>Modo de visualización</legend>
        <div className="ve-carousel-panel__modes">
          {modes.map(option => (
            <label key={option.value} className={`ve-carousel-panel__mode${mode === option.value ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="ve-carousel-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => onEdit('carouselMode', option.value)}
              />
              <span className="ve-carousel-panel__mode-copy">
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
              <span className="ve-carousel-panel__check" aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'automatic' && (
        <fieldset className="ve-carousel-panel__fieldset">
          <legend>Intervalo automático</legend>
          <p className="ve-carousel-panel__subhint">Tiempo de espera entre fotografías.</p>
          <div className="ve-carousel-panel__interval-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label htmlFor="ve-carousel-interval-seconds">Segundos entre fotografías</label>
            <input
              id="ve-carousel-interval-seconds"
              type="number"
              min={2}
              max={20}
              step={1}
              inputMode="numeric"
              value={intervalDraft}
              onChange={event => {
                const value = event.target.value;
                setIntervalDraft(value);
                const number = Number(value);
                if (value.trim() !== '' && Number.isInteger(number) && number >= 2 && number <= 20) {
                  onEdit('carouselInterval', number);
                }
              }}
              onBlur={() => commitInterval(intervalDraft)}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              aria-describedby="ve-carousel-interval-hint"
              style={{ width: 78, minHeight: 38, borderRadius: 8, border: '1px solid var(--border, #a7a7a7)', background: 'var(--background, white)', color: 'inherit', padding: '6px 10px' }}
            />
            <span aria-hidden="true">s</span>
          </div>
          <p id="ve-carousel-interval-hint" className="ve-carousel-panel__subhint">Entre 2 y 20 segundos. Ejemplo: 3, 7 o 12. Para una foto fija utiliza «Estático».</p>
        </fieldset>
      )}

      {mode !== 'static' && (
        <fieldset className="ve-carousel-panel__fieldset">
          <legend>Efecto de transición</legend>
          <div className="ve-carousel-panel__effects">
            {transitions.map(option => (
              <label key={option.value} className={`ve-carousel-panel__effect${transition === option.value ? ' is-active' : ''}`}>
                <input
                  type="radio"
                  name="ve-carousel-transition"
                  value={option.value}
                  checked={transition === option.value}
                  onChange={() => onEdit('carouselTransition', option.value)}
                />
                <span className={`ve-carousel-panel__effect-mark ve-carousel-panel__effect-mark--${option.value}`} aria-hidden="true" />
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </label>
            ))}
          </div>
          {!transitions.some(option => option.value === transition) && (
            <p className="ve-carousel-panel__subhint" role="status">
              Transición en uso: {carouselTransitionById(transition)?.title ?? transition}
            </p>
          )}
          <button
            className="ve-carousel-library-launch"
            type="button"
            aria-expanded={libraryOpen}
            onClick={() => setLibraryOpen(open => !open)}
          >
            {libraryOpen ? 'Cerrar biblioteca de transiciones' : 'Explorar más transiciones'}
          </button>
          {libraryOpen && (
            <CarouselTransitionLibrary
              current={transition}
              onApply={value => onEdit('carouselTransition', value)}
            />
          )}
        </fieldset>
      )}

      {mode === 'automatic' && (
        <label className="ve-carousel-panel__toggle">
          <span className="ve-carousel-panel__toggle-copy">
            <strong>Mostrar indicadores</strong>
            <small>Los pequeños puntos para elegir una foto.</small>
          </span>
          <input
            type="checkbox"
            checked={indicators}
            onChange={event => onEdit('carouselIndicators', event.target.checked)}
          />
          <span className="ve-carousel-panel__switch" aria-hidden="true" />
        </label>
      )}


      <p className="ve-carousel-panel__footer">
        El modo, intervalo, transición e indicadores se comparten entre las cuatro plantillas. Las fotografías se administran desde Página principal → Portada.
      </p>
    </section>
  );
}

// OPENMIND_PORTADA_UI_UNIFICADA_V1: control unico de espaciado dentro de Portada.
export function HeroSpacingControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const gap = Math.min(72, Math.max(0, Math.round(value ?? 24)));
  return (
    <div className="ve-carousel-panel__spacing" aria-label="Espaciado de portada">
      <div className="ve-carousel-panel__spacing-heading">
        <div><p>Separa el título, la descripción y el botón.</p></div>
        <output htmlFor="ve-hero-gap">{gap} px</output>
      </div>
      <input
        id="ve-hero-gap"
        type="range"
        min={0}
        max={72}
        step={4}
        value={gap}
        onChange={event => onChange(Number(event.target.value))}
        aria-label="Separación de elementos de portada"
      />
      <div className="ve-carousel-panel__range-labels"><span>Compacto</span><span>Amplio</span></div>
    </div>
  );
}
