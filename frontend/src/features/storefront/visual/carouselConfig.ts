import type { CSSProperties } from 'react';
import type { VisualConfig } from './types';
import { visualConfigToCssVariables } from './cssVariables';
import './image-hover.css';

// OPENMIND_EFFECT_LIBRARY_V2
import { motionTransform, lightStyle } from './effectLibrary';

/** Reutiliza la configuración visual existente y añade variables heredables del carrusel. */
export function visualConfigWithCarouselVars(config: VisualConfig): CSSProperties {
  const hero = config.hero;
  return {
    ...visualConfigToCssVariables(config),
    '--openmind-carousel-mode': hero.carouselMode ?? 'automatic',
    '--openmind-carousel-interval': String(hero.carouselInterval ?? 10),
    '--openmind-carousel-transition': hero.carouselTransition ?? 'fade',
    '--openmind-carousel-indicators': (hero.carouselIndicators ?? true) ? '1' : '0',
    // Efectos por grupo de fotografías (producto/categoría).
    '--om-hover-featured-transform': motionTransform(hero.hoverFeaturedMotion),
    '--om-hover-featured-overlay-animation': lightStyle(hero.hoverFeaturedLight).animation,
    '--om-hover-featured-overlay-background': lightStyle(hero.hoverFeaturedLight).background,
    '--om-hover-catalog-transform': motionTransform(hero.hoverCatalogMotion),
    '--om-hover-catalog-overlay-animation': lightStyle(hero.hoverCatalogLight).animation,
    '--om-hover-catalog-overlay-background': lightStyle(hero.hoverCatalogLight).background,
    '--om-hover-category-transform': motionTransform(hero.hoverCategoryMotion),
    '--om-hover-category-overlay-animation': lightStyle(hero.hoverCategoryLight).animation,
    '--om-hover-category-overlay-background': lightStyle(hero.hoverCategoryLight).background,
  } as CSSProperties;
}
