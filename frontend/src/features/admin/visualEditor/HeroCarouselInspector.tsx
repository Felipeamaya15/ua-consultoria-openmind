import type { VisualConfig } from '../../storefront/visual/types';
import './heroCarouselInspector.css';

type CarouselField =
  | 'carouselMode'
  | 'carouselInterval'
  | 'carouselTransition'
  | 'carouselIndicators'
  | 'gap';

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
  const interval = hero.carouselInterval ?? 10;
  const transition = hero.carouselTransition ?? 'fade';
  const indicators = hero.carouselIndicators ?? true;
  const gap = Math.min(72, Math.max(0, Math.round(hero.gap ?? 24)));

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
          <div className="ve-carousel-panel__segments" role="group" aria-label="Velocidad del carrusel">
            {([5, 10, 20] as const).map(seconds => (
              <button
                key={seconds}
                type="button"
                className={interval === seconds ? 'is-active' : ''}
                aria-pressed={interval === seconds}
                onClick={() => onEdit('carouselInterval', seconds)}
              >
                {seconds} s
              </button>
            ))}
          </div>
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

      <section className="ve-carousel-panel__spacing" aria-label="Espaciado de la portada">
        <div className="ve-carousel-panel__spacing-heading">
          <div>
            <strong>Espaciado de portada</strong>
            <p>Separa el título, la descripción y el botón.</p>
          </div>
          <output htmlFor="ve-carousel-gap">{gap} px</output>
        </div>
        <input
          id="ve-carousel-gap"
          type="range"
          min={0}
          max={72}
          step={4}
          value={gap}
          onChange={event => onEdit('gap', Number(event.target.value))}
          aria-label="Separación de elementos de portada"
        />
        <div className="ve-carousel-panel__range-labels"><span>Compacto</span><span>Amplio</span></div>
      </section>

      <p className="ve-carousel-panel__footer">
        El carrusel se configura una vez para las cuatro plantillas. Solo el espaciado de portada es particular de cada diseño. Las fotografías se administran desde Página principal → Portada.
      </p>
    </section>
  );
}
