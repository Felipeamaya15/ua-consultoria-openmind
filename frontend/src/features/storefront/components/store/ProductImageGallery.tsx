
import { ViewportVideo } from '../../../landing/components/ViewportVideo';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isCarouselTransitionId } from '../../visual/carouselTransitionLibrary';
import { ensureOnlineEffect, isOnlineEffectId, onlineEffectAnimation } from '../../visual/onlineEffects';
import type { VisualConfig } from '../../visual/types';
import '../hero-carousel.css';
import './productImageGallery.css';

type Props = { images: string[]; alt: string; href?: string; imageClassName?: string; detail?: boolean; index?: number; onSelect?: (index: number) => void; videoUrl?: string };


export function ProductImageGallery({ images, alt, href, imageClassName = '', detail = false, index, onSelect, videoUrl }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const esInicio =
    (typeof document !== 'undefined' && pathname === '/') ||
    /^\/(?:(?:admin|emprendedor)\/preview\/)?plantilla\/(?:\d+|editorial|minimal|visual|catalog)\/?$/.test(pathname);
  const esCatalogo = /(?:^|\/)catalogo\/?$/.test(pathname);
  const permiteRotacion = !detail && (esInicio || esCatalogo);
  const [desktopPointer, setDesktopPointer] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [selected, setSelected] = useState(0), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false), [visible, setVisible] = useState(true), [reduced, setReduced] = useState(false);
  const [settings, setSettings] = useState({ mode: 'hover', interval: esCatalogo ? 2 : 5, transition: detail ? 'none' : 'slide', indicators: true });
  const previewHero = useRef<VisualConfig['hero'] | null>(null);
  const [onlineReady, setOnlineReady] = useState<string | null>(null);
  const count = images.length + (detail && videoUrl ? 1 : 0), current = count ? ((index ?? selected) + count) % count : 0, src = images[current];
  const previous = useRef<string>();
  const [outgoing, setOutgoing] = useState<string>();
  const hoverChangeId = useRef(0);

  function select(next: number, preloadForRotation = false) {
    if (count < 1) return;
    const value = (next + count) % count;

    if ((!esInicio && !preloadForRotation) || detail || value === current) {
      hoverChangeId.current += 1;
      setSelected(value);
      onSelect?.(value);
      return;
    }

    const candidate = images[value];
    if (!candidate) return;

    const requestId = ++hoverChangeId.current;
    const preload = new Image();
    let applied = false;

    const apply = () => {
      if (applied || requestId !== hoverChangeId.current) return;
      if (preload.naturalWidth < 1) return;

      applied = true;
      setSelected(value);
      onSelect?.(value);
    };

    preload.onload = apply;
    preload.onerror = () => {

    };
    preload.src = candidate;

    if (preload.complete) apply();
  }
  useEffect(() => {
    const node = host.current; if (!node) return;
    const win = node.ownerDocument.defaultView;
    if (!win) return;
    const root = node.closest('[data-storefront-visual]') ?? node;
    const sync = () => {
      const style = win.getComputedStyle(root);
      const read = (name: string) => style.getPropertyValue(name).trim();
      const prefix = esCatalogo ? '--openmind-catalog-product-' : '--openmind-product-';
      const hero = previewHero.current;
      const mode = (esCatalogo ? hero?.catalogProductImageMode : hero?.productImageMode) ?? read(prefix + 'mode');
      const interval = (esCatalogo ? hero?.catalogProductImageInterval : hero?.productImageInterval) ?? Number(read(prefix + 'interval'));
      const transition = detail
        ? hero?.detailProductImageTransition ?? (read('--openmind-detail-product-transition') || 'none')
        : (esCatalogo ? hero?.catalogProductImageTransition : hero?.productImageTransition) ?? read(prefix + 'transition');
      const next = {
        mode: ['static', 'hover', 'automatic'].includes(mode) ? mode : 'hover',
        interval: Math.max(1, Math.min(esCatalogo ? 10 : 20, Math.round(interval || (esCatalogo ? 2 : 5)))),
        transition: (detail && transition === 'none') || isCarouselTransitionId(transition) || isOnlineEffectId(transition) ? transition : detail ? 'none' : 'slide',
        indicators: hero?.carouselIndicators ?? read('--openmind-carousel-indicators') !== '0',
      };
      setSettings(old => old.mode === next.mode && old.interval === next.interval && old.transition === next.transition && old.indicators === next.indicators ? old : next);
    };
    const receive = (event: Event) => {
      const value = (event as CustomEvent<VisualConfig['hero']>).detail;
      if (value && typeof value === 'object') previewHero.current = value;
      sync();
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    win.addEventListener('openmind:carousel:sync', receive);
    sync();
    return () => { observer.disconnect(); win.removeEventListener('openmind:carousel:sync', receive); };
  }, [esCatalogo, detail]);
  useEffect(() => {
    const pointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const updatePointer = () => setDesktopPointer(pointer.matches);
    updatePointer(); pointer.addEventListener('change', updatePointer);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches); update(); media.addEventListener('change', update);
    const visibility = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', visibility);
    return () => { pointer.removeEventListener('change', updatePointer); media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = host.current; if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const observer = new IntersectionObserver(entries => setInView(entries[0].isIntersecting)); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const activeRotation = settings.mode === 'hover' ? hovered : settings.mode === 'automatic' && desktopPointer && !focused;
  useEffect(() => {
    if (!permiteRotacion || count < 2 || reduced || !visible || !inView || !activeRotation || paused) return;
    const timer = window.setTimeout(() => select(current + 1, true), settings.interval * 1000);
    return () => { clearTimeout(timer); hoverChangeId.current += 1; };
  }, [permiteRotacion, count, current, reduced, visible, inView, paused, activeRotation, settings.interval]);
  useEffect(() => {
    if (!permiteRotacion || !inView || count < 2 || settings.mode === 'static' || (!hovered && !(settings.mode === 'automatic' && desktopPointer))) return;
    const image = new Image(); image.src = images[(current + 1) % count];
  }, [permiteRotacion, inView, count, current, hovered, desktopPointer, settings.mode, images.join('|')]);
  useEffect(() => {
    let alive = true;
    setOnlineReady(null);
    if (isOnlineEffectId(settings.transition)) {
      const chosen = settings.transition;
      void ensureOnlineEffect(chosen, host.current?.ownerDocument).then(ok => {
        if (alive && ok) setOnlineReady(chosen);
      }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [settings.transition]);
  const basicTransition = ['slide', 'fade', 'zoom'].includes(settings.transition);
  const transitionDuration = basicTransition ? 450 : 800;
  const transitionAnimation = basicTransition
    ? `${(esInicio || esCatalogo) ? 'om-featured-' + settings.transition + '-full' : 'om-gallery-' + settings.transition} 400ms ease-out both`
    : isOnlineEffectId(settings.transition)
      ? onlineReady === settings.transition ? onlineEffectAnimation(settings.transition, 750) : 'om-gallery-fade 400ms ease-out both'
      : `openmind-carrusel-${settings.transition} 700ms ease-in-out both`;
  useLayoutEffect(() => {
    const old = previous.current; previous.current = src;
    if ((detail && settings.transition === 'none') || !src || !old || old === src || reduced) { setOutgoing(undefined); return; }
    setOutgoing(old); const timer = window.setTimeout(() => setOutgoing(undefined), transitionDuration);
    return () => clearTimeout(timer);
  }, [src, reduced, detail, transitionDuration]);
  const image = <>

    {detail && src && (
      <div className="om-product-gallery__backdrop" aria-hidden="true">
        <img src={src} alt="" loading="lazy" decoding="async" />
      </div>
    )}
    {esInicio && !detail && images[0] && (
      <div className="om-product-gallery__fallback" aria-hidden="true">
        <img src={images[0]} alt="" loading="eager" />
      </div>
    )}
    {outgoing && <div className="om-product-gallery__layer" aria-hidden="true"><img src={outgoing} alt="" className={imageClassName} /></div>}
    {src && <div key={src} className="om-product-gallery__layer" data-gallery-active="true"
      data-gallery-transition={outgoing && count > 1 && !reduced && settings.transition !== 'none' ? 'true' : undefined}
      style={outgoing && count > 1 && !reduced && settings.transition !== 'none' ? { '--om-gallery-transition': transitionAnimation } as CSSProperties : undefined}><img {...(detail ? { 'data-page-main-image': true } : {})} src={src} alt={alt} loading={detail ? 'eager' : 'lazy'} decoding="async" className={imageClassName} /></div>}

    {detail && videoUrl && current === images.length && (
      <div className="om-product-gallery__layer">
        <ViewportVideo
          data-page-main-image
          src={videoUrl}
          autoPlay
          muted
          controls
          playsInline
          preload="none"
          className="w-full h-full object-contain bg-black"
          style={{ pointerEvents: 'auto' }}
        />
      </div>
    )}
  </>;
  return <div ref={host} className={detail ? "om-product-gallery om-product-gallery--detail om-product-gallery--detail-controls" : esInicio ? "om-product-gallery om-product-gallery--featured" + (hovered ? " om-product-gallery--hovering" : "") + (settings.mode !== 'hover' ? " om-product-gallery--controls-enabled" : "") : "om-product-gallery"} role="group" aria-label={`Fotografías de ${alt}`}
    data-photo-area={esInicio ? 'featured' : esCatalogo ? 'catalog' : 'detail'} data-photo-interval={settings.interval} data-photo-mode={settings.mode} data-photo-transition={settings.transition}
    data-photo-effect-ready={!isOnlineEffectId(settings.transition) || onlineReady === settings.transition ? 'true' : 'false'}
    onPointerEnter={event => { if (!permiteRotacion || event.pointerType !== 'mouse') return; setHovered(true);  }} onPointerLeave={event => {
      setHovered(false);
      if (permiteRotacion && event.pointerType === 'mouse' && settings.mode === 'hover' && hovered) {
        hoverChangeId.current += 1;
        setSelected(0);
        onSelect?.(0);
      }
    }}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}
    onKeyDown={event => { if (count > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); select(current + (event.key === 'ArrowRight' ? 1 : -1)); } }}
    onPointerDown={event => { if (event.pointerType === 'touch') touch.current = { x: event.clientX, y: event.clientY }; }}
    onPointerCancel={() => { touch.current = null; }}
    onPointerUp={event => { const start = touch.current; touch.current = null; if (start && count > 1 && Math.abs(event.clientX - start.x) > 40 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) { select(current + (event.clientX < start.x ? 1 : -1)); suppressClick.current = true; } }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {href ? <Link to={href} className="om-product-gallery__link" aria-label={`Ver ${alt}`}>{image}</Link> : image}
    {count > 1 && (detail || !permiteRotacion || settings.mode !== 'hover') && <>
      <button type="button" className="om-product-gallery__arrow om-product-gallery__arrow--previous" aria-label="Imagen anterior" onClick={() => select(current - 1)}>{detail ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg> : '‹'}</button>
      <button type="button" className="om-product-gallery__arrow om-product-gallery__arrow--next" aria-label="Imagen siguiente" onClick={() => select(current + 1)}>{detail ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg> : '›'}</button>
      {!detail && settings.indicators && <div className="om-product-gallery__dots">{images.map((url, i) => <button key={`${i}:${url}`} type="button" aria-label={`Mostrar imagen ${i + 1}`} aria-current={i === current ? 'true' : undefined} onClick={() => select(i)} />)}</div>}
      {permiteRotacion && desktopPointer && settings.mode === 'automatic' && <button type="button" className="om-product-gallery__pause" aria-label={paused ? 'Reanudar fotografías' : 'Pausar fotografías'} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button>}
    </>}
  </div>;
}
