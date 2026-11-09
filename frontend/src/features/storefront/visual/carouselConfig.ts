import type { CSSProperties } from 'react';
import type { VisualConfig } from './types';
import { visualConfigToCssVariables } from './cssVariables';
import './image-hover.css';

// OPENMIND_EFFECT_LIBRARY_V2
import { motionTransform, lightStyle } from './effectLibrary';
import { isOnlineEffectId, onlineEffectAnimation, ensureOnlineEffect } from './onlineEffects';
// OPENMIND_ONLINE_EFFECTS_V1: solo se aplican fotogramas CSS permitidos.
function omOnline(value: string | undefined, duration = 750): string {
  if (!isOnlineEffectId(value)) return 'none';
  void ensureOnlineEffect(value).catch(() => undefined);
  return onlineEffectAnimation(value, duration);
}

/** Reutiliza la configuración visual existente y añade variables heredables del carrusel. */
export function visualConfigWithCarouselVars(config: VisualConfig): CSSProperties {
  const hero = config.hero;
  return {
    ...visualConfigToCssVariables(config),
    '--openmind-carousel-mode': hero.carouselMode ?? 'automatic',
    '--openmind-carousel-interval': String(hero.carouselInterval ?? 5),
    '--openmind-carousel-transition': hero.carouselTransition ?? 'fade',
    '--openmind-carousel-indicators': (hero.carouselIndicators ?? true) ? '1' : '0',
    // Efectos por grupo de fotografías (producto/categoría).
    '--om-hover-featured-transform': motionTransform(hero.hoverFeaturedMotion),
    '--om-hover-featured-overlay-animation': isOnlineEffectId(hero.hoverFeaturedLight) ? omOnline(hero.hoverFeaturedLight, 1100) : lightStyle(hero.hoverFeaturedLight).animation,
    '--om-hover-featured-overlay-background': isOnlineEffectId(hero.hoverFeaturedLight) ? 'radial-gradient(ellipse,rgba(255,255,255,.14),transparent 72%)' : lightStyle(hero.hoverFeaturedLight).background,
    '--om-hover-catalog-transform': motionTransform(hero.hoverCatalogMotion),
    '--om-hover-catalog-overlay-animation': isOnlineEffectId(hero.hoverCatalogLight) ? omOnline(hero.hoverCatalogLight, 1100) : lightStyle(hero.hoverCatalogLight).animation,
    '--om-hover-catalog-overlay-background': isOnlineEffectId(hero.hoverCatalogLight) ? 'radial-gradient(ellipse,rgba(255,255,255,.14),transparent 72%)' : lightStyle(hero.hoverCatalogLight).background,
    '--om-hover-category-transform': motionTransform(hero.hoverCategoryMotion),
    '--om-hover-category-overlay-animation': isOnlineEffectId(hero.hoverCategoryLight) ? omOnline(hero.hoverCategoryLight, 1100) : lightStyle(hero.hoverCategoryLight).animation,
    '--om-hover-category-overlay-background': isOnlineEffectId(hero.hoverCategoryLight) ? 'radial-gradient(ellipse,rgba(255,255,255,.14),transparent 72%)' : lightStyle(hero.hoverCategoryLight).background,
    '--om-online-carousel-animation': omOnline(hero.carouselTransition, 750),
    '--om-hover-featured-online-motion': omOnline(hero.hoverFeaturedMotion, 850),
    '--om-hover-catalog-online-motion': omOnline(hero.hoverCatalogMotion, 850),
    '--om-hover-category-online-motion': omOnline(hero.hoverCategoryMotion, 850),
  } as CSSProperties;
}
