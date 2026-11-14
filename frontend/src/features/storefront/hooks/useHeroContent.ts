import { useState } from 'react';
import type { CarouselSlideContent, LandingConfig } from '../../landing/types/landing.types';

export function resolveHeroContent(landing: LandingConfig | null | undefined, content: CarouselSlideContent, route: (path: string) => string) {
  const raw = content.enlace?.trim() || 'catalogo';
  // Backend validates too; cached/legacy values never become script or protocol-relative links.
  const safe = !/[\\<>\x00-\x20]/.test(raw) && !raw.startsWith('//') && (!raw.includes(':') || raw.startsWith('https://'));
  const href = safe ? raw.startsWith('https://') || raw.startsWith('/') || raw.startsWith('#') ? raw : route(raw) : route('catalogo');
  return {
    title: content.titulo ?? landing?.titulo ?? '', description: content.descripcion ?? landing?.descripcion ?? '',
    buttonText: content.texto_boton ?? landing?.texto_boton ?? '', href, external: href.startsWith('https://'),
    showTitle: content.mostrar_titulo !== false, showDescription: content.mostrar_descripcion !== false, showButton: content.mostrar_boton !== false,
    customButton: content.texto_boton !== undefined || content.enlace !== undefined || content.mostrar_boton !== undefined,
  };
}

export function useHeroContent(landing: LandingConfig | null | undefined, route: (path: string) => string) {
  const [content, setContent] = useState<CarouselSlideContent>({});
  return { ...resolveHeroContent(landing, content, route), onChange: setContent };
}
