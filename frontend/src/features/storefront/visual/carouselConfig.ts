import type { CSSProperties } from 'react';
import type { VisualConfig } from './types';
import { visualConfigToCssVariables } from './cssVariables';

/** Reutiliza la configuración visual existente y añade variables heredables del carrusel. */
export function visualConfigWithCarouselVars(config: VisualConfig): CSSProperties {
  const hero = config.hero;
  return {
    ...visualConfigToCssVariables(config),
    '--openmind-carousel-mode': hero.carouselMode ?? 'automatic',
    '--openmind-carousel-interval': String(hero.carouselInterval ?? 10),
    '--openmind-carousel-transition': hero.carouselTransition ?? 'fade',
    '--openmind-carousel-indicators': (hero.carouselIndicators ?? true) ? '1' : '0',
  } as CSSProperties;
}
