import type { CSSProperties } from 'react';
import type { VisualConfig } from './types';
import { visualConfigToCssVariables } from './cssVariables';
import './image-hover.css';

// OPENMIND_PRODUCT_HOVER_V1
function motionTransform(motion: string | undefined): string {
  switch (motion) {
    case 'zoom': return 'scale(1.075)';
    case 'lift': return 'translateY(-9px) scale(1.025)';
    case 'tilt': return 'perspective(850px) rotateY(5deg) rotateX(2deg) scale(1.045)';
    case 'rotate': return 'rotate(2.5deg) scale(1.06)';
    default: return 'none';
  }
}
function lightStyle(effect: string | undefined): { animation: string; background: string } {
  switch (effect) {
    case 'shine': return { animation: 'om-product-shine 850ms ease-out 1', background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,.55) 50%, transparent 75%)' };
    case 'flash': return { animation: 'om-product-flash 700ms ease-out 1', background: 'rgba(255,255,255,.55)' };
    case 'glow': return { animation: 'om-product-glow 1100ms ease-in-out infinite alternate', background: 'linear-gradient(90deg, rgba(255,255,255,.35), transparent 12%, transparent 88%, rgba(255,255,255,.35)), linear-gradient(180deg, rgba(255,255,255,.28), transparent 12%, transparent 88%, rgba(255,255,255,.28))' };
    case 'sparkle': return { animation: 'om-product-sparkle 950ms ease-in-out infinite alternate', background: 'radial-gradient(circle at 18% 24%, white 0 3px,transparent 6px),radial-gradient(circle at 72% 48%,white 0 2px,transparent 5px),radial-gradient(circle at 54% 78%,white 0 3px,transparent 7px),radial-gradient(circle at 88% 16%,white 0 2px,transparent 5px)' };
    default: return { animation: 'none', background: 'transparent' };
  }
}

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
