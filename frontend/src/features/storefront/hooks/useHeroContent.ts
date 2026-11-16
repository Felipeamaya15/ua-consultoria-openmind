import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { CarouselSlideContent, LandingConfig } from '../../landing/types/landing.types';

export function resolveHeroContent(landing: LandingConfig | null | undefined, content: CarouselSlideContent, route: (path: string) => string) {
  // El modo compartido ignora temporalmente los textos individuales, sin borrarlos.
  const effectiveContent: CarouselSlideContent = landing?.contenido?.carrusel_texto_modo === 'unico' ? {} : content;
  const raw = effectiveContent.enlace?.trim() || 'catalogo';
  // Backend validates too; cached/legacy values never become script or protocol-relative links.
  const safe = !/[\\<>\x00-\x20]/.test(raw) && !raw.startsWith('//') && (!raw.includes(':') || raw.startsWith('https://'));
  const href = safe ? raw.startsWith('https://') || raw.startsWith('/') || raw.startsWith('#') ? raw : route(raw) : route('catalogo');
  return {
    title: effectiveContent.titulo ?? landing?.titulo ?? '', description: effectiveContent.descripcion ?? landing?.descripcion ?? '',
    buttonText: effectiveContent.texto_boton ?? landing?.texto_boton ?? '', href, external: href.startsWith('https://'),
    showTitle: effectiveContent.mostrar_titulo !== false, showDescription: effectiveContent.mostrar_descripcion !== false, showButton: effectiveContent.mostrar_boton !== false,
    customButton: effectiveContent.texto_boton !== undefined || effectiveContent.enlace !== undefined || effectiveContent.mostrar_boton !== undefined,
  };
}

export function useHeroContent(landing: LandingConfig | null | undefined, route: (path: string) => string) {
  const [content, setContent] = useState<CarouselSlideContent>({});
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!/^#seccion-[a-zA-Z0-9_-]+$/.test(hash)) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'});
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, key, landing]);
  return { ...resolveHeroContent(landing, content, route), onChange: setContent };
}
