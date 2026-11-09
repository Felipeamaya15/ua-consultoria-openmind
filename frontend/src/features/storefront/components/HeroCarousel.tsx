import { useEffect, useRef, useState } from 'react';
import type { LandingConfig } from '../../landing/types/landing.types';
import './hero-carousel.css';
// Animaciones oficiales disponibles también en la tienda pública, sin fetch en cada visita.

import { CAROUSEL_TRANSITIONS, type CarouselTransitionId } from '../visual/carouselTransitionLibrary';
import { isOnlineEffectId, type OnlineEffectId } from '../visual/onlineEffects';
// OPENMIND_PUBLIC_CAROUSEL_PLAYBACK_FIX_V1
// OPENMIND_ONLINE_EFFECTS_V1

type HeroSlide = { id: string; src: string; alt: string };
type HeroCarouselProps = { landing?: LandingConfig | null; intervalMs?: number };
type CarouselMode = 'static' | 'manual' | 'automatic';
type CarouselTransition = CarouselTransitionId | OnlineEffectId;

type CarouselSettings = {
  mode: CarouselMode;
  interval: number;
  transition: CarouselTransition;
  indicators: boolean;
};

const DEFAULT_SETTINGS: CarouselSettings = {
  mode: 'automatic',
  interval: 5,
  transition: 'fade',
  indicators: true,
};

const VALID_TRANSITIONS: readonly string[] = CAROUSEL_TRANSITIONS.map(effect => effect.id);

function getHeroSlides(landing?: LandingConfig | null): HeroSlide[] {
  const images = [...(landing?.imagenes_carrusel ?? [])]
    .filter(image => Boolean(image.archivo))
    .sort((a, b) => a.orden - b.orden);

  if (images.length > 0) {
    return images.map(image => ({
      id: image.id,
      src: image.archivo,
      alt: image.texto_alternativo || '',
    }));
  }

  if (landing?.imagen_principal) {
    return [{
      id: 'imagen-principal',
      src: landing.imagen_principal,
      alt: landing.titulo || 'Portada de la tienda',
    }];
  }

  return [];
}

export function hasHeroSlides(landing?: LandingConfig | null): boolean {
  return Boolean(
    landing?.imagenes_carrusel?.some(image => image.archivo) ||
    landing?.imagen_principal,
  );
}

function getSettings(element: HTMLElement, fallbackMs?: number): CarouselSettings {
  const style = window.getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const mode = read('--openmind-carousel-mode');
  const transition = read('--openmind-carousel-transition');
  const seconds = Number(read('--openmind-carousel-interval'));
  const indicators = read('--openmind-carousel-indicators');

  return {
    mode: mode === 'static' || mode === 'manual' ? mode : 'automatic',
    interval: Number.isInteger(seconds) && seconds >= 2 && seconds <= 20
      ? seconds
      : fallbackMs != null && Number.isFinite(fallbackMs)
        ? Math.max(2, Math.min(20, Math.round(fallbackMs / 1000)))
        : DEFAULT_SETTINGS.interval,
    transition: (VALID_TRANSITIONS.includes(transition) || isOnlineEffectId(transition))
      ? transition as CarouselTransition
      : DEFAULT_SETTINGS.transition,
    indicators: indicators === '' ? DEFAULT_SETTINGS.indicators : indicators !== '0',
  };
}

export function HeroCarousel({ landing, intervalMs }: HeroCarouselProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const previousSlide = useRef<HeroSlide | null>(null);
  const [outgoing, setOutgoing] = useState<HeroSlide | null>(null);
  const [settings, setSettings] = useState<CarouselSettings>(DEFAULT_SETTINGS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  const slides = getHeroSlides(landing);
  const count = slides.length;
  const currentIndex = count > 0 && settings.mode !== 'static'
    ? activeIndex % count
    : 0;
  const active = slides[currentIndex];
  const nextImageSource = count > 1 && settings.mode === 'automatic'
    ? slides[(currentIndex + 1) % count]?.src
    : undefined;

  useEffect(() => {
    if (!nextImageSource) return;
    const preload = new Image();
    preload.src = nextImageSource;
  }, [nextImageSource]);
  const showDots = count > 1 && settings.mode !== 'static' &&
    (settings.mode === 'manual' || settings.indicators);
  // Pausa explícita para accesibilidad, incluso con indicadores ocultos.
  const showControls = showDots || (count > 1 && settings.mode === 'automatic');

  // Configuración compartida entre tienda pública y vista previa del editor.
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const doc = node.ownerDocument;
    const sync = () => {
      const next = getSettings(node, intervalMs);
      setSettings(previous =>
        previous.mode === next.mode &&
        previous.interval === next.interval &&
        previous.transition === next.transition &&
        previous.indicators === next.indicators
          ? previous : next,
      );
    };
    const observer = new MutationObserver(sync);
    const root = node.closest('[data-storefront-visual]');
    if (root) observer.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    // El editor notifica sus cambios directamente; evitamos observar todo head.
    doc.defaultView?.addEventListener('openmind:carousel:sync', sync);
    sync();
    return () => {
      observer.disconnect();
      doc.defaultView?.removeEventListener('openmind:carousel:sync', sync);
    };
  }, [intervalMs]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    setManualPaused(false);
  }, [settings.mode]);

  useEffect(() => {
    if (count <= 1 || settings.mode !== 'automatic' || manualPaused ||
      reducedMotion || !pageVisible) return;
    // Un solo temporizador por fotografía: respeta 2–20 s, y se reinicia
    // después de escoger un indicador sin desactivar la reproducción.
    const timer = window.setTimeout(() => {
      setActiveIndex(index => (index + 1) % count);
    }, settings.interval * 1000);
    return () => window.clearTimeout(timer);
  }, [count, currentIndex, settings.mode, settings.interval, manualPaused,
    reducedMotion, pageVisible]);

  // Conserva brevemente la fotografía anterior debajo de la nueva.
  // Así las animaciones revelan una imagen y no un fondo vacío.
  useEffect(() => {
    const last = previousSlide.current;
    const changed = Boolean(last && active && (last.id !== active.id || last.src !== active.src));
    previousSlide.current = active ?? null;
    if (!changed || reducedMotion || settings.mode === 'static') {
      setOutgoing(null);
      return;
    }
    setOutgoing(last);
    const timeout = window.setTimeout(() => setOutgoing(null), 760);
    return () => window.clearTimeout(timeout);
  }, [active?.id, active?.src, reducedMotion, settings.mode, settings.transition]);

  function selectSlide(index: number) {
    // Los indicadores SOLO navegan. No pausan la reproducción automática.
    setActiveIndex(index);
  }

  return (
    <div
      ref={hostRef}
      className="hero-carousel"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Fotografías de portada"
    >
      {outgoing && (
        <img
          key={`anterior:${outgoing.id}`}
          src={outgoing.src}
          alt=""
          aria-hidden="true"
          className="hero-carousel__image hero-carousel__image--outgoing"
        />
      )}

      {active && (
        <img
          key={`${active.id}:${active.src}:${settings.transition}`}
          data-visual-part="heroImage"
          data-landing-image
          src={active.src}
          alt={active.alt}
          className={`hero-carousel__image hero-carousel__image--transition-${settings.transition}`}
          style={isOnlineEffectId(settings.transition)
            ? { animation: `${settings.transition.slice(6)} 750ms ease-in-out both` }
            : undefined}
        />
      )}

      <div
        className="hero-carousel__dots"
        role="group"
        aria-label="Seleccionar fotografía de portada"
        aria-hidden={!showControls}
        style={{ display: showControls ? 'flex' : 'none' }}
      >
          {showDots && slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              className={`hero-carousel__dot${index === currentIndex ? ' is-active' : ''}`}
              aria-current={index === currentIndex ? 'true' : undefined}
              aria-label={`Mostrar fotografía ${index + 1} de ${count}`}
              title={`Fotografía ${index + 1}`}
              tabIndex={showDots ? 0 : -1}
              disabled={!showDots}
              onClick={() => selectSlide(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
      </div>
      {count > 1 && settings.mode === 'automatic' && (
        <button
          type="button"
          className="hero-carousel__playback"
          aria-label={manualPaused ? 'Reanudar carrusel automático' : 'Pausar carrusel automático'}
          aria-pressed={manualPaused}
          title={manualPaused ? 'Reanudar reproducción' : 'Pausar reproducción'}
          onClick={() => setManualPaused(value => !value)}
        >
          {manualPaused ? (
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <rect x="4" y="3" width="2.5" height="10" rx=".6" fill="currentColor" />
              <rect x="9.5" y="3" width="2.5" height="10" rx=".6" fill="currentColor" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
